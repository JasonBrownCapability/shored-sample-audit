import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatPence, formatSessionTime } from "@/lib/format";
import { BookingForm } from "@/components/BookingForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Session = Tables<"sessions">;

export default function Book() {
  const { slug } = useParams();
  const [open, setOpen] = useState<string | null>(null);

  const { data: studio } = useQuery({
    queryKey: ["public-studio", slug],
    queryFn: async () => {
      const { data } = await supabase.from("studios").select("*").eq("slug", slug!).maybeSingle();
      return data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["public-sessions", studio?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("studio_id", studio!.id)
        .eq("published", true)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at");
      return (data ?? []) as Session[];
    },
    enabled: !!studio,
  });

  // Seats already booked per session, so we can show what is left.
  const { data: taken = {}, refetch: refetchTaken } = useQuery({
    queryKey: ["public-taken", sessions.map((s) => s.id).join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("session_id, seats, status")
        .in("session_id", sessions.map((s) => s.id));
      const byId: Record<string, number> = {};
      for (const b of data ?? []) {
        if (b.status === "cancelled") continue;
        byId[b.session_id] = (byId[b.session_id] ?? 0) + b.seats;
      }
      return byId;
    },
    enabled: sessions.length > 0,
  });

  if (!studio) return null;

  return (
    <div className="container max-w-2xl space-y-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold">{studio.name}</h1>
        <p className="text-muted-foreground">Book a class. A {studio.deposit_pct}% deposit holds your seat.</p>
      </div>

      {sessions.map((s) => {
        const left = s.capacity - (taken[s.id] ?? 0);
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatSessionTime(s.starts_at)} · {s.duration_min} min · {formatPence(s.price_pence + s.materials_fee_pence)} per person
              </p>
              {s.description && <p className="text-sm">{s.description}</p>}
            </CardHeader>
            <CardContent>
              {left > 0 ? (
                open === s.id ? (
                  <BookingForm
                    session={s}
                    studio={studio}
                    seatsLeft={left}
                    onBooked={() => {
                      setOpen(null);
                      refetchTaken();
                    }}
                  />
                ) : (
                  <Button onClick={() => setOpen(s.id)}>
                    Book · {left} seat{left === 1 ? "" : "s"} left
                  </Button>
                )
              ) : (
                <WaitlistForm sessionId={s.id} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function WaitlistForm({ sessionId }: { sessionId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("waitlist").insert({ session_id: sessionId, name, email });
    if (error) toast.error(error.message);
    else setDone(true);
  };

  if (done) return <p className="text-sm">You are on the waitlist. We will email you if a seat comes free.</p>;

  return (
    <form onSubmit={join} className="flex flex-col gap-2 md:flex-row">
      <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Button type="submit" variant="outline">Full · join waitlist</Button>
    </form>
  );
}

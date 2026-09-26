import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { draftSessionDescription } from "@/lib/openai";
import { formatPence, formatSessionTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Session = Tables<"sessions">;
type Booking = Pick<Tables<"bookings">, "id" | "session_id" | "seats" | "status" | "customer_name" | "customer_email" | "deposit_pence">;

export default function Sessions() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: studio } = useQuery({
    queryKey: ["my-studio", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("studios").select("*").eq("owner_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", studio?.id],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*").eq("studio_id", studio!.id).order("starts_at");
      return (data ?? []) as Session[];
    },
    enabled: !!studio,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings", studio?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, session_id, seats, status, customer_name, customer_email, deposit_pence")
        .eq("studio_id", studio!.id);
      return (data ?? []) as Booking[];
    },
    enabled: !!studio,
  });

  // Seats taken = every seat on a booking that has not been cancelled.
  const seatsTaken = (sessionId: string) =>
    bookings.filter((b) => b.session_id === sessionId && b.status !== "cancelled").reduce((n, b) => n + b.seats, 0);

  const markPaid = async (bookingId: string) => {
    const { error } = await supabase.from("bookings").update({ status: "confirmed" }).eq("id", bookingId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bookings"] });
  };

  if (!user) return null;
  if (studio === null) return <CreateStudio onCreated={() => qc.invalidateQueries({ queryKey: ["my-studio"] })} />;
  if (!studio) return null;

  return (
    <div className="container space-y-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{studio.name}</h1>
        <a className="text-sm underline" href={`/book/${studio.slug}`} target="_blank" rel="noreferrer">
          Public booking page
        </a>
      </div>

      <NewSession studioId={studio.id} onCreated={() => qc.invalidateQueries({ queryKey: ["sessions"] })} />

      <div className="grid gap-4 md:grid-cols-2">
        {sessions.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatSessionTime(s.starts_at)} · {seatsTaken(s.id)}/{s.capacity} seats · {formatPence(s.price_pence)}
                {s.materials_fee_pence > 0 && ` + ${formatPence(s.materials_fee_pence)} materials`}
                {!s.published && " · draft"}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {bookings
                  .filter((b) => b.session_id === s.id)
                  .map((b) => (
                    <li key={b.id} className="flex items-center justify-between">
                      <span>
                        {b.customer_name} · {b.seats} seat{b.seats > 1 ? "s" : ""} · {b.status}
                      </span>
                      {b.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => markPaid(b.id)}>
                          Deposit paid ({formatPence(b.deposit_pence)})
                        </Button>
                      )}
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CreateStudio({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("studios").insert({
      owner_id: user!.id,
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      contact_email: user!.email!,
    });
    if (error) toast.error(error.message);
    else onCreated();
  };

  return (
    <div className="container max-w-md py-12">
      <h1 className="mb-4 text-2xl font-semibold">Set up your studio</h1>
      <form onSubmit={submit} className="space-y-3">
        <Input placeholder="Studio name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="booking-page-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <Button type="submit">Create studio</Button>
      </form>
    </div>
  );
}

function NewSession({ studioId, onCreated }: { studioId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [durationMin, setDurationMin] = useState(120);
  const [capacity, setCapacity] = useState(8);
  const [price, setPrice] = useState("45.00");
  const [materials, setMaterials] = useState("8.00");
  const [drafting, setDrafting] = useState(false);

  const writeItForMe = async () => {
    setDrafting(true);
    try {
      setDescription(await draftSessionDescription({ title, durationMin, level: "all" }));
    } catch (e) {
      toast.error("Could not draft a description");
    } finally {
      setDrafting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("sessions").insert({
      studio_id: studioId,
      title,
      description,
      starts_at: new Date(startsAt).toISOString(),
      duration_min: durationMin,
      capacity,
      price_pence: Math.round(parseFloat(price) * 100),
      materials_fee_pence: Math.round(parseFloat(materials) * 100),
      published: true,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Class added");
      setTitle("");
      setDescription("");
      onCreated();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a class</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Title, e.g. Wheel throwing for beginners" value={title} onChange={(e) => setTitle(e.target.value)} required className="md:col-span-2" />
          <div className="md:col-span-2 flex gap-2">
            <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button type="button" variant="outline" onClick={writeItForMe} disabled={drafting || !title}>
              <Sparkles className="h-4 w-4" /> Write it for me
            </Button>
          </div>
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          <Input type="number" min={15} step={15} value={durationMin} onChange={(e) => setDurationMin(parseInt(e.target.value))} />
          <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value))} placeholder="Seats" />
          <div className="flex gap-2">
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price £" />
            <Input value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="Materials £" />
          </div>
          <Button type="submit" className="md:col-span-2">Publish class</Button>
        </form>
      </CardContent>
    </Card>
  );
}

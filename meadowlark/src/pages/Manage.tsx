import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatPence, formatSessionTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Reached from the link in the confirmation email: /manage/<token>
export default function Manage() {
  const { token } = useParams();
  const [cancelled, setCancelled] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["manage", token],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, customer_name, seats, total_pence, deposit_pence, status, sessions(title, starts_at), studios(name)")
        .eq("manage_token", token!)
        .maybeSingle();
      return data;
    },
  });

  const cancel = async () => {
    const { error } = await supabase.functions.invoke("cancel-booking", { body: { token } });
    if (error) toast.error("Could not cancel. Please email the studio.");
    else setCancelled(true);
  };

  if (isLoading) return null;
  if (!booking) return <p className="container py-10">We could not find that booking.</p>;

  const status = cancelled ? "cancelled" : booking.status;

  return (
    <div className="container max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle>{booking.sessions?.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {booking.studios?.name} · {formatSessionTime(booking.sessions!.starts_at)}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            {booking.customer_name} · {booking.seats} seat{booking.seats === 1 ? "" : "s"} · {formatPence(booking.total_pence)} · deposit{" "}
            {formatPence(booking.deposit_pence)} · {status}
          </p>
          {status !== "cancelled" && (
            <Button variant="destructive" onClick={cancel}>Cancel my booking</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

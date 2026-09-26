import { useQuery } from "@tanstack/react-query";
import { supabaseAdmin } from "@/integrations/supabase/admin";
import { formatPence, formatSessionTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Founder-only overview of every studio on Meadowlark. Uses the admin client
// because the founder's own studio account only sees its own rows under RLS.
export default function Overview() {
  const { data: studios = [] } = useQuery({
    queryKey: ["admin-studios"],
    queryFn: async () => {
      const { data } = await supabaseAdmin.from("studios").select("id, name, slug, contact_email, created_at").order("created_at");
      return data ?? [];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data } = await supabaseAdmin
        .from("bookings")
        .select("id, studio_id, customer_name, customer_email, seats, total_pence, status, created_at, sessions(title, starts_at)")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const revenue = bookings.filter((b) => b.status === "confirmed").reduce((n, b) => n + b.total_pence, 0);

  return (
    <div className="container space-y-6 py-8">
      <h1 className="text-2xl font-semibold">All studios</h1>
      <p className="text-sm text-muted-foreground">
        {studios.length} studios · {bookings.length} recent bookings · {formatPence(revenue)} confirmed
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {studios.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.name}</CardTitle>
              <p className="text-sm text-muted-foreground">/book/{s.slug} · {s.contact_email}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {bookings
                  .filter((b) => b.studio_id === s.id)
                  .slice(0, 5)
                  .map((b) => (
                    <li key={b.id}>
                      {b.customer_name} ({b.customer_email}) · {b.sessions?.title} · {formatSessionTime(b.sessions!.starts_at)} ·{" "}
                      {formatPence(b.total_pence)} · {b.status}
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

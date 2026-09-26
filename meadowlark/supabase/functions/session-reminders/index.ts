import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Runs once a day from a cron job (pg_cron -> pg_net) and emails everyone
// booked on a class that starts in the next 24 to 48 hours.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET");

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const from = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const to = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  const { data: due, error } = await supabase
    .from("bookings")
    .select("id, customer_name, customer_email, manage_token, sessions!inner(title, starts_at), studios(name)")
    .is("reminder_sent_at", null)
    .neq("status", "cancelled")
    .gte("sessions.starts_at", from)
    .lt("sessions.starts_at", to);

  if (error) {
    console.error("query failed", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  for (const b of due ?? []) {
    console.log("reminding", b.customer_email, "for booking", b.id, b);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${b.studios.name} via Meadowlark <bookings@meadowlark.example>`,
        to: [b.customer_email],
        subject: `Reminder: ${b.sessions.title} tomorrow`,
        html: `<p>Hi ${b.customer_name}, a reminder that <strong>${b.sessions.title}</strong> is tomorrow at ${new Date(b.sessions.starts_at).toLocaleTimeString("en-GB", { timeStyle: "short" })}. See you there.</p>`,
      }),
    });
    if (res.ok) {
      await supabase.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
      sent++;
    } else {
      console.error("resend error", res.status, await res.text());
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});

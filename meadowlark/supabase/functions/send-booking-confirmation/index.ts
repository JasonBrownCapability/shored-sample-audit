import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://meadowlark.example";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("send-booking-confirmation payload", JSON.stringify(body));
    const { booking_id, email, manage_token } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, customer_name, seats, total_pence, deposit_pence, sessions(title, starts_at), studios(name, contact_email)")
      .eq("id", booking_id)
      .single();

    if (error || !booking) {
      throw new Error(error?.message ?? "booking not found");
    }

    const manageUrl = `${APP_URL}/manage/${manage_token}`;
    const when = new Date(booking.sessions.starts_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });

    const html = `
      <p>Hi ${booking.customer_name},</p>
      <p>You're booked on <strong>${booking.sessions.title}</strong> at ${booking.studios.name} on ${when}.</p>
      <p>${booking.seats} seat(s), total £${(booking.total_pence / 100).toFixed(2)}.
         Please pay the £${(booking.deposit_pence / 100).toFixed(2)} deposit to the studio to confirm your place.</p>
      <p>Need to cancel? <a href="${manageUrl}">Manage your booking</a>.</p>
      <p>Questions: ${booking.studios.contact_email}</p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${booking.studios.name} via Meadowlark <bookings@meadowlark.example>`,
        to: [email],
        subject: `You're booked: ${booking.sessions.title}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error("resend error", res.status, await res.text());
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-booking-confirmation failed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

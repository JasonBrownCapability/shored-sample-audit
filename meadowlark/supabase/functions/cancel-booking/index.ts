import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Called from /manage/<token>. The token from the confirmation email is the
// only thing that identifies the booking; no account needed.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { token } = await req.json();
  if (typeof token !== "string" || token.length < 16) {
    return new Response(JSON.stringify({ error: "bad token" }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("manage_token", token)
    .neq("status", "cancelled")
    .select("id");

  if (error) {
    console.error("cancel failed", error.message);
    return new Response(JSON.stringify({ error: "cancel failed" }), { status: 500, headers: corsHeaders });
  }
  if (!data || data.length === 0) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

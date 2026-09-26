import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Admin client for the /admin overview page. RLS was hiding other studios'
// rows from the founder account, so this uses the service role key which
// bypasses RLS. Only imported by src/pages/admin/Overview.tsx.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

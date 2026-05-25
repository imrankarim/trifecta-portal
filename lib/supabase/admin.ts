// Supabase ADMIN client — uses the service_role key.
// BYPASSES Row-Level Security. ONLY import this from server-side code
// (Route Handlers, Server Actions, Cron jobs). NEVER from a Client Component.
//
// Use this for:
//   - Scheduled sync jobs (HubSpot, Google Sheets)
//   - Admin operations that span chapters (Phase 3+)
//   - Bootstrapping the initial Admin user
//
// Do NOT use this for ordinary user-facing queries — they MUST go through
// the RLS-bound client to honor v1.1 §2.5 chapter isolation.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

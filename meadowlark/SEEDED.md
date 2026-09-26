# Seeded failure modes (private key)

Meadowlark is a synthetic codebase built for the sample enforcement-tier audit in
`docs/sample-audit/`. Nothing in it is real: no real company, project, person, key
or production database. Every key in `.env` is a placeholder with `EXAMPLE` in it.

The failure modes below were planted deliberately, in the shape an AI coding agent
leaves them when it makes an error go away. The audit report was written against
this tree without reference to this file, then checked against it.

| # | Failure mode | Where |
|---|---|---|
| 1 | Table with RLS never enabled | `supabase/migrations/20250702141500_waitlist.sql` (no `enable row level security`); confirmed absent from `supabase/schema-dump.sql:146-151` |
| 2 | RLS enabled but a permissive `using (true)` policy for anon and authenticated, added to silence a 401 | `supabase/migrations/20250709101200_fix_booking_insert.sql:1-5`; comment echoed at `src/components/BookingForm.tsx:76` |
| 3 | Service-role key read in client code and used to bypass RLS for an admin screen | `src/integrations/supabase/admin.ts:8-10`, `src/pages/admin/Overview.tsx:2,12,20`; client-side gate at `src/App.tsx:15-27` |
| 4 | Committed `.env` with fake keys; `.gitignore` added in a later commit, file still tracked | `.env` (commit `f71d3ea`), `.gitignore:22` (commit `ddb7519`) |
| 5 | Two tables created in production only, missing from migrations, referenced from code and the generated types | `gift_vouchers` and `customer_notes`: `supabase/schema-dump.sql:77-95`, `src/components/BookingForm.tsx:41-46`, `src/pages/Customers.tsx:44,70`, `src/integrations/supabase/types.ts:66,120`. Also the prod-only column `bookings.voucher_code` (`schema-dump.sql:62`, `types.ts:28`) and the prod-only policy `gift_vouchers_public_read` (`schema-dump.sql:161`) |
| 6 | Business logic in a component that must run before a write, with no DB equivalent | Price: `src/components/BookingForm.tsx:63-66,86-87`. Capacity: `BookingForm.tsx:70-73`, count at `src/pages/Book.tsx:44-56` (formula duplicated at `src/pages/Sessions.tsx:51-53`). Voucher never debited: no write to `balance_pence` anywhere in `src/` |
| 7 | Edge function logs the full request body including an email and a token | `supabase/functions/send-booking-confirmation/index.ts:17-19`; sibling logs the whole booking row at `supabase/functions/session-reminders/index.ts:37` |
| 8 | Exposed `security definer` RPC callable by anon that returns rows across tenants | `supabase/migrations/20250715163000_lookup_customer.sql` (`ilike` on the raw parameter at line 13); called at `src/components/BookingForm.tsx:31` |
| 9 | No tests except one trivial Vitest test; CI runs only `npm run build` | `src/lib/format.test.ts`; `.github/workflows/build.yml:17-18` |
| 10 | LLM call from the browser with `VITE_OPENAI_API_KEY` | `src/lib/openai.ts:4,11,15`; used from `src/pages/Sessions.tsx:154` |

Extras that fell out of writing it realistically, also in the report:

- `send-booking-confirmation` takes the recipient address and the manage token from
  the request body (`index.ts:19,36,53`) with `verify_jwt = false` (`config.toml:3-4`).
- The client never checks a voucher belongs to the studio being booked
  (`BookingForm.tsx:41-46` filters by code only).
- Customer emails are lowercased by the bookings trigger (`20250611120000_init.sql:98`)
  but not by the owner's add-customer form (`src/pages/Customers.tsx:54-59`).
- The reminder function selects, sends, then marks; no claim step
  (`session-reminders/index.ts:24-50`).
- GitHub Actions steps are pinned by tag, not SHA (`build.yml:12-13`).
- The README claims RLS is on for every important table (`README.md:35-36`).

Things that are correct on purpose, so the Tier 1 inventory has something to say:
owner policies on `studios`, `sessions`, `customers`, `customer_notes`, `gift_vouchers`;
`sessions_public_read` limited to `published = true`; the customer-upsert trigger;
`manage_token` default and unique index; the CHECK constraints; the cron secret on
`session-reminders`; the token-scoped update in `cancel-booking`.

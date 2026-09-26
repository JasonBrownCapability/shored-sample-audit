# Meadowlark: enforcement-tier audit

Sample report on a synthetic codebase. Meadowlark, its founder, its studios and every key in its repository are fictional. The codebase is at `samples/meadowlark/` in this repository and was seeded with the failure modes that AI coding agents leave behind; the report was written against the tree, not the seed list. It is the report a founder receives at the end of the £550 day.

| | |
|---|---|
| Prepared for | The founder of Meadowlark (class bookings and deposits for small pottery studios) |
| Prepared by | Jason Brown, Shored |
| Date | 26 September 2026 |
| Inputs | Repository at commit `e841fee` (42 files, 33 of them source), read-only. `supabase/schema-dump.sql`, a dump of the production schema the founder pulled on 19 September 2026. No production data was read. |
| Stack | React 18, Vite, TypeScript, Tailwind, Supabase (Postgres, Auth, three Deno edge functions), Resend, OpenAI. Built with Lovable. |
| Paths | Relative to the Meadowlark repository root. `file:12-15` means lines 12 to 15. |

## 1. Summary

Meadowlark works, and the owner-facing half of it is protected the way the README says: a studio owner cannot see another studio's classes, customers or notes, because the database refuses to show them. The public booking page is where the problems are. To make the booking form, the seat counter, the returning-customer autofill and the gift-voucher box work without errors, four things were opened that should not have been: the bookings table can be read and edited by anyone holding the app's public key (which is everyone who has loaded the page), a database function hands back every customer of every studio to anyone who asks, the gift-voucher list is readable by anyone, and the waitlist has no protection at all. Separately, the secret key that bypasses every one of these protections is shipped inside the app's JavaScript, alongside the OpenAI key, and both are in the git history. None of this needs a rewrite. Each item has a fix of between ten minutes and two days, and the sprint that closes all of them fits inside the fixed ten-day total.

The three numbers:

| Load-bearing quirks found | Tier 1 (enforced by a mechanism) | Tier 2 (pinned by a test) | Tier 3 (prose only) |
|---|---|---|---|
| 23 | 7 | 1 | 15 |

The number that matters is 15. Of those, 7 are live exposures today; 8 are places where the next prompt to Lovable, or the next concurrent customer, produces wrong-but-plausible data without anyone noticing.

## 2. If you do one thing today

Revoke the secret key that is in the browser bundle.

`.env:4` holds `VITE_SUPABASE_SERVICE_ROLE_KEY`. Anything prefixed `VITE_` is compiled into the JavaScript that every visitor downloads, and `src/integrations/supabase/admin.ts:8-10` uses it to build a client that bypasses row-level security. Anyone who opens the browser's developer tools on `/book/<any-studio>` can copy that key and then read, change or delete every row in every table, and list or create users through the Auth admin API. The `/admin` route check at `src/App.tsx:15-27` does not help: it decides which React component to show, and the key is in the bundle whether or not the component renders.

The fix, about 20 minutes:

1. Supabase dashboard, Project Settings, API Keys. Find the secret key whose value matches `.env:4` and revoke it. The key is in the newer `sb_secret_` format, so it can be revoked on its own without touching the publishable key or signing anyone out. (If a project is still on legacy JWT keys, the equivalent is rotating the JWT secret, which also invalidates the anon key and logs every user out; that is not the case here.)
2. Delete `VITE_SUPABASE_SERVICE_ROLE_KEY` from `.env`, from the Lovable project's environment settings and from the hosting environment. Delete `src/integrations/supabase/admin.ts`. Publish.
3. The three edge functions are unaffected: they read the `SUPABASE_SERVICE_ROLE_KEY` that Supabase injects into the function runtime (`supabase/functions/*/index.ts`), which is a different credential.

After step 2 the `/admin` overview stops working until sprint item 1 rebuilds it behind an edge function. That is the right trade.

Same afternoon, in the SQL editor, each under two minutes and none of them breaks the booking page:

- `drop function public.lookup_customer(text);` closes the cross-studio customer export (finding 3). The autofill at `src/components/BookingForm.tsx:31` starts returning nothing, and the form ignores that.
- The waitlist SQL under finding 5 turns on row-level security for `waitlist` and keeps the join-waitlist button working.
- Rotate the OpenAI key at platform.openai.com and remove `VITE_OPENAI_API_KEY` from the same three places. The "Write it for me" button stops working until sprint item 1. If that button matters more than the spend risk, leave it for the sprint but set a hard monthly limit on the OpenAI account today.

The bookings policy (finding 2) is the one live exposure that cannot be closed in ten minutes without breaking the booking page, because three client call sites depend on it. Section 3 gives the interim option and what it costs.

## 3. Tier 3: protected by prose alone

Sorted by blast radius. "Live" means the violation has already happened and is exploitable today. Sizes are for the promotion: S is half a day, M one day, L two days.

| # | Quirk (the rule that should hold) | Where it lives | What it costs if violated | Cheapest adequate promotion | Size |
|---|---|---|---|---|---|
| 1 | The service-role key never reaches the browser | `.env:4`, `src/integrations/supabase/admin.ts:8-10`, `src/pages/admin/Overview.tsx:2,12,20` | Live. Every row of every table readable and writable; Auth admin API open | Revoke, delete the admin client, rebuild `/admin` as an edge function behind a `platform_admins` table; CI grep that fails on `VITE_*SECRET|SERVICE_ROLE|API_KEY` | M |
| 2 | Bookings are visible only to the studio that owns them | `supabase/migrations/20250709101200_fix_booking_insert.sql:2-5`; dependents `BookingForm.tsx:77-92`, `src/pages/Book.tsx:44-56`, `src/pages/Manage.tsx:18-22` | Live. Name, email, phone and notes of every booking at every studio readable; any booking can be confirmed, cancelled or deleted by anyone | Drop the policy; move the write into `create_booking()`, the seat count into a view, the manage page into `get_booking_by_token()` | L |
| 3 | Customers are visible only to their own studio | `supabase/migrations/20250715163000_lookup_customer.sql:4-14` (`ilike` at 13); called at `BookingForm.tsx:31` | Live. `rpc/lookup_customer` with `p_email = '%'` returns every customer row in the database, 1,000 per page | Drop the function; revoke default execute on new functions | S |
| 4 | Gift-voucher codes and balances are visible only to their studio | `supabase/schema-dump.sql:161` (production only); read at `BookingForm.tsx:41-46` | Live. Every unredeemed code, balance and purchaser email readable; free classes at any studio | Drop the read policy; replace with `validate_voucher(code, studio_id)` exact-match function | S |
| 5 | Waitlist entries are visible only to the studio | `supabase/migrations/20250702141500_waitlist.sql:3-11` (no RLS); `Book.tsx:115` | Live. Every waitlist name and email readable and deletable | Enable RLS; insert-only policy for the public, owner policy for reads | S |
| 6 | Secrets are never committed | `.env:1-6` tracked since commit `e48ceb9`; `.gitignore:22` added in `e841fee` | Live. Four credentials in every clone, fork and Lovable export of the repository, for ever | `git rm --cached .env`, rotate, `.env.example`, gitleaks in CI | S |
| 7 | The OpenAI key never reaches the browser | `src/lib/openai.ts:4,11,15`; `.env:5`; called from `src/pages/Sessions.tsx:154` | Live. Anyone can spend against the founder's OpenAI account up to its hard limit | Move the call into a `describe-session` edge function with JWT verification | S |
| 8 | A booking's total equals seats × (price + materials) − voucher | `BookingForm.tsx:63-66,86-87`; only guard is `total_pence >= 0` at `20250611120000_init.sql:47` | Any caller can book at £0; the admin revenue figure (`Overview.tsx:29`) sums client-supplied numbers | Compute the total inside `create_booking()`; the client's number is never stored | L (shared with 9, 10) |
| 9 | Seats booked never exceed the class capacity | `BookingForm.tsx:70-73,115`; count at `Book.tsx:44-56`; same formula copied at `Sessions.tsx:51-53` | Two customers booking the last seat at the same time both succeed; a caller can skip the check entirely | `create_booking()` locks the session row and re-counts; `session_availability` view replaces both copies of the formula | shared |
| 10 | A voucher's balance goes down when it is used | Read at `BookingForm.tsx:41-46,64`; `voucher_code` stored at `:89`; no write to `balance_pence` anywhere in `src/` | One voucher pays for unlimited classes; the client also never checks the voucher belongs to the studio being booked | `create_booking()` debits the voucher in the same transaction, scoped to the studio | shared |
| 11 | A confirmation email goes only to the person who made the booking | `supabase/functions/send-booking-confirmation/index.ts:19,36,53`; `supabase/config.toml:3-4` | Anyone can send templated emails from the studio's sending address to any recipient, with a link path of their choosing | Trigger the function from a database webhook; take the recipient from the booking row | M (shared with 12) |
| 12 | Manage tokens and customer emails never reach the logs | `send-booking-confirmation/index.ts:18`; sibling `session-reminders/index.ts:37` logs the whole row including `manage_token` (selected at `:24`) | Anyone with log access can cancel any upcoming booking; personal data sits in logs for the retention period | Log ids only; a Deno test with a console spy pins it | shared |
| 13 | The schema in `supabase/migrations/` is the schema in production | Two tables, one column and three policies exist only in `schema-dump.sql:62,77-95,160-162`; the generated types already know them (`types.ts:28,66,120`) | `supabase db reset` yields a database the app cannot run against; any hardening migration written from the repo fails on production | Baseline migration from the dump; CI job that applies migrations to an empty database and diffs against production | M |
| 14 | Customer emails are stored lower-case | Trigger lowercases at `20250611120000_init.sql:98`; owner's form does not at `src/pages/Customers.tsx:54-59` | Duplicate customer records; `unique (studio_id, email)` at `init.sql:36` cannot catch case variants | `check (email = lower(email))` after a one-off clean-up | S |
| 15 | A reminder is sent once per booking | `session-reminders/index.ts:24-50` selects, sends, then marks | A duplicate reminder email if two runs overlap | Leave as prose: one daily run, one duplicate email at worst. The claim-update is one line if the schedule ever tightens | none |

### 3.1 The service-role key in the browser bundle

`src/integrations/supabase/admin.ts:8` reads `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY` and line 10 builds a Supabase client with it. `src/pages/admin/Overview.tsx:2` imports that client and uses it at lines 12 and 20 to list every studio and the 200 most recent bookings across all of them. The comment at `admin.ts:4-6` says why: "RLS was hiding other studios' rows from the founder account, so this uses the service role key which bypasses RLS."

Vite inlines every `VITE_`-prefixed variable into the production bundle. The route guard at `src/App.tsx:23-27` compares `user.email` to `founder@meadowlark.example` before rendering the page; it does nothing to the bundle, and the admin client module is imported unconditionally from `App.tsx:10`. Every visitor's browser already has the key.

What it costs: the key bypasses row-level security on all seven tables, and it authorises the Auth admin endpoints (list users, create users, change passwords). The other fourteen findings in this table are moot while this one stands.

Promotion (M): the steps in section 2, then rebuild the overview as an edge function.

```sql
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;
-- No policies on purpose: only the service role, inside edge functions, reads it.
```

The `admin-overview` function runs with `verify_jwt = true`, calls `supabase.auth.getUser()` with the caller's token, checks the user id against `platform_admins`, and only then queries with the injected service-role key. `Overview.tsx` calls `supabase.functions.invoke("admin-overview")` instead of importing a client. Add to `.github/workflows/build.yml`:

```yaml
      - name: No secrets compiled into the bundle
        run: "! grep -rEn 'VITE_[A-Z_]*(SECRET|SERVICE_ROLE|API_KEY)' src .env.example"
```

What I looked for before calling this prose-only: any build-time check on environment variable names (none; `vite.config.ts` has no `define` or env filtering), any test touching `admin.ts` (none; the only test file is `src/lib/format.test.ts`), any server-side gate on `/admin` (none; the gate is a React component).

### 3.2 Bookings readable and writable by the public

`supabase/migrations/20250709101200_fix_booking_insert.sql` in full:

```sql
-- fix: allow inserts, was getting 401 from the public booking page
create policy "bookings_public_all" on public.bookings
  for all to anon, authenticated
  using (true)
  with check (true);
```

`for all` grants select, insert, update and delete. `using (true)` means every row passes. The policy is live in production (`schema-dump.sql:159`). The 401 it silenced was the correct answer: the original `bookings_owner_all` policy (`20250611120000_init.sql:84-87`) only lets a studio owner touch their own rows, and the public booking page runs as `anon`.

Three client sites now depend on the hole. `BookingForm.tsx:77-92` inserts the booking and reads back `id, manage_token` (line 91); `Book.tsx:44-56` reads every booking for the listed sessions to compute seats left; `Manage.tsx:18-22` reads a booking by its token. Each of these is a legitimate need met by the wrong mechanism.

What it costs: with the publishable key from `.env:3` (which is meant to be public) and no login, `GET /rest/v1/bookings?select=*` returns every booking at every studio: `customer_name`, `customer_email`, `customer_phone`, `notes` (whose placeholder at `BookingForm.tsx:117` invites access needs and allergies, which is health data under UK GDPR), `manage_token`, and the amounts. `PATCH` with `status=confirmed` marks any booking paid; `DELETE` removes any booking. The insert also accepts any `studio_id`, so a booking can be filed against a studio that does not own the session.

Promotion (L, covers 8, 9 and 10 as well): drop the policy and give the public page three narrow doors.

```sql
drop policy "bookings_public_all" on public.bookings;
-- No policy for anon on bookings after this. Public access goes through:
--   create_booking()        the only way to insert (section 3.8)
--   session_availability    seats left per published session (section 3.9)
--   get_booking_by_token()  the manage page (below)

create or replace function public.get_booking_by_token(p_token text)
returns table (
  id uuid, customer_name text, seats integer, total_pence integer,
  deposit_pence integer, status text, session_title text,
  starts_at timestamptz, studio_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select b.id, b.customer_name, b.seats, b.total_pence, b.deposit_pence, b.status,
         s.title, s.starts_at, st.name
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.studios st on st.id = b.studio_id
  where b.manage_token = p_token;
$$;
revoke execute on function public.get_booking_by_token(text) from public;
grant execute on function public.get_booking_by_token(text) to anon, authenticated;
```

Exact match on a 128-bit token is not enumerable; `ilike` would be (see 3.3). `Manage.tsx:18-22` becomes `supabase.rpc("get_booking_by_token", { p_token: token }).maybeSingle()`.

Interim option, if the founder wants the exposure closed before the sprint reaches this item: replace the policy with insert-only and remove `.select("id, manage_token")` at `BookingForm.tsx:91` (Postgres checks select policies on `insert ... returning`, so the insert fails otherwise). Bookings keep working. Until the sprint, the seat counter shows full capacity, the manage link shows "could not find that booking", and no confirmation email is sent because the client no longer has the token. My recommendation is to take the interim: two days of a degraded booking page against the contact details of every customer of fourteen studios.

```sql
drop policy "bookings_public_all" on public.bookings;
create policy "bookings_public_insert" on public.bookings
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.published and s.studio_id = bookings.studio_id
    )
  );
```

What I looked for: a select policy narrower than `true` on `bookings` in either the migrations or the dump (none), a test exercising the anon role against `bookings` (none), and a database-side check that `studio_id` matches the session's studio (none; there is a foreign key to each table separately at `init.sql:41-42` but no compound constraint).

### 3.3 `lookup_customer` returns every customer to anyone

`supabase/migrations/20250715163000_lookup_customer.sql:4-14`:

```sql
create or replace function public.lookup_customer(p_email text)
returns setof public.customers
language sql
security definer
set search_path = public
stable
as $$
  select c.*
  from public.customers c
  where c.email ilike p_email;
$$;
```

`security definer` runs the query as the function's owner, so row-level security on `customers` does not apply. Postgres grants execute on new functions to `public` by default, so `anon` can call it through `POST /rest/v1/rpc/lookup_customer`. `ilike` was chosen for case-insensitivity, and it also treats `%` and `_` in the parameter as wildcards. `{"p_email": "%"}` returns the whole table: `id, studio_id, name, email, phone, marketing_opt_in` for every customer of every studio, in pages of 1,000 (Supabase's default `db-max-rows`). No filter on `studio_id` was ever intended, so even a fixed pattern returns one person's records across every studio they have ever booked with.

The caller at `BookingForm.tsx:31` uses it to autofill name and phone when a returning customer types their email.

Promotion (S): drop it, and stop the next one being public by default.

```sql
drop function public.lookup_customer(text);
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
```

The second statement applies to functions created from now on by the role that runs it (the `postgres` role, which is what the dashboard SQL editor and the CLI use), so a future `security definer` function has to be granted to `anon` on purpose. The autofill is a convenience worth two form fields; I would not rebuild it. If the founder wants it back, the safe shape is a function that takes the exact email and a `studio_id` and returns only `name, phone` for that one studio, which still lets anyone with a known email fetch that person's phone number, so I would still not build it.

What I looked for: an `execute` revoke or grant anywhere in the migrations or the dump (none), a `studio_id` parameter (none), a test calling the RPC as `anon` (none).

### 3.4 Gift vouchers readable by the public

Production only, `schema-dump.sql:161`:

```sql
CREATE POLICY gift_vouchers_public_read ON public.gift_vouchers FOR SELECT TO anon, authenticated USING (true);
```

The table (`schema-dump.sql:77-87`) holds `code, initial_pence, balance_pence, purchaser_email, expires_at`. The booking form reads it at `BookingForm.tsx:41-46` by exact code to show the balance. `GET /rest/v1/gift_vouchers?select=code,balance_pence&balance_pence=gt.0` lists every live voucher at every studio.

What it costs: a voucher code is money. Every unredeemed balance can be spent by a stranger, at any studio (the client filters by code only, never by `studio_id`), and because of finding 10 it can be spent repeatedly. `purchaser_email` is personal data as well.

Promotion (S):

```sql
drop policy "gift_vouchers_public_read" on public.gift_vouchers;

create or replace function public.validate_voucher(p_code text, p_studio_id uuid)
returns table (code text, balance_pence integer, expires_at date)
language sql
security definer
set search_path = public
stable
as $$
  select v.code, v.balance_pence, v.expires_at
  from public.gift_vouchers v
  where v.code = upper(trim(p_code))
    and v.studio_id = p_studio_id
    and v.balance_pence > 0
    and (v.expires_at is null or v.expires_at >= current_date);
$$;
revoke execute on function public.validate_voucher(text, uuid) from public;
grant execute on function public.validate_voucher(text, uuid) to anon, authenticated;
```

`BookingForm.tsx:41-46` becomes `supabase.rpc("validate_voucher", { p_code: code, p_studio_id: studio.id }).maybeSingle()`. One code per call, exact match, scoped to the studio. Codes should be at least 10 random characters; the sample has no generator, so the sprint adds one when it adds the owner's voucher page.

What I looked for: any narrower policy on `gift_vouchers` (only `gift_vouchers_owner_all` at `schema-dump.sql:160`, which is correct, and the public read that undoes it), a `studio_id` filter at the call site (none).

### 3.5 Waitlist without row-level security

`supabase/migrations/20250702141500_waitlist.sql` creates the table and an index and stops. There is no `alter table ... enable row level security`, and the production dump confirms it: `schema-dump.sql:146-151` enables RLS on six tables and `waitlist` is not among them. Supabase grants the `anon` and `authenticated` roles full privileges on new tables in `public`, so a table without RLS is fully open through the REST API.

`Book.tsx:115` inserts into it from the public page. Nothing in `src/` reads it: the migration comment says entries are "read by the studio owner on the sessions page", and `Sessions.tsx` has no such query. The waitlist is write-only today.

What it costs: every name and email on every waitlist is readable, editable and deletable by anyone.

Promotion (S), safe to run today:

```sql
alter table public.waitlist enable row level security;

create policy "waitlist_public_insert" on public.waitlist
  for insert to anon, authenticated
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.published));

create policy "waitlist_owner_all" on public.waitlist
  for all to authenticated
  using (session_id in (
    select s.id from public.sessions s
    join public.studios st on st.id = s.studio_id
    where st.owner_id = auth.uid()))
  with check (session_id in (
    select s.id from public.sessions s
    join public.studios st on st.id = s.studio_id
    where st.owner_id = auth.uid()));
```

The insert at `Book.tsx:115` has no `.select()`, so it keeps working with an insert-only policy.

What I looked for: RLS enabled in a later migration (none of the five), in the dump (absent), any test (none).

### 3.6 Secrets committed, and still tracked

`.env` was added in commit `e48ceb9` with six values: the project id and URL (public), the publishable key (`.env:3`, public by design), the service-role secret (`.env:4`), the OpenAI key (`.env:5`) and the Resend key (`.env:6`). Commit `e841fee` added `.gitignore` with `.env` on line 22. Adding a path to `.gitignore` does not untrack a file that is already committed; `git ls-files` still lists `.env`, and it is in both commits' trees.

What it costs: everyone who has ever cloned, forked or exported the repository has all four keys. Lovable's GitHub sync means the founder's GitHub account, and any collaborator's, holds them. Rotation is the only remedy; deleting the file from the tip changes nothing about the history.

Promotion (S): rotate all three secrets (section 2 covers two; the Resend key is rotated at resend.com and set with `supabase secrets set RESEND_API_KEY=...`), then

```
git rm --cached .env
git commit -m "Stop tracking .env"
```

and commit a `.env.example` with names only. Add a secret scan to CI, pinned by SHA:

```yaml
      - uses: gitleaks/gitleaks-action@<full commit sha>
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

I would not rewrite history. Once the keys are dead the history is harmless, and rewriting a Lovable-synced repository breaks the sync.

What I looked for: a pre-commit hook or CI step scanning for secrets (none), `.env.example` (none).

### 3.7 OpenAI key in the browser

`src/lib/openai.ts:4` reads `import.meta.env.VITE_OPENAI_API_KEY`; line 11 calls `https://api.openai.com/v1/chat/completions` directly from the browser with the key in the `Authorization` header at line 15. `Sessions.tsx:154` calls it from the "Write it for me" button.

What it costs: the key is in the bundle. Anyone can make requests against the founder's OpenAI account until the account's hard limit; if no hard limit is set, until the card declines.

Promotion (S): a `describe-session` edge function with `verify_jwt = true` (the button is only on the logged-in owner page), `OPENAI_API_KEY` set with `supabase secrets set`, and `openai.ts` reduced to `supabase.functions.invoke("describe-session", { body })`. The CI grep from 3.1 pins the class of mistake.

What I looked for: a proxy function in `supabase/functions/` (the three that exist are for email and cancellation), any allow-listed origin on the OpenAI side (OpenAI keys have none).

### 3.8 The booking total is computed in the browser

`BookingForm.tsx:63-66`:

```ts
const gross = seats * (session.price_pence + session.materials_fee_pence);
const discount = Math.min(voucher?.balance_pence ?? 0, gross);
const total = gross - discount;
const deposit = Math.round((total * studio.deposit_pct) / 100);
```

Lines 86 and 87 send `total` and `deposit` to the database as `total_pence` and `deposit_pence`. The only constraints on those columns are `>= 0` (`20250611120000_init.sql:47-48`). The database has no idea what the total should be.

What it costs: a request with `total_pence: 0, deposit_pence: 0` is a valid booking. The owner sees a pending booking with a £0 deposit and marks it paid or does not; either way the records are wrong. `Overview.tsx:29` sums `total_pence` for confirmed bookings as revenue, so the founder's own numbers are whatever clients chose to send.

Promotion (L, one function for 8, 9 and 10): the client stops sending money at all.

```sql
create or replace function public.create_booking(
  p_session_id uuid,
  p_seats integer,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_voucher_code text
)
returns table (booking_id uuid, total_pence integer, deposit_pence integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.sessions%rowtype;
  st         public.studios%rowtype;
  v_taken    integer;
  v_gross    integer;
  v_balance  integer;
  v_discount integer := 0;
  v_total    integer;
  v_deposit  integer;
  v_id       uuid;
begin
  if p_seats is null or p_seats < 1 then
    raise exception 'seats must be at least 1';
  end if;

  -- Lock the class row: two bookings for the same class queue here.
  select * into s from public.sessions
   where id = p_session_id and published
   for update;
  if not found then
    raise exception 'class not available';
  end if;
  select * into st from public.studios where id = s.studio_id;

  select coalesce(sum(seats), 0) into v_taken
    from public.bookings
   where session_id = s.id and status <> 'cancelled';
  if v_taken + p_seats > s.capacity then
    raise exception 'only % seat(s) left', s.capacity - v_taken;
  end if;

  v_gross := p_seats * (s.price_pence + s.materials_fee_pence);

  if nullif(trim(p_voucher_code), '') is not null then
    select balance_pence into v_balance
      from public.gift_vouchers
     where code = upper(trim(p_voucher_code))
       and studio_id = s.studio_id
       and (expires_at is null or expires_at >= current_date)
     for update;
    if not found or v_balance <= 0 then
      raise exception 'voucher not recognised';
    end if;
    v_discount := least(v_balance, v_gross);
    update public.gift_vouchers
       set balance_pence = balance_pence - v_discount
     where code = upper(trim(p_voucher_code));
  end if;

  v_total   := v_gross - v_discount;
  v_deposit := round(v_total * st.deposit_pct / 100.0);

  insert into public.bookings
    (studio_id, session_id, customer_name, customer_email, customer_phone,
     seats, total_pence, deposit_pence, notes, voucher_code)
  values
    (s.studio_id, s.id, p_name, lower(trim(p_email)), nullif(trim(p_phone), ''),
     p_seats, v_total, v_deposit, nullif(trim(p_notes), ''), upper(trim(p_voucher_code)))
  returning id into v_id;

  return query select v_id, v_total, v_deposit;
end;
$$;

revoke execute on function public.create_booking(uuid, integer, text, text, text, text, text) from public;
grant execute on function public.create_booking(uuid, integer, text, text, text, text, text) to anon, authenticated;
```

`BookingForm.tsx:77-92` becomes one `supabase.rpc("create_booking", {...})` call and shows the returned total and deposit. The function derives `studio_id` from the session, so the mismatch noted in 3.2 cannot happen either. It does not return `manage_token`; the confirmation email moves server-side (3.11).

What I looked for: a trigger or check computing `total_pence` (none in the migrations or the dump; the only trigger is the customer upsert at `init.sql:106-108`), a test on the pricing arithmetic (none; `format.test.ts` tests display only).

### 3.9 Capacity is checked in the browser only

`BookingForm.tsx:70-73` refuses the submit if `seats > seatsLeft`, and line 115 sets `max={seatsLeft}` on the input. `seatsLeft` comes from `Book.tsx:44-56`, which sums `seats` over non-cancelled bookings fetched when the page loaded. The owner's page computes the same thing independently at `Sessions.tsx:51-53`.

What it costs: two customers who load the page with one seat left both see one seat left and both book. Anyone who skips the form and posts to `/rest/v1/bookings` books as many seats as they like. The database constraint `capacity > 0` at `init.sql:21` is about the class, not the bookings against it. Two copies of the seats-taken formula means they drift the first time one is edited.

Promotion: `create_booking()` above takes `for update` on the session row, so concurrent bookings for the same class serialise, and it re-counts inside the lock. For display, one view replaces both copies of the formula:

```sql
create view public.session_availability as
  select s.id as session_id,
         s.capacity - coalesce(sum(b.seats) filter (where b.status <> 'cancelled'), 0)::integer as seats_left
  from public.sessions s
  left join public.bookings b on b.session_id = s.id
  where s.published
  group by s.id;
grant select on public.session_availability to anon, authenticated;
```

The view runs with its owner's privileges (the Postgres default), which is deliberate here: it exposes two integers per published class and nothing else. Supabase's linter will flag it as a security-definer view; that is the one case where the flag is accepted, and the reason belongs in the migration as a comment.

What I looked for: a trigger on `bookings` insert comparing against capacity (none), an exclusion or check constraint (none), a test (none).

### 3.10 Voucher balances never go down

`BookingForm.tsx:64` applies `voucher.balance_pence` to the total and line 89 stores `voucher_code` on the booking. There is no write to `gift_vouchers.balance_pence` anywhere in `src/`, in the edge functions or in the database (no trigger references the table). The balance shown to the next customer who types the same code is unchanged.

What it costs: a £50 voucher pays for a £50 class every week for ever. Because the client filters by `code` only (`BookingForm.tsx:41-46`), a voucher bought at one studio pays at any other. The studio's books show the discount as taken; the voucher's balance says it was not. Both are plausible; one is wrong.

Promotion: the voucher block in `create_booking()` above locks the voucher row, checks studio and expiry, debits, and inserts the booking in the same transaction.

What I looked for: an `update` on `gift_vouchers` in the client (none), a trigger (none), a test (none).

### 3.11 The confirmation function trusts its caller

`supabase/functions/send-booking-confirmation/index.ts:19` destructures `booking_id, email, manage_token` from the request body. Line 53 sends to `email` from the body, not to the booking's stored address. Line 36 builds the manage link from the body's token. `supabase/config.toml:3-4` sets `verify_jwt = false`, which is necessary because the booking page has no user, and means anyone can call it.

What it costs: a `POST` with any `booking_id` (readable in bulk while 3.2 stands), any recipient and any string as `manage_token` sends an email from `bookings@meadowlark.example` (line 52) with the studio's name, a real customer's name and class, and a link to `https://meadowlark.example/manage/<attacker's string>`. That is a phishing template on the studio's sender reputation.

Promotion (M, with 3.12): stop the browser calling it. A Supabase database webhook on `insert` into `bookings` posts the new row to the function with a secret header; the function checks the header, reads `record.id`, loads the row and emails `booking.customer_email`. The client's `supabase.functions.invoke` at `BookingForm.tsx:100-102` is deleted. `verify_jwt` stays `false` because the caller is the database, and the secret header is the gate, as `session-reminders/index.ts:10` already does for cron.

What I looked for: any comparison between the body's email and the row's (none), any token check (none), any rate limit (none).

### 3.12 Tokens and emails in the logs

`send-booking-confirmation/index.ts:18`:

```ts
console.log("send-booking-confirmation payload", JSON.stringify(body));
```

`body` contains `email` and `manage_token`. The sibling at `session-reminders/index.ts:37` logs `b.customer_email` and the whole booking row `b`, whose select at line 24 includes `manage_token`. `cancel-booking/index.ts:33` logs only `error.message`, so it is clean.

What it costs: `manage_token` is the bearer credential for `cancel-booking` (`cancel-booking/index.ts:28`). Anyone who can read the Supabase function logs (every dashboard collaborator, any log drain) can cancel any booking with an upcoming reminder. Customer emails sit in the logs for the plan's retention period.

Promotion (with 3.11): replace both lines with the id only.

```ts
console.log("send-booking-confirmation", { booking_id });
console.log("reminding booking", b.id);
```

Pinning test: export the handler from each function (`Deno.serve(handler)` with `handler` exported), and a Deno test that stubs `fetch`, spies on `console.log`, calls the handler with a body containing `probe@example.com` and a token, and asserts neither string appears in any logged argument. This is the one Tier 3 item where a test is the right promotion, because the rule is "never" and there is no mechanism that can express it.

What I looked for: a shared logging helper with redaction (none; there is no `_shared/` directory), any existing Deno test (none).

### 3.13 Migrations are not the schema

Comparing `supabase/migrations/` with `supabase/schema-dump.sql`:

| Object | In migrations | In production | Where |
|---|---|---|---|
| `gift_vouchers` table | no | yes | `schema-dump.sql:77-87` |
| `customer_notes` table | no | yes | `schema-dump.sql:89-95` |
| `bookings.voucher_code` column | no | yes | `schema-dump.sql:62` |
| `gift_vouchers_owner_all` policy | no | yes | `schema-dump.sql:160` |
| `gift_vouchers_public_read` policy | no | yes | `schema-dump.sql:161` |
| `customer_notes_owner_all` policy | no | yes | `schema-dump.sql:162` |
| RLS enabled on those two tables | no | yes | `schema-dump.sql:150-151` |

All seven were created in the dashboard. The code already depends on them: `BookingForm.tsx:41-46,89`, `Customers.tsx:44,70`, and the generated types at `types.ts:28,66,120` were regenerated from production and know every one.

What it costs: `supabase db reset`, a fresh branch database, or a second developer's local stack produces a database without vouchers, notes or `voucher_code`, and the app fails at the first voucher lookup. Any migration written against the repository and applied to production risks failing on an object the repository does not know about. The five migrations that do exist are correct; they are 7 objects short.

Promotion (M): `supabase db diff --linked -f baseline_prod_only_objects` writes the seven objects as a migration (then hand-edit it to drop `gift_vouchers_public_read`, per 3.4). Then a CI job that proves migrations build the schema:

```yaml
  schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: supabase/setup-cli@<sha>
      - run: supabase db start
      - run: supabase db reset            # every migration against an empty database
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
      - run: test -z "$(supabase db diff --linked --schema public)"
```

Once this is green, "production has something the repository does not" turns CI red on the next push. That is Tier 2 for the whole schema.

What I looked for: a migration after 20250715 (none), any `db diff` or `db push` step in CI (none; `build.yml:17-18` is `npm ci` and `npm run build`).

### 3.14 Customer emails lower-cased at one site, not the other

The bookings trigger lower-cases the email before upserting into `customers` (`20250611120000_init.sql:98`) so that `on conflict (studio_id, email)` at line 99 finds the existing row. The owner's add-customer form at `src/pages/Customers.tsx:54-59` inserts `email` as typed. `unique (studio_id, email)` at `init.sql:36` is case-sensitive, so `Jo@Example.com` and `jo@example.com` are two customers, the trigger's upsert never matches the hand-entered row, and the studio ends up with two records per person.

What it costs: duplicate customers and split booking history. Low blast radius, but it is silent, and it is the kind of thing a studio owner notices six months in.

Promotion (S):

```sql
-- 1. Find case-only duplicates and merge them by hand (expect a handful):
select studio_id, lower(email), count(*)
from public.customers group by 1, 2 having count(*) > 1;

-- 2. Normalise, then make the rule a constraint:
update public.customers set email = lower(email);
alter table public.customers
  add constraint customers_email_lowercase check (email = lower(email));
```

`Customers.tsx:57` becomes `email: email.trim().toLowerCase()`. After the constraint, a mixed-case insert fails loudly instead of duplicating quietly.

What I looked for: `lower(` or `citext` on `customers.email` (only inside the trigger), a check constraint (none).

### 3.15 One reminder per booking (leave as prose)

`session-reminders/index.ts:24-26` selects due bookings, line 37 onwards sends, and line 49 marks `reminder_sent_at` after each success. Two overlapping runs would both select the same rows and both send.

What it costs: a duplicate reminder email. The function runs once a day from cron behind a secret (`session-reminders/index.ts:7,10`), so the overlap requires the run to take more than a day or someone to trigger it by hand. I am leaving this as prose because the cost is one extra email and the probability is low; the one-line claim (`update ... set reminder_sent_at = now() where id = ... and reminder_sent_at is null returning id`, then send only if a row came back) is there if the schedule ever moves to minutes.

## 4. Tier 1 and Tier 2: what already holds

Verified by reading the mechanism or the test, not the comment next to it.

Tier 1, enforced by a mechanism:

1. A studio owner sees and edits only their own studio, classes, customers, notes and vouchers. `studios_owner_all` (`init.sql:60-63`), `sessions_owner_all` (`:70-73`), `customers_owner_all` (`:79-82`), `gift_vouchers_owner_all` and `customer_notes_owner_all` (`schema-dump.sql:160,162`). Each policy body restricts to `owner_id = auth.uid()` directly or through `studios`. Undone for `bookings` by 3.2, for `customers` by 3.3 and for `gift_vouchers` by 3.4; the owner-side half stands.
2. Unpublished classes are invisible to the public. `sessions_public_read` at `init.sql:75-77` is `using (published = true)`, not `using (true)`.
3. Every online booking creates or updates the studio's customer record. Trigger `trg_bookings_upsert_customer` at `init.sql:106-108`, function at `:90-104`.
4. Manage tokens are unguessable and unique. Default `replace(gen_random_uuid()::text, '-', '')` (122 random bits) and a unique index, `20250618093000_manage_token.sql:4,7`.
5. Vocabularies and ranges: `status` in three values, `level` in three, `seats > 0`, `capacity > 0`, prices `>= 0`, `deposit_pct` 0 to 100. `init.sql:9,18,20-23,46-49`.
6. Reminder runs need the cron secret. `session-reminders/index.ts:10` compares `x-cron-secret` with `!==`; if `CRON_SECRET` is unset the comparison is `null !== undefined` and every request is refused, so it fails closed.
7. `cancel-booking` cancels only the booking whose token was presented. `cancel-booking/index.ts:16` rejects tokens under 16 characters; `:28-29` updates `where manage_token = token and status <> 'cancelled'`. The function half is a mechanism. The database half is void while 3.2 lets anyone update `bookings` directly.

Tier 2, pinned by a test:

1. Money is stored in pence and displayed as pounds with two decimals. `src/lib/format.test.ts:5-8` asserts `formatPence(4500) === "£45.00"`, `805 → "£8.05"`, `0 → "£0.00"`. I checked the assertions would fail on the plausible mistakes (dividing by 1,000, dropping `toFixed`). It is the only test in the repository, and CI does not run it (`build.yml` has no `npm test`), so today it pins the rule on the developer's machine only. Adding `- run: npm test` to the workflow is a five-minute promotion.

That is the whole inventory. Seven mechanisms and one test against fifteen prose rules is the ratio to fix.

## 5. Secrets, migrations, CI

### 5.1 Secrets

Current tree:

| Location | Value | Public by design? | Action |
|---|---|---|---|
| `.env:1-2` | project id and URL | yes | none |
| `.env:3` | `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | none |
| `.env:4` | `VITE_SUPABASE_SERVICE_ROLE_KEY` | no, and compiled into the bundle via `admin.ts:8` | revoke today (section 2) |
| `.env:5` | `VITE_OPENAI_API_KEY` | no, compiled into the bundle via `openai.ts:4` | rotate today |
| `.env:6` | `RESEND_API_KEY` | no; not `VITE_`-prefixed so not in the bundle, but committed | rotate in the sprint |
| `supabase/functions/*` | `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` from `Deno.env` | correct place | none |

History: `.env` entered at `e48ceb9` and has been in every commit since. `.gitignore` arrived at `e841fee` with `.env` on line 22; the file remained tracked. Two commits, one secret-bearing file, in every clone.

### 5.2 Migrations

Five migration files, dated 11 June to 15 July 2025, all applied in production (every object they create is in the dump). Seven objects in production that no migration creates (table in 3.13). Last migration 15 July; the dump is dated 19 September; the two production-only tables were created in that gap through the dashboard. The repository cannot rebuild production.

### 5.3 CI

`.github/workflows/build.yml` runs `npm ci` and `npm run build` (lines 17-18) on push to `main` and on pull requests. It does not run `npm test` (defined at `package.json:12`), does not lint, does not touch the database, and pins its two actions by tag (`build.yml:12-13`), so a compromised `v4` tag would run in the founder's CI with the repository's token. Nothing in CI would go red if any finding in section 3 were reintroduced. After the sprint, five things will: the secret grep, gitleaks, `npm test`, the schema diff and the RLS suite.

## 6. Recommended hardening sprint

Fixed total, sequenced so each day leaves production better than the morning. Sizes: S half a day, M one day, L two days.

| Day | Item | Size | Closes |
|---|---|---|---|
| 1 | Revoke and rotate the three secrets; `git rm --cached .env`; `.env.example`; delete `admin.ts`; `describe-session` edge function; `admin-overview` edge function with `platform_admins`; secret grep and gitleaks in CI | L | 3.1, 3.6, 3.7 |
| 3 | RLS repair migration: drop `bookings_public_all`, waitlist RLS, drop `lookup_customer`, revoke default execute, `validate_voucher()`, `get_booking_by_token()` | M | 3.2, 3.3, 3.4, 3.5 |
| 4 | `create_booking()` and `session_availability`; booking form, seat counters and manage page rewired; `BookingForm.tsx` sends no money and no token | L | 3.8, 3.9, 3.10 and the client half of 3.2 |
| 6 | Confirmation email from a database webhook; recipients from the row; id-only logging in both functions; exported handlers with Deno tests and a console spy | M | 3.11, 3.12 |
| 7 | Baseline migration for the seven production-only objects; CI job that resets from migrations and diffs against production; `npm test` in CI; actions pinned by SHA | M | 3.13, Tier 2 promotion, 5.3 |
| 8 | RLS test suite against a local Supabase: anon, a studio owner and a second owner against every policy touched above, 14 cases | L | Pins 3.2 to 3.5 and 3.8 to 3.10 at Tier 2 |
| 10 | Email lower-case constraint and clean-up; `.gitignore` and README corrected (`README.md:35-36` currently claims RLS on every important table) | S | 3.14 |

Nine and a half days. Fixed total £4,500 ($6,000), the sprint price for up to ten days, with the £550 audit fee credited: £3,950 payable. One line of justification: fifteen prose rules become seven mechanisms, one view, one RPC and fourteen tests, and the founder keeps building in Lovable throughout, because every change lands as a reviewed pull request and CI now refuses the mistakes that produced this list. If day 8 runs long, it is the test count that shrinks, not the mechanisms.

## Appendix: the three tiers, for a non-technical reader

Every app has rules that matter: a customer sees only their own bookings, a price is worked out from the class, not typed in by the buyer, a secret key stays on the server. The question this report asks of each rule is not whether it is written down but what happens when someone breaks it.

Tier 1 means the system itself enforces the rule. Break it and the database refuses, immediately.

Tier 2 means a test exists that fails when the rule is broken. Someone finds out before the change ships, as long as the test runs.

Tier 3 means the rule lives in a comment, a chat with an AI assistant, or someone's memory. Break it and nothing happens, until a customer notices, or an attacker does.

Tier 3 is where the risk is. This report lists the cheapest way to move each such rule up a tier.

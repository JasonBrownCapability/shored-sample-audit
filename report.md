# Meadowlark: enforcement-tier audit

Sample report on a synthetic codebase. Meadowlark, its founder, its studios and every key in its repository are fictional. The codebase is at `meadowlark/` in this repository. I seeded it with the mistakes AI coding agents leave behind, then wrote the report against the code, not the seed list. This is what a founder gets at the end of the £550 day.

| | |
|---|---|
| Prepared for | The founder of Meadowlark (class bookings and deposits for small pottery studios) |
| Prepared by | Jason Brown, Shored |
| Date | 26 September 2026 |
| Inputs | Repository at commit `e841fee`, read-only: 43 tracked files, 30 of them application code (22 under `src/`, three edge functions, five migrations); the rest is config, the seed list and the schema dump. `supabase/schema-dump.sql`, a dump of the production schema the founder pulled on 19 September 2026. No production data was read. |
| Stack | React 18, Vite, TypeScript, Tailwind, Supabase (Postgres, Auth, three Deno edge functions), Resend, OpenAI. Built with Lovable. |
| Paths | Relative to the Meadowlark repository root. `file:12-15` means lines 12 to 15. |

## 1. What I found

The half of Meadowlark that studio owners use is fine. An owner cannot see another studio's classes, customers or notes, because the database will not show them. The public booking page is the problem. To get the booking form and its seat counter, the returning-customer autofill, the voucher box and the join-waitlist button working without errors, four doors were opened that should have stayed shut. Anyone with the app's public key, which is anyone who has loaded the page, can read and edit every booking at every studio. A database function will hand back every customer in the system to anyone who asks. The gift voucher list is public. The waitlist has no protection at all.

On top of that, the secret key that bypasses all of these protections is inside the JavaScript every visitor downloads, next to the OpenAI key, and both are in the git history.

None of this needs a rewrite. Every item has a fix of between ten minutes and two days, and the lot fits in a ten-day sprint.

I found 23 rules the app depends on. 7 are enforced by the database or the server, so they cannot be broken quietly. 1 is protected by a test. 15 are on trust: nothing in the database or the tests holds them. Of those 15, 7 are open right now, and 8 will go wrong the next time Lovable is asked to change something nearby or two customers book the same seat at once.

In the rest of this report I call those three groups Tier 1, Tier 2 and Tier 3. The appendix explains them in plain words.

## 2. Do this today

Delete the secret key that is in the browser bundle.

`.env:4` holds `VITE_SUPABASE_SERVICE_ROLE_KEY`. Anything prefixed `VITE_` is compiled into the JavaScript every visitor downloads, and `src/integrations/supabase/admin.ts:8-10` uses it to build a client that bypasses row-level security. Anyone who opens developer tools on `/book/<any-studio>` can copy the key, then read, change or delete every row in every table and manage users through the Auth admin API. The `/admin` guard at `src/App.tsx:23-27` only decides which component to show. The key is in the bundle either way.

About 20 minutes:

1. Supabase dashboard, Project Settings, API Keys. Find the secret key whose value matches `.env:4` and delete it. It is in the newer `sb_secret_` format, so deleting it touches nothing else and signs nobody out. Had it been a legacy `service_role` JWT, the fix would be to create a secret key, move every server-side consumer to it and deactivate the legacy keys. Yours has the new keys, so a single delete is enough.
2. Delete `VITE_SUPABASE_SERVICE_ROLE_KEY` from `.env`, from the Lovable project's environment settings and from the hosting environment. Delete `src/integrations/supabase/admin.ts`. Publish.
3. Leave the three edge functions alone. They read the `SUPABASE_SERVICE_ROLE_KEY` Supabase injects into the function runtime (`supabase/functions/*/index.ts`), a different credential. That variable carries the legacy `service_role` JWT, which stays valid. Do not deactivate legacy keys yet: step 1 of the sprint moves the functions to a named key from `SUPABASE_SECRET_KEYS` first.

After step 2 the `/admin` overview stops working until step 1 of the sprint (days 1 to 2) rebuilds it behind an edge function. Accept that.

Same afternoon, in the SQL editor. Under two minutes each, and none of them breaks the booking page:

- `drop function public.lookup_customer(text);` closes the cross-studio customer export (finding 3, section 3.3). The autofill at `src/components/BookingForm.tsx:31` starts returning nothing, and the form ignores that.
- Run the waitlist SQL under finding 5 (section 3.5). It turns on row-level security for `waitlist` and keeps the join-waitlist button working.
- Rotate the OpenAI key at platform.openai.com and remove `VITE_OPENAI_API_KEY` from the same three places. The "Write it for me" button stops working until the sprint. If you would rather keep the button, set a hard monthly limit on the OpenAI account today instead.

Two open holes I cannot close in ten minutes without breaking the booking page: the bookings policy (finding 2, section 3.2) and the public voucher list (finding 4, section 3.4). Each section gives you an interim option and what it costs.

## 3. Tier 3: on trust

Worst first. "Open" means anyone can do it today. Where each rule lives, file and line, is in its own section below. Sizes are for the fix: S is half a day, M one day, L two days.

| # | The rule | If it breaks | Fix (size) |
|---|---|---|---|
| 1 | The service-role key never reaches the browser | Open. Every row of every table readable and writable; Auth admin API open | Delete the key, delete the admin client, rebuild `/admin` as an edge function behind a `platform_admins` table; CI grep that fails on any `VITE_` name containing SECRET, SERVICE_ROLE or API_KEY (M) |
| 2 | Bookings are visible only to the studio that owns them | Open. Name, email, phone and notes of every booking at every studio readable; any booking can be confirmed, cancelled or deleted by anyone | Drop the policy; move the write into `create_booking()`, the seat count into a view, the manage page into `get_booking_by_token()` (L, shared with 8, 9, 10) |
| 3 | Customers are visible only to their own studio | Open. `rpc/lookup_customer` with `p_email = '%'` returns every customer row in the database, 1,000 per page | Drop the function; revoke default execute on new functions (S) |
| 4 | Gift-voucher codes and balances are visible only to their studio | Open. Every unredeemed code, balance and purchaser email readable; free classes at any studio | Drop the read policy; replace with `validate_voucher(code, studio_id)` exact-match function (S) |
| 5 | Waitlist entries are visible only to the studio | Open. Every waitlist name and email readable and deletable | Enable RLS; insert-only policy for the public, owner policy for reads (S) |
| 6 | Secrets are never committed | Open. Three secrets in every clone, fork and Lovable export of the repository, for ever | `git rm --cached .env`, rotate, `.env.example`, gitleaks in CI (S) |
| 7 | The OpenAI key never reaches the browser | Open. Anyone can spend against the founder's OpenAI account up to its hard limit | Move the call into a `describe-session` edge function with JWT verification (S) |
| 8 | A booking's total equals seats × (price + materials) − voucher | Any caller can book at £0; the admin revenue figure (`Overview.tsx:29`) sums numbers the client chose to send | Compute the total inside `create_booking()`; the client's number is never stored (L, shared with 2, 9, 10) |
| 9 | Seats booked never exceed the class capacity | Two customers booking the last seat at the same time both succeed; a caller can skip the check entirely | `create_booking()` locks the session row and re-counts; `session_availability` view replaces both copies of the formula (shared) |
| 10 | A voucher's balance goes down when it is used | One voucher pays for unlimited classes; the client also never checks the voucher belongs to the studio being booked | `create_booking()` debits the voucher in the same transaction, scoped to the studio (shared) |
| 11 | A confirmation email goes only to the person who made the booking | Anyone can send templated emails from the studio's sending address to any recipient, with a link path of their choosing | Trigger the function from a database webhook; take the recipient from the booking row (M (shared with 12)) |
| 12 | Manage tokens and customer emails never reach the logs | Anyone with log access can cancel any booking that was confirmed by email; personal data sits in logs for the retention period | Log ids only; a Deno test with a console spy pins it (shared) |
| 13 | The schema in `supabase/migrations/` is the schema in production | `supabase db reset` yields a database the app cannot run against; any hardening migration written from the repo fails on production | Baseline migration from the dump; CI job that applies migrations to an empty database and diffs against production (M) |
| 14 | Customer emails are stored lower-case | Duplicate customer records; `unique (studio_id, email)` at `init.sql:36` cannot catch case variants | `check (email = lower(email))` after a one-off clean-up (S) |
| 15 | A reminder is sent once per booking | A duplicate reminder email if two runs overlap | Leave as is: one daily run, one duplicate email at worst. The one-line fix is there if the schedule ever tightens |

### 3.1 The service-role key in the browser bundle

`src/integrations/supabase/admin.ts:8` reads `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY` and line 10 builds a Supabase client with it. `src/pages/admin/Overview.tsx:2` imports that client and uses it at lines 12 and 20 to list every studio and the 200 most recent bookings. The comment at `admin.ts:4-6` says why: "RLS was hiding other studios' rows from the founder account, so this uses the service role key which bypasses RLS."

Vite compiles every `VITE_` variable into the bundle. The guard at `src/App.tsx:23-27` checks `user.email` before rendering the page, and `App.tsx:10` statically imports `Overview`, which imports the admin client (`Overview.tsx:2`), so it ships in the bundle regardless. Every visitor already has the key. It bypasses row-level security on all seven tables (`studios`, `sessions`, `customers`, `bookings`, `waitlist`, `gift_vouchers`, `customer_notes`) and opens the Auth admin endpoints. Nothing else in this table matters while this stands.

Fix (M): the steps in section 2, then rebuild the overview as an edge function.

```sql
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;
-- No policies on purpose: only the service role, inside edge functions, reads it.
```

The `admin-overview` function runs with `verify_jwt = true` (today's default; the function also checks the user itself), calls `supabase.auth.getUser()` with the caller's token, checks the user id against `platform_admins`, and only then queries with a named secret key from `SUPABASE_SECRET_KEYS`. `Overview.tsx` calls `supabase.functions.invoke("admin-overview")` instead of importing a client. Add to `.github/workflows/build.yml`:

```yaml
      - name: No secrets compiled into the bundle
        run: "grep -rEn 'VITE_[A-Z_]*(SECRET|SERVICE_ROLE|API_KEY)' src .env.example; test $? -eq 1"
```

Exit 1 is grep's "no match"; a match (0) or a missing file (2) both fail the step. I looked for a build-time check on variable names (none; `vite.config.ts` has no `define` or env filtering), a test touching `admin.ts` (none; the only test is `src/lib/format.test.ts`) and a server-side gate on `/admin` (none).

### 3.2 Bookings readable and writable by the public

`supabase/migrations/20250709101200_fix_booking_insert.sql` in full:

```sql
-- fix: allow inserts, was getting 401 from the public booking page
create policy "bookings_public_all" on public.bookings
  for all to anon, authenticated
  using (true)
  with check (true);
```

`for all` grants select, insert, update and delete. `using (true)` passes every row. It is live in production (`schema-dump.sql:159`). The 401 it silenced was correct: `bookings_owner_all` (`20250611120000_init.sql:84-87`) only lets an owner touch their own rows, and the public page runs as `anon`.

Three parts of the client now depend on the hole. `BookingForm.tsx:77-92` inserts and reads back `id, manage_token` (line 91). `Book.tsx:44-56` reads every booking for the listed sessions to work out seats left. `Manage.tsx:18-22` reads a booking by its token.

With the publishable key from `.env:3` and no login, `GET /rest/v1/bookings?select=*` returns every booking at every studio: names, emails, phones, `manage_token`, amounts, and `notes`, which the placeholder at `BookingForm.tsx:117` fills with access needs and allergies, special category data under UK GDPR (Article 9, data concerning health). `PATCH` marks any booking paid. `DELETE` removes any booking. The insert accepts any `studio_id`.

Fix (L, shared with 3.8, 3.9 and 3.10): drop the policy and give the public page three narrow doors.

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
set search_path = ''
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

Exact match on a token with 122 random bits cannot be enumerated. `ilike` could be (see 3.3). `Manage.tsx:18-22` becomes `supabase.rpc("get_booking_by_token", { p_token: token }).maybeSingle()`.

If you want this closed before the sprint reaches it: replace the policy with insert-only, remove `.select("id, manage_token").single()` at `BookingForm.tsx:91-92`, drop `!booking` from the check at line 94 and the `invoke` at lines 100-102 that needs `booking.id`. Postgres checks select policies on `insert ... returning`, so with no `.select()` the insert-only policy is enough. Bookings keep working. Until step 3 of the sprint, the seat counter shows full capacity, the manage link fails, and no confirmation email goes out. I would take that. Five days of a degraded booking page is cheaper than the contact details of every customer at every studio.

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

I looked for a narrower select policy on `bookings` in the migrations or the dump (none), a test running as `anon` (none), and a check that `studio_id` matches the session's studio (none; foreign keys at `init.sql:41-42`, no compound constraint).

### 3.3 `lookup_customer` returns every customer to anyone

`supabase/migrations/20250715163000_lookup_customer.sql:4-14`:

```sql
create or replace function public.lookup_customer(p_email text)
returns setof public.customers
language sql
security definer
set search_path = ''
stable
as $$
  select c.*
  from public.customers c
  where c.email ilike p_email;
$$;
```

`security definer` runs the query as the function's owner, so row-level security on `customers` does not apply. Postgres grants execute on new functions to `public` by default, so `anon` can call it through `POST /rest/v1/rpc/lookup_customer`. `ilike` treats `%` and `_` as wildcards, so `{"p_email": "%"}` returns the whole table, every customer of every studio, in pages of 1,000 (Supabase's default `db-max-rows`). With no `studio_id` filter, even an exact email returns that person's records across every studio.

`BookingForm.tsx:31` calls it to autofill name and phone for a returning customer.

Fix (S): drop it, and stop the next function being public by default.

```sql
drop function public.lookup_customer(text);
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
```

The second statement applies to functions created from now on by the `postgres` role, which the SQL editor and the CLI both use, so a future `security definer` function has to be granted to `anon` on purpose. I would not rebuild the autofill. It saves two form fields, and even the safe version, exact email plus `studio_id` returning `name, phone`, lets anyone with a known email fetch a phone number.

I looked for an execute revoke or grant in the migrations or the dump (none), a `studio_id` parameter (none), a test calling the RPC as `anon` (none).

### 3.4 Gift vouchers readable by the public

Production only, `schema-dump.sql:161`:

```sql
CREATE POLICY gift_vouchers_public_read ON public.gift_vouchers FOR SELECT TO anon, authenticated USING (true);
```

The table (`schema-dump.sql:77-87`) holds `code, initial_pence, balance_pence, purchaser_email, expires_at`. The booking form reads it at `BookingForm.tsx:42-46` by exact code. `GET /rest/v1/gift_vouchers?select=code,balance_pence&balance_pence=gt.0` lists every live voucher at every studio.

A voucher code is money. Every unredeemed balance can be spent by a stranger at any studio, because the client never filters by `studio_id`, and finding 10 means it can be spent again and again. `purchaser_email` is personal data on top.

Fix (S):

```sql
drop policy "gift_vouchers_public_read" on public.gift_vouchers;

create or replace function public.validate_voucher(p_code text, p_studio_id uuid)
returns table (code text, balance_pence integer, expires_at date)
language sql
security definer
set search_path = ''
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

`BookingForm.tsx:42-46` becomes `supabase.rpc("validate_voucher", { p_code: code, p_studio_id: studio.id }).maybeSingle()`. One code per call, exact match, scoped to the studio. Codes should be at least 10 random characters; the app has no generator, so step 2 of the sprint adds one.

If you want this closed before the sprint: drop the read policy today and accept that the voucher box fails until step 2 lands. Vouchers still work at the counter.

I looked for a narrower policy on `gift_vouchers` (only `gift_vouchers_owner_all` at `schema-dump.sql:160`, which is right, and the public read that undoes it) and a `studio_id` filter at the call site (none).

### 3.5 Waitlist without row-level security

`supabase/migrations/20250702141500_waitlist.sql` creates the table and an index and stops. No `alter table ... enable row level security`. The dump agrees: `schema-dump.sql:146-151` enables RLS on six tables and `waitlist` is not one of them. Supabase gives `anon` and `authenticated` full privileges on new tables in `public`, so a table without RLS is wide open through the REST API.

`Book.tsx:115` inserts into it from the public page. Nothing reads it. The migration comment says entries are "read by the studio owner on the sessions page"; `Sessions.tsx` has no such query. Every name and email on every waitlist can be read, edited and deleted by anyone.

Fix (S), safe to run today:

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
    where st.owner_id = (select auth.uid())))
  with check (session_id in (
    select s.id from public.sessions s
    join public.studios st on st.id = s.studio_id
    where st.owner_id = (select auth.uid())));
```

The insert at `Book.tsx:115` has no `.select()`, so it keeps working under an insert-only policy.

I looked for RLS enabled in a later migration (none), in the dump (absent), and any test (none).

### 3.6 Secrets committed, and still tracked

`.env` arrived in commit `e48ceb9` with six values: the project id and URL (public), the publishable key (`.env:3`, public by design), the service-role secret (`.env:4`), the OpenAI key (`.env:5`) and the Resend key (`.env:6`). Commit `e841fee` added `.gitignore` with `.env` on line 22. That does not untrack a file already committed; `git ls-files` still lists it.

Everyone who has cloned, forked or exported the repository has all three secrets, and Lovable's GitHub sync puts them in your GitHub account and any collaborator's. Rotation is the only remedy. Deleting the file from the tip changes nothing about the history.

Fix (S): rotate all three secrets (section 2 covers two; the Resend key is rotated at resend.com and set with `supabase secrets set RESEND_API_KEY=...`), then

```
git rm --cached .env
git commit -m "Stop tracking .env"
```

and commit a `.env.example` with names only. Add a secret scan to CI, pinned by SHA:

```yaml
      - uses: actions/checkout@<sha>
        with:
          fetch-depth: 0                 # the whole history, or there is nothing to scan
      - uses: gitleaks/gitleaks-action@<full commit sha of a v3 release>
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}   # organisation accounts only
```

I would not rewrite history. Dead keys are harmless, and rewriting a Lovable-synced repository breaks the sync.

I looked for a pre-commit hook or CI step scanning for secrets (none) and a `.env.example` (none).

### 3.7 OpenAI key in the browser

`src/lib/openai.ts:4` reads `import.meta.env.VITE_OPENAI_API_KEY`. Line 11 calls `https://api.openai.com/v1/chat/completions` from the browser with the key in the `Authorization` header at line 15. `Sessions.tsx:154` calls it from the "Write it for me" button. Anyone can spend against your OpenAI account until its hard limit, or until the card declines.

Fix (S): a `describe-session` edge function with `verify_jwt = true` (the button is only on the logged-in owner page; the function checks the user as well), `OPENAI_API_KEY` set with `supabase secrets set`, and `openai.ts` reduced to `supabase.functions.invoke("describe-session", { body })`. The CI grep from 3.1 catches the next one.

I looked for a proxy function in `supabase/functions/` (none; the three there are for email and cancellation). OpenAI keys have no origin allow-list.

### 3.8 The booking total is computed in the browser

`BookingForm.tsx:63-66`:

```ts
const gross = seats * (session.price_pence + session.materials_fee_pence);
const discount = Math.min(voucher?.balance_pence ?? 0, gross);
const total = gross - discount;
const deposit = Math.round((total * studio.deposit_pct) / 100);
```

Lines 86 and 87 send `total` and `deposit` to the database as `total_pence` and `deposit_pence`. The only constraints on those columns are `>= 0` (`20250611120000_init.sql:47-48`). The database has no idea what the total should be, so `total_pence: 0, deposit_pence: 0` is a valid booking. `Overview.tsx:29` sums `total_pence` as revenue, so your own numbers are whatever clients chose to send.

Fix (L, the same function as 3.2, and it covers 3.9 and 3.10): the client stops sending money at all.

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
set search_path = ''
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
     where code = upper(trim(p_voucher_code))
       and studio_id = s.studio_id;
  end if;

  v_total   := v_gross - v_discount;
  v_deposit := round(v_total * st.deposit_pct / 100.0);

  insert into public.bookings
    (studio_id, session_id, customer_name, customer_email, customer_phone,
     seats, total_pence, deposit_pence, notes, voucher_code)
  values
    (s.studio_id, s.id, p_name, lower(trim(p_email)), nullif(trim(p_phone), ''),
     p_seats, v_total, v_deposit, nullif(trim(p_notes), ''), nullif(upper(trim(p_voucher_code)), ''))
  returning id into v_id;

  return query select v_id, v_total, v_deposit;
end;
$$;

revoke execute on function public.create_booking(uuid, integer, text, text, text, text, text)
  from public;
grant execute on function public.create_booking(uuid, integer, text, text, text, text, text)
  to anon, authenticated;
```

`BookingForm.tsx:77-92` becomes one `supabase.rpc("create_booking", {...})` call. The function derives `studio_id` from the session, so the mismatch in 3.2 cannot happen either, and it does not return `manage_token`; the confirmation email moves server-side (3.11).

I looked for a trigger or check computing `total_pence` (none; the only trigger is the customer upsert at `init.sql:106-108`) and a test on the arithmetic (none; `format.test.ts` tests display only).

### 3.9 Capacity is checked in the browser only

`BookingForm.tsx:70-73` refuses the submit if `seats > seatsLeft`, and line 115 sets `max={seatsLeft}`. `seatsLeft` comes from `Book.tsx:44-56`, a sum over bookings fetched when the page loaded. The owner's page has its own copy of the formula at `Sessions.tsx:51-53`.

Two customers who load the page with one seat left both book it. Anyone who posts to `/rest/v1/bookings` directly books as many as they like. `capacity > 0` at `init.sql:21` constrains the class, not the bookings against it. The two copies of the formula will drift the first time one is edited.

Fix: `create_booking()` above locks the session row with `for update` and re-counts inside the lock. For display, one view replaces both copies:

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

The view runs with its owner's privileges, the Postgres default, and exposes two integers per published class. Supabase's linter will flag it as a security-definer view; this is the one place I accept that, and the reason goes in the migration as a comment.

I looked for a trigger comparing against capacity (none), an exclusion or check constraint (none), a test (none).

### 3.10 Voucher balances never go down

`BookingForm.tsx:64` applies `voucher.balance_pence` to the total and line 89 stores `voucher_code` on the booking. Nothing writes to `gift_vouchers.balance_pence`, not `src/`, not the edge functions, not a trigger. A £50 voucher pays for a £50 class every week, for ever, and because the client filters by `code` only (`BookingForm.tsx:42-46`), at any studio. The books show the discount taken and the voucher says it was not.

Fix: the voucher block in `create_booking()` above locks the voucher row, checks studio and expiry, debits, and inserts the booking in the same transaction.

I looked for an `update` on `gift_vouchers` in the client (none), a trigger (none), a test (none).

### 3.11 The confirmation function trusts its caller

`supabase/functions/send-booking-confirmation/index.ts:19` takes `booking_id, email, manage_token` from the request body. Line 53 sends to the body's `email`, not the address on the booking, and line 36 builds the manage link from the body's token. `supabase/config.toml:3-4` sets `verify_jwt = false`, which the public page needs and which means anyone can call it.

A `POST` with any `booking_id` (readable in bulk while 3.2 stands), any recipient and any string as `manage_token` sends an email from `bookings@meadowlark.example` (line 52) carrying the studio's name, a real customer's name and class, and a link to `https://meadowlark.example/manage/<attacker's string>`. A phishing template on the studio's sender reputation.

Fix (M, with 3.12): stop the browser calling it. A database webhook on `insert` into `bookings` posts the row to the function with a secret header. The function checks the header, loads the row by `record.id` and emails `booking.customer_email`. The client call at `BookingForm.tsx:100-102` goes. `verify_jwt` stays `false` because the caller is the database; the header is the gate, as `session-reminders/index.ts:10` already does for cron.

I looked for any comparison between the body's email and the row's (none), any token check (none), any rate limit (none).

### 3.12 Tokens and emails in the logs

`send-booking-confirmation/index.ts:18`:

```ts
console.log("send-booking-confirmation payload", JSON.stringify(body));
```

`body` holds `email` and `manage_token`. `session-reminders/index.ts:37` logs `b.customer_email` and the whole row `b`, whose select at line 24 includes `manage_token`. `cancel-booking/index.ts:33` logs only `error.message`, so that one is clean.

`manage_token` is the credential `cancel-booking` accepts (`cancel-booking/index.ts:28`). Anyone who can read the function logs, every dashboard collaborator and any log drain, can cancel any booking that was ever confirmed by email, and any with an upcoming reminder. Customer emails sit there for the retention period.

Fix (with 3.11): replace both lines with the id only.

```ts
console.log("send-booking-confirmation", { booking_id });
console.log("reminding booking", b.id);
```

Then a test to hold it: export each handler (`Deno.serve(handler)`), stub `fetch`, spy on `console.log`, call the handler with `probe@example.com` and a token in the body, and assert neither string was logged. This is the one item where the test is the fix itself, not a check on a mechanism, because the rule is "never" and no database mechanism can say that. The test runs in CI.

I looked for a logging helper with redaction (none; there is no `_shared/`) and any Deno test (none).

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
| RLS enabled on `gift_vouchers` and `customer_notes` (two statements) | no | yes | `schema-dump.sql:150-151` |

Seven rows, counting each table with its constraints as one and the two RLS statements as one. All were created in the dashboard, and the code already depends on them: `BookingForm.tsx:42-46,89`, `Customers.tsx:44,70`, and the generated types at `types.ts:28,66,120`.

`supabase db reset`, a branch database or a second developer's local stack gives you a database without vouchers, notes or `voucher_code`, and the app fails at the first voucher lookup. The five migrations that exist are correct. They are these seven items short.

Fix (M): `supabase db diff --linked -f baseline_prod_only_objects` writes the seven as a migration. It is the first migration of step 2, so the repair migration that follows can drop `gift_vouchers_public_read` (3.4) from a table the repository now knows about. Then a CI job that proves the migrations build the schema:

```yaml
  schema:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@<sha>
      - uses: supabase/setup-cli@<sha>
        with: { version: latest }
      - run: supabase db start                 # applies every migration to an empty database
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
      - run: supabase db diff --linked --schema public > drift.sql
      - run: test ! -s drift.sql || { cat drift.sql; exit 1; }
```

Two steps for the gate on purpose: `$(...)` would hide a failed diff command behind an empty string, and the default shell has no `pipefail`. Once this is green, any drift between production and the repository turns CI red on the next push. That is Tier 2 for the whole schema.

I looked for a migration after 20250715 (none) and a `db diff` or `db push` step in CI (none; `build.yml:17-18` is `npm ci` and `npm run build`).

### 3.14 Customer emails lower-cased at one site, not the other

The bookings trigger lower-cases the email before upserting into `customers` (`20250611120000_init.sql:98`) so that `on conflict (studio_id, email)` at line 99 finds the row. The owner's add-customer form at `src/pages/Customers.tsx:54-59` inserts `email` as typed. `unique (studio_id, email)` at `init.sql:36` is case-sensitive, so `Jo@Example.com` and `jo@example.com` are two customers and the studio ends up with two records per person. It is small and silent. An owner notices it six months in.

Fix (S):

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

I looked for `lower(` or `citext` on `customers.email` (only inside the trigger) and a check constraint (none).

### 3.15 One reminder per booking (leave as is)

`session-reminders/index.ts:22-28` selects due bookings, line 37 onwards sends, and line 49 marks `reminder_sent_at` afterwards. Two overlapping runs would both send. The function runs once a day from cron behind a secret (`session-reminders/index.ts:7,10`), so the cost is one duplicate email in an unlikely case. I am leaving it alone. The one-line claim (`update ... set reminder_sent_at = now() where id = ... and reminder_sent_at is null returning id`, then send only if a row came back) is here if the schedule ever moves to minutes.

## 4. Tier 1 and Tier 2: what already holds

I checked each of these by reading the mechanism or the test, not the comment next to it.

Tier 1, enforced by a mechanism:

1. A studio owner edits only their own studio and sees only their own classes, customers, bookings, notes and vouchers. `studios_owner_all` (`init.sql:60-63`), `sessions_owner_all` (`:70-73`), `customers_owner_all` (`:79-82`), `bookings_owner_all` (`:84-87`), `gift_vouchers_owner_all` and `customer_notes_owner_all` (`schema-dump.sql:160,162`). Each policy restricts to `owner_id = auth.uid()`, directly or through `studios`. `studios` rows themselves are public by design (`studios_public_read`, `init.sql:66-68`), which also exposes every studio's `contact_email` and `owner_id`; worth a narrower column list one day, not a finding today. Undone for the public side by 3.2, 3.3 and 3.4; the owner side stands.
2. Unpublished classes are invisible to the public. `sessions_public_read` at `init.sql:75-77` is `using (published = true)`, not `using (true)`.
3. Every online booking creates or updates the studio's customer record. Trigger `trg_bookings_upsert_customer` at `init.sql:106-108`, function at `:90-104`.
4. Manage tokens are unguessable and unique. Default `replace(gen_random_uuid()::text, '-', '')` (122 random bits) and a unique index, `20250618093000_manage_token.sql:4,7`.
5. Vocabularies and ranges: `status` in three values, `level` in three, `seats > 0`, `capacity > 0`, prices `>= 0`, `deposit_pct` 0 to 100. `init.sql:9,18,20-23,46-49`.
6. Reminder runs need the cron secret. `session-reminders/index.ts:10` compares `x-cron-secret` with `!==`; with `CRON_SECRET` unset every request is refused, so it fails closed.
7. `cancel-booking` cancels only the booking whose token was presented. `cancel-booking/index.ts:16` rejects tokens under 16 characters; `:28-29` updates `where manage_token = token and status <> 'cancelled'`. The function half holds. The database half is void while 3.2 lets anyone update `bookings` directly.

Tier 2, held by a test:

1. Money is stored in pence and displayed as pounds with two decimals. `src/lib/format.test.ts:6-8` asserts `formatPence(4500) === "£45.00"`, `805 → "£8.05"`, `0 → "£0.00"`, and I checked they would fail on the plausible mistakes. It is the only test in the repository and CI does not run it (`build.yml` has no `npm test`), so today it holds on the developer's machine only. Adding `- run: npm test` takes five minutes.

That is the whole list. Seven mechanisms and one test against fifteen rules on trust.

## 5. Secrets, migrations, CI

### 5.1 Secrets

Current tree:

| Location | Value | Public by design? | Action |
|---|---|---|---|
| `.env:1-2` | project id and URL | yes | none |
| `.env:3` | `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | none |
| `.env:4` | `VITE_SUPABASE_SERVICE_ROLE_KEY` | no, and compiled into the bundle via `admin.ts:8` | delete today (section 2) |
| `.env:5` | `VITE_OPENAI_API_KEY` | no, compiled into the bundle via `openai.ts:4` | rotate today |
| `.env:6` | `RESEND_API_KEY` | no; not `VITE_`-prefixed so not in the bundle, but committed | rotate in the sprint |
| `supabase/functions/*` | `SUPABASE_SERVICE_ROLE_KEY` (the legacy JWT), `RESEND_API_KEY`, `CRON_SECRET` from `Deno.env` | correct place | move to a named `SUPABASE_SECRET_KEYS` entry in the sprint |

History: `.env` entered at `e48ceb9` and has been in every commit since. `.gitignore` arrived at `e841fee` with `.env` on line 22, and the file stayed tracked. One secret-bearing file, in every clone since.

### 5.2 Migrations

Five migration files, dated 11 June to 15 July 2025, all applied in production (every object they create is in the dump). Seven items in production that no migration creates (table in 3.13). The last migration is 15 July 2025 and the dump is dated 19 September 2026. The two production-only tables were created somewhere in those fourteen months, through the dashboard. The repository cannot rebuild production.

### 5.3 CI

`.github/workflows/build.yml` runs `npm ci` and `npm run build` (lines 17-18) on push and pull request. It does not run `npm test` (defined at `package.json:12`), does not touch the database, and pins its two actions by tag (`build.yml:12-13`), so a compromised `v4` tag would run in your CI with the repository's token. Nothing in CI goes red if any finding in section 3 comes back. After the sprint, six things will: the secret grep, gitleaks, `npm test`, the Deno tests, the schema drift gate and the RLS suite.

## 6. Recommended hardening sprint

Fixed total, seven steps in an order where each day leaves production better than the morning. The column gives which sprint days each step occupies.

| Step | Item | Sprint days | Closes |
|---|---|---|---|
| 1 | Rotate the Resend key and confirm the two section 2 rotations landed; move the three edge functions to a named key from `SUPABASE_SECRET_KEYS`; `git rm --cached .env`; `.env.example`; `describe-session` edge function; `admin-overview` edge function with `platform_admins`; secret grep and gitleaks in CI | 1 to 2 | 3.1, 3.6, 3.7 |
| 2 | Baseline migration for the seven production-only items first; then the RLS repair migration: drop `bookings_public_all`, waitlist RLS, drop `lookup_customer`, revoke default execute, `validate_voucher()`, `get_booking_by_token()`, a voucher code generator | 3 to 4 | 3.13 (the baseline), 3.3, 3.4, 3.5 and the server half of 3.2 |
| 3 | `create_booking()` and `session_availability`; booking form, seat counters and manage page rewired; `BookingForm.tsx` sends no money and no token | 5 to 6 | 3.8, 3.9, 3.10 and the client half of 3.2 |
| 4 | Confirmation email from a database webhook; recipients from the row; id-only logging in both functions; exported handlers with Deno tests and a console spy, run in CI | 7 | 3.11, 3.12 |
| 5 | Schema CI job: migrations applied to an empty database, drift gate against production; `npm test` in CI (section 4); actions pinned by SHA | 8 | 3.13 (the gate), 5.3 |
| 6 | RLS test suite against a local Supabase: anon, a studio owner and a second owner against every policy and function touched above, 14 cases | 9 to 10, a day and a half | Holds 3.2 to 3.5 and 3.8 to 3.10 at Tier 2 |
| 7 | Email lower-case constraint and clean-up; README corrected (`README.md:35-36` currently claims RLS on every important table) | 10, half a day | 3.14 |

Ten days. Fixed total £4,500 ($6,000), the sprint price for up to ten days, with the £550 audit fee credited: £3,950 payable. What you get for it: fourteen of the fifteen rules on trust move up a tier, and 3.15 stays as it is by choice. Three database functions, one view and two edge functions replace logic that lived in the browser. One constraint, RLS on every public table and six CI checks hold the rest. Sixteen tests pin it: fourteen RLS cases and two Deno tests. You keep building in Lovable throughout, because every change lands as a reviewed pull request and CI now refuses the mistakes that produced this list. If step 6 runs long, the test count shrinks, not the mechanisms.

## Appendix: the three tiers, for a non-technical reader

Every app has rules that matter. A customer sees only their own bookings. A price is worked out from the class, not typed in by the buyer. A secret key stays on the server. The question I ask of each rule is not whether it is written down but what happens when someone breaks it.

Tier 1 means the system enforces the rule. Break it and the database refuses, immediately.

Tier 2 means a test exists that fails when the rule is broken. Someone finds out before the change ships, as long as the test runs.

Tier 3 means the rule is on trust: it lives in a comment or in someone's memory. Break it and nothing happens, until a customer notices, or an attacker does.

Tier 3 is where the risk is. This report lists the cheapest way to move each such rule up a tier.

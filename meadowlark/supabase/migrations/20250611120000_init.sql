-- Meadowlark initial schema: studios, sessions (classes), customers, bookings.

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  contact_email text not null,
  deposit_pct integer not null default 50 check (deposit_pct between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  title text not null,
  description text,
  level text not null default 'all' check (level in ('beginner', 'improver', 'all')),
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min > 0),
  capacity integer not null check (capacity > 0),
  price_pence integer not null check (price_pence >= 0),
  materials_fee_pence integer not null default 0 check (materials_fee_pence >= 0),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  unique (studio_id, email)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  seats integer not null check (seats > 0),
  total_pence integer not null check (total_pence >= 0),
  deposit_pence integer not null check (deposit_pence >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- Row level security: studio owners see only their own rows.
alter table public.studios enable row level security;
alter table public.sessions enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;

create policy "studios_owner_all" on public.studios
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- The public booking page needs the studio name and slug.
create policy "studios_public_read" on public.studios
  for select to anon, authenticated
  using (true);

create policy "sessions_owner_all" on public.sessions
  for all to authenticated
  using (studio_id in (select id from public.studios where owner_id = auth.uid()))
  with check (studio_id in (select id from public.studios where owner_id = auth.uid()));

create policy "sessions_public_read" on public.sessions
  for select to anon, authenticated
  using (published = true);

create policy "customers_owner_all" on public.customers
  for all to authenticated
  using (studio_id in (select id from public.studios where owner_id = auth.uid()))
  with check (studio_id in (select id from public.studios where owner_id = auth.uid()));

create policy "bookings_owner_all" on public.bookings
  for all to authenticated
  using (studio_id in (select id from public.studios where owner_id = auth.uid()))
  with check (studio_id in (select id from public.studios where owner_id = auth.uid()));

-- Keep each studio's customer list in step with its bookings.
create or replace function public.upsert_customer_from_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customers (studio_id, name, email, phone)
  values (new.studio_id, new.customer_name, lower(new.customer_email), new.customer_phone)
  on conflict (studio_id, email) do update
    set name = excluded.name,
        phone = coalesce(excluded.phone, public.customers.phone);
  return new;
end;
$$;

create trigger trg_bookings_upsert_customer
  after insert on public.bookings
  for each row execute function public.upsert_customer_from_booking();

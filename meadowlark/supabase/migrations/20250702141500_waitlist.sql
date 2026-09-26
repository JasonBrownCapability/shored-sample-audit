-- Waitlist for full sessions. Entries are added from the public booking page
-- and read by the studio owner on the sessions page.
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index waitlist_session_id_idx on public.waitlist (session_id);

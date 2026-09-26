-- Returning customers: autofill name and phone on the booking page from the
-- email address they type. The booking page runs as anon and cannot read
-- customers directly, so this runs with the privileges of its owner.
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

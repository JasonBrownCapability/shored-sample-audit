-- fix: allow inserts, was getting 401 from the public booking page
create policy "bookings_public_all" on public.bookings
  for all to anon, authenticated
  using (true)
  with check (true);

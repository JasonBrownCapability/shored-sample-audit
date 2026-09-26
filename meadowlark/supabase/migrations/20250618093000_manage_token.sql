-- Customers get a link in the confirmation email that lets them cancel.
-- The token in the link is the only credential a customer has.
alter table public.bookings
  add column manage_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column reminder_sent_at timestamptz;

create unique index bookings_manage_token_key on public.bookings (manage_token);

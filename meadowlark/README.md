# Meadowlark

Class bookings, deposits and waitlists for small pottery studios.

I run a two-wheel studio and got tired of taking bookings over Instagram DMs and
a spreadsheet. Meadowlark is the tool I wanted: a studio owner lists their
classes, gets a public booking page, customers pick a seat and pay a deposit,
and the owner sees who is coming. Fourteen studios use it now.

Built with [Lovable](https://lovable.dev), Supabase and a lot of evenings.

## What it does

- Studio owner signs up, creates classes (date, seats, price, materials fee).
- Public booking page at `/book/<studio-slug>`; no account needed to book.
- Gift vouchers: a customer types a code at checkout and the balance comes off.
- Waitlist when a class is full.
- Confirmation email with a link the customer can use to cancel.
- Reminder email the day before.
- "Write it for me" button that drafts a class description with OpenAI.
- An `/admin` page just for me, to see every studio and booking in one place.

## Running it

```
npm i
npm run dev
```

Copy the env values from the Supabase dashboard into `.env`. The edge functions
live in `supabase/functions` and deploy through the Lovable Supabase integration.

## Security

Supabase row level security is enabled on all the important tables, so studios
can only see their own data. The public booking page uses the publishable key.

## Roadmap

- Stripe for deposits (currently the owner marks a booking paid by hand)
- Studio-level branding on the booking page
- Kiln firing queue

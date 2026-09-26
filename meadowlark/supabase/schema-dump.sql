--
-- Pulled from prod 2026-09-19 with: supabase db dump --linked -f supabase/schema-dump.sql
-- (public schema only; trimmed of pg_dump SET lines and comments)
--

CREATE TABLE public.studios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    contact_email text NOT NULL,
    deposit_pct integer DEFAULT 50 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studios_deposit_pct_check CHECK (((deposit_pct >= 0) AND (deposit_pct <= 100)))
);

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    studio_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    level text DEFAULT 'all'::text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    duration_min integer NOT NULL,
    capacity integer NOT NULL,
    price_pence integer NOT NULL,
    materials_fee_pence integer DEFAULT 0 NOT NULL,
    published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sessions_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT sessions_duration_min_check CHECK ((duration_min > 0)),
    CONSTRAINT sessions_level_check CHECK ((level = ANY (ARRAY['beginner'::text, 'improver'::text, 'all'::text]))),
    CONSTRAINT sessions_materials_fee_pence_check CHECK ((materials_fee_pence >= 0)),
    CONSTRAINT sessions_price_pence_check CHECK ((price_pence >= 0))
);

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    studio_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    marketing_opt_in boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    studio_id uuid NOT NULL,
    session_id uuid NOT NULL,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text,
    seats integer NOT NULL,
    total_pence integer NOT NULL,
    deposit_pence integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    manage_token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    reminder_sent_at timestamp with time zone,
    voucher_code text,
    CONSTRAINT bookings_deposit_pence_check CHECK ((deposit_pence >= 0)),
    CONSTRAINT bookings_seats_check CHECK ((seats > 0)),
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text]))),
    CONSTRAINT bookings_total_pence_check CHECK ((total_pence >= 0))
);

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.gift_vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    studio_id uuid NOT NULL,
    code text NOT NULL,
    initial_pence integer NOT NULL,
    balance_pence integer NOT NULL,
    purchaser_email text,
    expires_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gift_vouchers_balance_pence_check CHECK ((balance_pence >= 0))
);

CREATE TABLE public.customer_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    studio_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customers ADD CONSTRAINT customers_studio_id_email_key UNIQUE (studio_id, email);
ALTER TABLE ONLY public.bookings ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.waitlist ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.gift_vouchers ADD CONSTRAINT gift_vouchers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.gift_vouchers ADD CONSTRAINT gift_vouchers_code_key UNIQUE (code);
ALTER TABLE ONLY public.customer_notes ADD CONSTRAINT customer_notes_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX bookings_manage_token_key ON public.bookings USING btree (manage_token);
CREATE INDEX waitlist_session_id_idx ON public.waitlist USING btree (session_id);

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sessions ADD CONSTRAINT sessions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customers ADD CONSTRAINT customers_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bookings ADD CONSTRAINT bookings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bookings ADD CONSTRAINT bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.waitlist ADD CONSTRAINT waitlist_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.gift_vouchers ADD CONSTRAINT gift_vouchers_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_notes ADD CONSTRAINT customer_notes_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_notes ADD CONSTRAINT customer_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

CREATE FUNCTION public.upsert_customer_from_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.customers (studio_id, name, email, phone)
  values (new.studio_id, new.customer_name, lower(new.customer_email), new.customer_phone)
  on conflict (studio_id, email) do update
    set name = excluded.name,
        phone = coalesce(excluded.phone, public.customers.phone);
  return new;
end;
$$;

CREATE FUNCTION public.lookup_customer(p_email text) RETURNS SETOF public.customers
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.*
  from public.customers c
  where c.email ilike p_email;
$$;

CREATE TRIGGER trg_bookings_upsert_customer AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.upsert_customer_from_booking();

ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY studios_owner_all ON public.studios TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY studios_public_read ON public.studios FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY sessions_owner_all ON public.sessions TO authenticated USING ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid())))) WITH CHECK ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid()))));
CREATE POLICY sessions_public_read ON public.sessions FOR SELECT TO anon, authenticated USING ((published = true));
CREATE POLICY customers_owner_all ON public.customers TO authenticated USING ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid())))) WITH CHECK ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid()))));
CREATE POLICY bookings_owner_all ON public.bookings TO authenticated USING ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid())))) WITH CHECK ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid()))));
CREATE POLICY bookings_public_all ON public.bookings TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY gift_vouchers_owner_all ON public.gift_vouchers TO authenticated USING ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid())))) WITH CHECK ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid()))));
CREATE POLICY gift_vouchers_public_read ON public.gift_vouchers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY customer_notes_owner_all ON public.customer_notes TO authenticated USING ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid())))) WITH CHECK ((studio_id IN ( SELECT studios.id FROM public.studios WHERE (studios.owner_id = auth.uid()))));

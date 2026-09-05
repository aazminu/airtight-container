-- CI / fresh-database baseline: the app schema as of migration 0024.
--
-- The migration chain is NOT self-contained. `0000_phase1_additive` ALTERs
-- tables (inventory, sold, release_numbers, ...) that predate the runner —
-- they came from the v1 app, which had no migrations. So `scripts/migrate.ts`
-- can only ever run against a database that already holds the v1 schema, and
-- an empty database fails on 0000 with `relation "release_numbers" does not
-- exist`. This dump is that missing starting point.
--
-- Load order for a fresh database (see .github/workflows/deploy.yml):
--   1. node migrate.js                          -- Better Auth's own tables;
--                                                  reports.generated_by has an
--                                                  FK to "user", so it is first
--   2. psql -f db/ci-baseline.sql               -- this file
--   3. tsx scripts/migrate.ts --baseline-on-empty 0024
--                                              -- records 0000-0024 as applied
--                                                  without running them, then
--                                                  applies anything newer
--
-- Excludes the four Better Auth tables ("user", session, account, verification)
-- because step 1 owns those, and schema_migrations because step 3 needs it
-- empty for --baseline-on-empty to fire.
--
-- REGENERATING: when you add migrations past 0024, either leave this alone
-- (step 3 applies the new ones on top — that is the point, and it exercises
-- them in CI) or, if the chain gets slow, re-dump from a fully migrated DB:
--
--   pg_dump --dbname "$DATABASE_URL" --schema-only --no-owner --no-privileges \
--     --exclude-table='"user"' --exclude-table=session --exclude-table=account \
--     --exclude-table=verification --exclude-table=schema_migrations \
--   | grep -vE '^\\(un)?restrict ' > db/ci-baseline.sql
--
-- ...then bump the --baseline-on-empty version in deploy.yml to match, and
-- re-paste this header.

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: inventory_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_state AS ENUM (
    'pending',
    'available',
    'hold',
    'sold',
    'outbound'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'awaiting',
    'paid',
    'delinquent',
    'cancelled'
);


--
-- Name: sh_billing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sh_billing_mode AS ENUM (
    'in_out_daily',
    'flat_monthly',
    'non_billable'
);


--
-- Name: sh_invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sh_invoice_status AS ENUM (
    'pending_review',
    'sent',
    'paid'
);


--
-- Name: sh_line_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sh_line_type AS ENUM (
    'in_fee',
    'out_fee',
    'storage_days',
    'flat_month'
);


--
-- Name: sh_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sh_state AS ENUM (
    'pending',
    'in_storage',
    'checked_out'
);


--
-- Name: recompute_pickup_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_pickup_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE pickup_numbers
  SET is_complete = false,
      completed_at = NULL
  WHERE pickup_number_id = OLD.pickup_number_id
    AND is_complete = true
    AND (SELECT COUNT(*) FROM pickup_number_assignments
         WHERE pickup_number_id = OLD.pickup_number_id) < pickup_count;
  RETURN OLD;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    client_name text NOT NULL,
    business_name text,
    contact_email text,
    contact_phone text,
    street text,
    city text,
    state text,
    zip text,
    default_in_fee numeric DEFAULT 65 NOT NULL,
    default_out_fee numeric DEFAULT 65 NOT NULL,
    default_daily_rate numeric DEFAULT 1 NOT NULL
);


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- Name: damage_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.damage_presets (
    id integer NOT NULL,
    label text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: damage_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.damage_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: damage_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.damage_presets_id_seq OWNED BY public.damage_presets.id;


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id integer NOT NULL,
    date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unit_number text NOT NULL,
    size text NOT NULL,
    damage text NOT NULL,
    trucking_company text,
    notes text,
    acquisition_price numeric,
    state public.inventory_state DEFAULT 'available'::public.inventory_state NOT NULL,
    is_pending_audit boolean DEFAULT true NOT NULL,
    release_number_id integer NOT NULL,
    sale_company_id integer NOT NULL,
    photos text[]
);


--
-- Name: inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_id_seq OWNED BY public.inventory.id;


--
-- Name: invoice_containers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_containers (
    invoice_id integer NOT NULL,
    container_id integer NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    invoice_id integer NOT NULL,
    invoice_number integer NOT NULL,
    invoice_taxed boolean DEFAULT false NOT NULL,
    client_id integer NOT NULL,
    invoice_date timestamp with time zone DEFAULT now() NOT NULL,
    invoice_credit boolean DEFAULT false,
    subtotal numeric,
    tax_rate numeric,
    tax_amount numeric,
    cc_fee_rate numeric,
    cc_fee_amount numeric,
    total numeric,
    pdf_s3_key text,
    sent_at timestamp with time zone,
    deleted_at timestamp with time zone,
    status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL,
    status_changed_at timestamp with time zone,
    status_changed_by_user_id text,
    ship_to_same_as_billing boolean DEFAULT true NOT NULL,
    ship_to_name text,
    ship_to_street text,
    ship_to_city text,
    ship_to_state text,
    ship_to_zip text
);


--
-- Name: invoices_invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_invoice_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_invoice_id_seq OWNED BY public.invoices.invoice_id;


--
-- Name: mod_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_presets (
    id integer NOT NULL,
    label text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    default_price numeric
);


--
-- Name: mod_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_presets_id_seq OWNED BY public.mod_presets.id;


--
-- Name: sold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sold (
    id integer NOT NULL,
    inventory_id integer NOT NULL,
    sold_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    outbound_trucker text,
    destination text,
    sale_price numeric,
    release_number text,
    trucking_rate numeric,
    modification_price numeric,
    invoice_notes text,
    outbound_date timestamp with time zone,
    material_cost numeric,
    labor_cost numeric,
    outbound_trucking_company_id integer,
    delivery_name text,
    delivery_street text,
    delivery_city text,
    delivery_state text,
    delivery_zip text,
    door_orientation text
);


--
-- Name: outbounds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbounds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbounds_id_seq OWNED BY public.sold.id;


--
-- Name: pickup_number_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickup_number_assignments (
    sh_inventory_id integer NOT NULL,
    pickup_number_id integer NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    pickup_damage text
);


--
-- Name: pickup_numbers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickup_numbers (
    pickup_number_id integer NOT NULL,
    sale_company_id integer NOT NULL,
    pickup_number_value text NOT NULL,
    pickup_count integer DEFAULT 1 NOT NULL,
    is_complete boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pickup_numbers_pickup_count_check CHECK ((pickup_count >= 1))
);


--
-- Name: pickup_numbers_pickup_number_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pickup_numbers_pickup_number_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pickup_numbers_pickup_number_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pickup_numbers_pickup_number_id_seq OWNED BY public.pickup_numbers.pickup_number_id;


--
-- Name: quote_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_line_items (
    id integer NOT NULL,
    quote_id integer NOT NULL,
    description text NOT NULL,
    sale_price numeric,
    trucking_rate numeric,
    destination text,
    "position" integer DEFAULT 0 NOT NULL
);


--
-- Name: quote_line_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quote_line_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_line_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quote_line_items_id_seq OWNED BY public.quote_line_items.id;


--
-- Name: quote_line_modifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_line_modifications (
    id integer NOT NULL,
    quote_line_item_id integer NOT NULL,
    description text NOT NULL,
    price numeric NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL
);


--
-- Name: quote_line_modifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quote_line_modifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_line_modifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quote_line_modifications_id_seq OWNED BY public.quote_line_modifications.id;


--
-- Name: quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotes (
    id integer NOT NULL,
    quote_number text NOT NULL,
    client_id integer NOT NULL,
    quote_taxed boolean DEFAULT false NOT NULL,
    quote_credit boolean DEFAULT false NOT NULL,
    tax_rate numeric,
    cc_fee_rate numeric,
    subtotal numeric,
    tax_amount numeric,
    cc_fee_amount numeric,
    total numeric,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    pdf_s3_key text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: quotes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quotes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quotes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quotes_id_seq OWNED BY public.quotes.id;


--
-- Name: release_number_containers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_number_containers (
    release_number_id integer NOT NULL,
    container_number text NOT NULL,
    is_used boolean DEFAULT false NOT NULL
);


--
-- Name: release_numbers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_numbers (
    release_number_id integer NOT NULL,
    release_number_count integer DEFAULT 1 NOT NULL,
    release_number_value text NOT NULL,
    sale_company_id integer NOT NULL,
    is_complete boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: release_numbers_release_number_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.release_numbers_release_number_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: release_numbers_release_number_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.release_numbers_release_number_id_seq OWNED BY public.release_numbers.release_number_id;


--
-- Name: report_receipt_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_receipt_links (
    id integer NOT NULL,
    token text NOT NULL,
    report_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    accessed_at timestamp with time zone,
    revoked_at timestamp with time zone
);


--
-- Name: report_receipt_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.report_receipt_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: report_receipt_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.report_receipt_links_id_seq OWNED BY public.report_receipt_links.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    report_type text NOT NULL,
    generated_by text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    parameters jsonb,
    pdf_s3_key text,
    emailed_to text[],
    resolved_data jsonb,
    pdf_generated_at timestamp with time zone,
    emailed_at timestamp with time zone,
    sms_sent_at timestamp with time zone,
    sms_consent_at timestamp with time zone,
    sms_consent_by_user_id text,
    sms_consent_text_version text,
    delivery_sheet_number text
);


--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: sale_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_companies (
    sale_company_id integer NOT NULL,
    sale_company_name text NOT NULL
);


--
-- Name: sale_companies_sale_company_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_companies_sale_company_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_companies_sale_company_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_companies_sale_company_id_seq OWNED BY public.sale_companies.sale_company_id;


--
-- Name: sh_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sh_inventory (
    id integer NOT NULL,
    client_id integer,
    unit_number text NOT NULL,
    size text NOT NULL,
    damage text,
    intake_date timestamp with time zone DEFAULT now() NOT NULL,
    in_fee numeric,
    out_fee numeric,
    daily_rate numeric,
    state public.sh_state DEFAULT 'pending'::public.sh_state NOT NULL,
    is_pending_audit boolean DEFAULT true NOT NULL,
    checkout_date timestamp with time zone,
    notes text,
    photos text[],
    billing_mode public.sh_billing_mode DEFAULT 'in_out_daily'::public.sh_billing_mode NOT NULL,
    flat_rate numeric,
    release_number_id integer,
    pickup_damage text
);


--
-- Name: sh_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sh_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sh_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sh_inventory_id_seq OWNED BY public.sh_inventory.id;


--
-- Name: sh_invoice_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sh_invoice_lines (
    id integer NOT NULL,
    sh_invoice_id integer NOT NULL,
    sh_box_id integer NOT NULL,
    line_type public.sh_line_type NOT NULL,
    days_count integer,
    rate numeric,
    amount numeric,
    description text
);


--
-- Name: sh_invoice_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sh_invoice_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sh_invoice_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sh_invoice_lines_id_seq OWNED BY public.sh_invoice_lines.id;


--
-- Name: sh_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sh_invoices (
    id integer NOT NULL,
    client_id integer NOT NULL,
    billing_month date NOT NULL,
    invoice_number integer NOT NULL,
    subtotal numeric,
    tax_rate numeric,
    tax_amount numeric,
    total numeric,
    pdf_s3_key text,
    status public.sh_invoice_status DEFAULT 'pending_review'::public.sh_invoice_status NOT NULL,
    generated_at timestamp with time zone,
    sent_at timestamp with time zone
);


--
-- Name: sh_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sh_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sh_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sh_invoices_id_seq OWNED BY public.sh_invoices.id;


--
-- Name: size_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.size_presets (
    id integer NOT NULL,
    label text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: size_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.size_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: size_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.size_presets_id_seq OWNED BY public.size_presets.id;


--
-- Name: sold_modifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sold_modifications (
    id integer NOT NULL,
    sold_id integer NOT NULL,
    description text NOT NULL,
    price numeric NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL
);


--
-- Name: sold_modifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sold_modifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sold_modifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sold_modifications_id_seq OWNED BY public.sold_modifications.id;


--
-- Name: trucking_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trucking_companies (
    id integer NOT NULL,
    company_name text NOT NULL,
    dispatch_name text,
    dispatch_phone text,
    dispatch_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trucking_companies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trucking_companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trucking_companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trucking_companies_id_seq OWNED BY public.trucking_companies.id;


--
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- Name: damage_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_presets ALTER COLUMN id SET DEFAULT nextval('public.damage_presets_id_seq'::regclass);


--
-- Name: inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory ALTER COLUMN id SET DEFAULT nextval('public.inventory_id_seq'::regclass);


--
-- Name: invoices invoice_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN invoice_id SET DEFAULT nextval('public.invoices_invoice_id_seq'::regclass);


--
-- Name: mod_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_presets ALTER COLUMN id SET DEFAULT nextval('public.mod_presets_id_seq'::regclass);


--
-- Name: pickup_numbers pickup_number_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_numbers ALTER COLUMN pickup_number_id SET DEFAULT nextval('public.pickup_numbers_pickup_number_id_seq'::regclass);


--
-- Name: quote_line_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_line_items ALTER COLUMN id SET DEFAULT nextval('public.quote_line_items_id_seq'::regclass);


--
-- Name: quote_line_modifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_line_modifications ALTER COLUMN id SET DEFAULT nextval('public.quote_line_modifications_id_seq'::regclass);


--
-- Name: quotes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes ALTER COLUMN id SET DEFAULT nextval('public.quotes_id_seq'::regclass);


--
-- Name: release_numbers release_number_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_numbers ALTER COLUMN release_number_id SET DEFAULT nextval('public.release_numbers_release_number_id_seq'::regclass);


--
-- Name: report_receipt_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_receipt_links ALTER COLUMN id SET DEFAULT nextval('public.report_receipt_links_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: sale_companies sale_company_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_companies ALTER COLUMN sale_company_id SET DEFAULT nextval('public.sale_companies_sale_company_id_seq'::regclass);


--
-- Name: sh_inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_inventory ALTER COLUMN id SET DEFAULT nextval('public.sh_inventory_id_seq'::regclass);


--
-- Name: sh_invoice_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoice_lines ALTER COLUMN id SET DEFAULT nextval('public.sh_invoice_lines_id_seq'::regclass);


--
-- Name: sh_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoices ALTER COLUMN id SET DEFAULT nextval('public.sh_invoices_id_seq'::regclass);


--
-- Name: size_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.size_presets ALTER COLUMN id SET DEFAULT nextval('public.size_presets_id_seq'::regclass);


--
-- Name: sold id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold ALTER COLUMN id SET DEFAULT nextval('public.outbounds_id_seq'::regclass);


--
-- Name: sold_modifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold_modifications ALTER COLUMN id SET DEFAULT nextval('public.sold_modifications_id_seq'::regclass);


--
-- Name: trucking_companies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucking_companies ALTER COLUMN id SET DEFAULT nextval('public.trucking_companies_id_seq'::regclass);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: damage_presets damage_presets_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_presets
    ADD CONSTRAINT damage_presets_label_key UNIQUE (label);


--
-- Name: damage_presets damage_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_presets
    ADD CONSTRAINT damage_presets_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: invoice_containers invoice_containers_container_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_containers
    ADD CONSTRAINT invoice_containers_container_id_key UNIQUE (container_id);


--
-- Name: invoice_containers invoice_containers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_containers
    ADD CONSTRAINT invoice_containers_pkey PRIMARY KEY (invoice_id, container_id);


--
-- Name: invoices invoices_invoice_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (invoice_id);


--
-- Name: mod_presets mod_presets_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_presets
    ADD CONSTRAINT mod_presets_label_key UNIQUE (label);


--
-- Name: mod_presets mod_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_presets
    ADD CONSTRAINT mod_presets_pkey PRIMARY KEY (id);


--
-- Name: sold outbounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold
    ADD CONSTRAINT outbounds_pkey PRIMARY KEY (id);


--
-- Name: pickup_number_assignments pickup_number_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_number_assignments
    ADD CONSTRAINT pickup_number_assignments_pkey PRIMARY KEY (sh_inventory_id);


--
-- Name: pickup_numbers pickup_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_numbers
    ADD CONSTRAINT pickup_numbers_pkey PRIMARY KEY (pickup_number_id);


--
-- Name: quote_line_items quote_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_line_items
    ADD CONSTRAINT quote_line_items_pkey PRIMARY KEY (id);


--
-- Name: quote_line_modifications quote_line_modifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_line_modifications
    ADD CONSTRAINT quote_line_modifications_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_quote_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_quote_number_key UNIQUE (quote_number);


--
-- Name: release_number_containers release_number_containers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_number_containers
    ADD CONSTRAINT release_number_containers_pkey PRIMARY KEY (release_number_id, container_number);


--
-- Name: release_numbers release_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_numbers
    ADD CONSTRAINT release_numbers_pkey PRIMARY KEY (release_number_id);


--
-- Name: release_numbers release_numbers_release_number_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_numbers
    ADD CONSTRAINT release_numbers_release_number_value_key UNIQUE (release_number_value);


--
-- Name: report_receipt_links report_receipt_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_receipt_links
    ADD CONSTRAINT report_receipt_links_pkey PRIMARY KEY (id);


--
-- Name: report_receipt_links report_receipt_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_receipt_links
    ADD CONSTRAINT report_receipt_links_token_key UNIQUE (token);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: sale_companies sale_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_companies
    ADD CONSTRAINT sale_companies_pkey PRIMARY KEY (sale_company_id);


--
-- Name: sale_companies sale_companies_sale_company_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_companies
    ADD CONSTRAINT sale_companies_sale_company_name_key UNIQUE (sale_company_name);


--
-- Name: sh_inventory sh_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_inventory
    ADD CONSTRAINT sh_inventory_pkey PRIMARY KEY (id);


--
-- Name: sh_invoice_lines sh_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoice_lines
    ADD CONSTRAINT sh_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: sh_invoices sh_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoices
    ADD CONSTRAINT sh_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: sh_invoices sh_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoices
    ADD CONSTRAINT sh_invoices_pkey PRIMARY KEY (id);


--
-- Name: size_presets size_presets_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.size_presets
    ADD CONSTRAINT size_presets_label_key UNIQUE (label);


--
-- Name: size_presets size_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.size_presets
    ADD CONSTRAINT size_presets_pkey PRIMARY KEY (id);


--
-- Name: sold_modifications sold_modifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold_modifications
    ADD CONSTRAINT sold_modifications_pkey PRIMARY KEY (id);


--
-- Name: trucking_companies trucking_companies_company_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucking_companies
    ADD CONSTRAINT trucking_companies_company_name_key UNIQUE (company_name);


--
-- Name: trucking_companies trucking_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucking_companies
    ADD CONSTRAINT trucking_companies_pkey PRIMARY KEY (id);


--
-- Name: sold unique_inventory_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold
    ADD CONSTRAINT unique_inventory_id UNIQUE (inventory_id);


--
-- Name: damage_presets_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX damage_presets_position_idx ON public.damage_presets USING btree ("position");


--
-- Name: inventory_pending_audit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_pending_audit_idx ON public.inventory USING btree (is_pending_audit);


--
-- Name: inventory_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_state_idx ON public.inventory USING btree (state);


--
-- Name: invoices_invoice_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_invoice_date_idx ON public.invoices USING btree (invoice_date);


--
-- Name: invoices_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);


--
-- Name: mod_presets_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mod_presets_position_idx ON public.mod_presets USING btree ("position");


--
-- Name: pickup_assignments_pickup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pickup_assignments_pickup_idx ON public.pickup_number_assignments USING btree (pickup_number_id);


--
-- Name: pickup_numbers_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pickup_numbers_active_idx ON public.pickup_numbers USING btree (is_complete) WHERE (is_complete = false);


--
-- Name: pickup_numbers_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pickup_numbers_company_idx ON public.pickup_numbers USING btree (sale_company_id);


--
-- Name: pickup_numbers_value_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pickup_numbers_value_uq ON public.pickup_numbers USING btree (pickup_number_value);


--
-- Name: quote_line_items_quote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quote_line_items_quote_idx ON public.quote_line_items USING btree (quote_id);


--
-- Name: quote_line_modifications_line_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quote_line_modifications_line_idx ON public.quote_line_modifications USING btree (quote_line_item_id);


--
-- Name: quotes_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_client_idx ON public.quotes USING btree (client_id);


--
-- Name: quotes_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_created_at_idx ON public.quotes USING btree (created_at);


--
-- Name: report_receipt_links_report_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_receipt_links_report_id_idx ON public.report_receipt_links USING btree (report_id);


--
-- Name: report_receipt_links_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_receipt_links_token_idx ON public.report_receipt_links USING btree (token);


--
-- Name: reports_delivery_sheet_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reports_delivery_sheet_number_key ON public.reports USING btree (delivery_sheet_number) WHERE (delivery_sheet_number IS NOT NULL);


--
-- Name: reports_generated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_generated_at_idx ON public.reports USING btree (generated_at);


--
-- Name: reports_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_type_idx ON public.reports USING btree (report_type);


--
-- Name: sh_inventory_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sh_inventory_client_idx ON public.sh_inventory USING btree (client_id);


--
-- Name: sh_inventory_pending_audit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sh_inventory_pending_audit_idx ON public.sh_inventory USING btree (is_pending_audit);


--
-- Name: sh_inventory_release_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sh_inventory_release_idx ON public.sh_inventory USING btree (release_number_id);


--
-- Name: sh_inventory_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sh_inventory_state_idx ON public.sh_inventory USING btree (state);


--
-- Name: sh_invoices_client_month_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sh_invoices_client_month_uniq ON public.sh_invoices USING btree (client_id, billing_month);


--
-- Name: size_presets_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX size_presets_position_idx ON public.size_presets USING btree ("position");


--
-- Name: sold_modifications_sold_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sold_modifications_sold_idx ON public.sold_modifications USING btree (sold_id);


--
-- Name: sold_outbound_trucking_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sold_outbound_trucking_company_idx ON public.sold USING btree (outbound_trucking_company_id);


--
-- Name: pickup_number_assignments pickup_recompute_complete_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pickup_recompute_complete_after_delete AFTER DELETE ON public.pickup_number_assignments FOR EACH ROW EXECUTE FUNCTION public.recompute_pickup_complete();


--
-- Name: sold fk_inventory; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold
    ADD CONSTRAINT fk_inventory FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: inventory inventory_release_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_release_number_id_fkey FOREIGN KEY (release_number_id) REFERENCES public.release_numbers(release_number_id);


--
-- Name: inventory inventory_sale_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_sale_company_id_fkey FOREIGN KEY (sale_company_id) REFERENCES public.sale_companies(sale_company_id);


--
-- Name: invoice_containers invoice_containers_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_containers
    ADD CONSTRAINT invoice_containers_container_id_fkey FOREIGN KEY (container_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: invoice_containers invoice_containers_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_containers
    ADD CONSTRAINT invoice_containers_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(invoice_id) ON DELETE CASCADE;


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: pickup_number_assignments pickup_number_assignments_pickup_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_number_assignments
    ADD CONSTRAINT pickup_number_assignments_pickup_number_id_fkey FOREIGN KEY (pickup_number_id) REFERENCES public.pickup_numbers(pickup_number_id) ON DELETE RESTRICT;


--
-- Name: pickup_number_assignments pickup_number_assignments_sh_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_number_assignments
    ADD CONSTRAINT pickup_number_assignments_sh_inventory_id_fkey FOREIGN KEY (sh_inventory_id) REFERENCES public.sh_inventory(id) ON DELETE CASCADE;


--
-- Name: pickup_numbers pickup_numbers_sale_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_numbers
    ADD CONSTRAINT pickup_numbers_sale_company_id_fkey FOREIGN KEY (sale_company_id) REFERENCES public.sale_companies(sale_company_id) ON DELETE CASCADE;


--
-- Name: quote_line_items quote_line_items_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_line_items
    ADD CONSTRAINT quote_line_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;


--
-- Name: quote_line_modifications quote_line_modifications_quote_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_line_modifications
    ADD CONSTRAINT quote_line_modifications_quote_line_item_id_fkey FOREIGN KEY (quote_line_item_id) REFERENCES public.quote_line_items(id) ON DELETE CASCADE;


--
-- Name: quotes quotes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: release_number_containers release_number_containers_release_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_number_containers
    ADD CONSTRAINT release_number_containers_release_number_id_fkey FOREIGN KEY (release_number_id) REFERENCES public.release_numbers(release_number_id) ON DELETE CASCADE;


--
-- Name: release_numbers release_numbers_sale_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_numbers
    ADD CONSTRAINT release_numbers_sale_company_id_fkey FOREIGN KEY (sale_company_id) REFERENCES public.sale_companies(sale_company_id) ON DELETE CASCADE;


--
-- Name: report_receipt_links report_receipt_links_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_receipt_links
    ADD CONSTRAINT report_receipt_links_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: reports reports_generated_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_generated_by_fk FOREIGN KEY (generated_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: sh_inventory sh_inventory_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_inventory
    ADD CONSTRAINT sh_inventory_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: sh_inventory sh_inventory_release_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_inventory
    ADD CONSTRAINT sh_inventory_release_number_id_fkey FOREIGN KEY (release_number_id) REFERENCES public.release_numbers(release_number_id) ON DELETE CASCADE;


--
-- Name: sh_invoice_lines sh_invoice_lines_sh_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoice_lines
    ADD CONSTRAINT sh_invoice_lines_sh_box_id_fkey FOREIGN KEY (sh_box_id) REFERENCES public.sh_inventory(id);


--
-- Name: sh_invoice_lines sh_invoice_lines_sh_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoice_lines
    ADD CONSTRAINT sh_invoice_lines_sh_invoice_id_fkey FOREIGN KEY (sh_invoice_id) REFERENCES public.sh_invoices(id) ON DELETE CASCADE;


--
-- Name: sh_invoices sh_invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sh_invoices
    ADD CONSTRAINT sh_invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: sold_modifications sold_modifications_sold_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold_modifications
    ADD CONSTRAINT sold_modifications_sold_id_fk FOREIGN KEY (sold_id) REFERENCES public.sold(id) ON DELETE CASCADE;


--
-- Name: sold sold_outbound_trucking_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold
    ADD CONSTRAINT sold_outbound_trucking_company_id_fkey FOREIGN KEY (outbound_trucking_company_id) REFERENCES public.trucking_companies(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--



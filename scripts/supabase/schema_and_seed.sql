-- FinSight Supabase schema + sample historical seed
-- Run with: psql "$SUPABASE_DB_URL" -f scripts/supabase/schema_and_seed.sql

create table if not exists public.wallet_state (
  id bigserial primary key,
  balance bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_events (
  id bigserial primary key,
  source text not null,
  event_type text not null,
  amount bigint not null,
  balance bigint not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.money_transactions (
  id bigserial primary key,
  source text not null,
  kind text not null default 'payment',
  name text not null,
  amount bigint not null,
  category text not null,
  type text not null check (type in ('upi', 'cash')),
  need_or_want text not null check (need_or_want in ('need', 'want', 'tracked')),
  gst text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.receipts_history (
  id bigserial primary key,
  source text not null,
  merchant text not null,
  amount bigint not null,
  category text not null,
  note text,
  entry_source text not null,
  file_name text,
  file_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.emi_records (
  id bigserial primary key,
  source text not null,
  name text not null,
  amount bigint not null,
  due_date int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_records (
  id bigserial primary key,
  source text not null,
  monthly_budget bigint not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id bigserial primary key,
  source text not null,
  type text not null,
  brand text not null,
  original_value numeric(12,2) not null,
  asking_price numeric(12,2) not null,
  platform_fee numeric(12,2) not null,
  seller_note text,
  expiry text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id bigserial primary key,
  name text not null,
  target_amount bigint not null,
  saved_amount bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.streak (
  date_key text primary key,
  budget_for_day bigint not null,
  spent_for_day bigint not null,
  status text not null,
  updated_at timestamptz not null default now()
);

create or replace view public.v_combined_history as
select
  'upi-spend'::text as history_type,
  id::text as row_id,
  source,
  name,
  amount,
  category,
  type as payment_type,
  need_or_want,
  gst,
  note,
  created_at as event_at
from public.money_transactions
union all
select
  'receipt-track'::text as history_type,
  id::text as row_id,
  source,
  merchant as name,
  amount,
  category,
  case when entry_source = 'upi-linked' then 'upi' else 'cash' end as payment_type,
  'tracked'::text as need_or_want,
  null::text as gst,
  note,
  created_at as event_at
from public.receipts_history;

-- Sample seed
insert into public.wallet_state (balance)
select 47580
where not exists (select 1 from public.wallet_state);

insert into public.budget_records (source, monthly_budget, note)
values ('seed', 100000, 'Initial monthly budget')
on conflict do nothing;

insert into public.money_transactions (source, kind, name, amount, category, type, need_or_want, gst, note)
values
('seed', 'payment', 'Swiggy', 800, 'Food', 'upi', 'want', '', 'Historical sample'),
('seed', 'payment', 'Metro Recharge', 120, 'Transport', 'upi', 'need', '', 'Historical sample'),
('seed', 'payment', 'Apollo Pharmacy', 450, 'Health', 'cash', 'need', '27AABCU9603R1ZV', 'Historical sample')
on conflict do nothing;

insert into public.receipts_history (source, merchant, amount, category, note, entry_source, file_name, file_type)
values
('seed', 'Fuel Station', 780, 'Transport', 'Receipt tracked', 'upload', 'fuel-receipt.pdf', 'application/pdf'),
('seed', 'Office Lunch', 240, 'Food', 'Manual receipt tracked', 'manual', '', '')
on conflict do nothing;

insert into public.marketplace_listings (source, type, brand, original_value, asking_price, platform_fee, seller_note, expiry, status)
values
('seed', 'gift-card', 'PVR', 500, 350, 10, 'Valid this month', '2026-05-30', 'active'),
('seed', 'coupon', 'Zomato Pro', 999, 799, 16, 'Unused coupon', '2026-06-20', 'active')
on conflict do nothing;

insert into public.emi_records (source, name, amount, due_date)
values
('seed', 'Phone EMI', 2500, 5),
('seed', 'Laptop EMI', 3200, 10)
on conflict do nothing;

insert into public.goals (name, target_amount, saved_amount)
values
('Emergency Fund', 200000, 42000),
('Travel 2026', 80000, 18000)
on conflict do nothing;

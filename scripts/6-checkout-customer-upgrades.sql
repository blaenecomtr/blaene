-- Blaene checkout + customer profile upgrades
-- Run after previous setup/migration files.

-- ---------------------------------------------------------------------------
-- Customer profile: corporate fields + customer type persistence
-- ---------------------------------------------------------------------------
alter table if exists public.customer_profiles
  add column if not exists customer_type text
    check (customer_type in ('bireysel', 'kurumsal')),
  add column if not exists customer_kind text
    check (customer_kind in ('bireysel', 'kurumsal')),
  add column if not exists company_name text,
  add column if not exists national_id text,
  add column if not exists tax_number text,
  add column if not exists tax_office text;

create index if not exists idx_customer_profiles_customer_type on public.customer_profiles(customer_type);

-- ---------------------------------------------------------------------------
-- Orders: payment method, billing details, discount snapshot
-- ---------------------------------------------------------------------------
alter table if exists public.orders
  add column if not exists payment_method text not null default 'card'
    check (payment_method in ('card', 'bank_transfer')),
  add column if not exists billing_same_as_shipping boolean not null default true,
  add column if not exists billing_name text,
  add column if not exists billing_address text,
  add column if not exists billing_city text,
  add column if not exists billing_district text,
  add column if not exists promo_code text,
  add column if not exists discount_amount numeric(10,2) not null default 0;

create index if not exists idx_orders_payment_method on public.orders(payment_method);
create index if not exists idx_orders_promo_code on public.orders(promo_code);

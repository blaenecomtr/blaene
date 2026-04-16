-- Blaene: Admin + e-commerce setup for Supabase (PostgreSQL)
-- Run this script in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- =========================
-- PRODUCTS
-- =========================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  category text not null check (category in ('bath', 'forge', 'industrial')),
  material text,
  thickness text,
  dims text,
  description text,
  price numeric(10,2),
  price_visible boolean not null default false,
  images text[] not null default '{}',
  variants jsonb not null default '[]'::jsonb,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category_active_order on public.products(category, active, display_order);
create index if not exists idx_products_code on public.products(code);

-- =========================
-- ORDERS
-- =========================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  merchant_oid text not null unique,
  customer_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  city text,
  district text,
  note text,
  subtotal numeric(10,2) not null,
  shipping numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  currency text not null default 'TRY',
  payment_provider text not null default 'paytr',
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  paid_at timestamptz,
  paytr_status text,
  paytr_total_amount integer,
  failed_reason_code text,
  failed_reason_msg text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_payment_status on public.orders(payment_status);

-- =========================
-- ORDER ITEMS
-- =========================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_code text not null,
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- =========================
-- PAYMENT EVENTS (optional audit log)
-- =========================
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  merchant_oid text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_events_merchant_oid on public.payment_events(merchant_oid);
create index if not exists idx_payment_events_created_at on public.payment_events(created_at desc);

-- =========================
-- updated_at trigger
-- =========================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- =========================
-- RLS
-- =========================
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_events enable row level security;

-- products: public read, authenticated write

drop policy if exists products_public_read on public.products;
create policy products_public_read
on public.products
for select
using (true);

drop policy if exists products_auth_write on public.products;
create policy products_auth_write
on public.products
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- orders/order_items/payment_events: authenticated read only

drop policy if exists orders_auth_read on public.orders;
create policy orders_auth_read
on public.orders
for select
using (auth.role() = 'authenticated');

drop policy if exists order_items_auth_read on public.order_items;
create policy order_items_auth_read
on public.order_items
for select
using (auth.role() = 'authenticated');

drop policy if exists payment_events_auth_read on public.payment_events;
create policy payment_events_auth_read
on public.payment_events
for select
using (auth.role() = 'authenticated');

-- =========================
-- Storage bucket + policies
-- =========================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read
on storage.objects
for select
using (bucket_id = 'product-images');

-- Authenticated write

drop policy if exists product_images_auth_insert on storage.objects;
create policy product_images_auth_insert
on storage.objects
for insert
with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists product_images_auth_update on storage.objects;
create policy product_images_auth_update
on storage.objects
for update
using (bucket_id = 'product-images' and auth.role() = 'authenticated')
with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists product_images_auth_delete on storage.objects;
create policy product_images_auth_delete
on storage.objects
for delete
using (bucket_id = 'product-images' and auth.role() = 'authenticated');

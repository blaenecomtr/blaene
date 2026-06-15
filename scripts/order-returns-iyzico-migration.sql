-- Blaene payment + returns expansion migration
-- Run this script after the existing setup/mvp/customer migrations.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders: extra payment / refund fields (safe additive)
-- ---------------------------------------------------------------------------
alter table if exists public.orders
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists payment_metadata jsonb not null default '{}'::jsonb,
  add column if not exists refund_status text not null default 'none'
    check (refund_status in ('none', 'requested', 'partial', 'full')),
  add column if not exists refunded_total numeric(10,2) not null default 0,
  add column if not exists refunded_at timestamptz;

create index if not exists idx_orders_payment_provider_status on public.orders(payment_provider, payment_status);
create index if not exists idx_orders_refund_status on public.orders(refund_status);

-- ---------------------------------------------------------------------------
-- Customer addresses
-- ---------------------------------------------------------------------------
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Adres',
  full_name text not null,
  phone text,
  line1 text not null,
  line2 text,
  city text not null,
  district text,
  postal_code text,
  country text not null default 'TR',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_addresses_user_id on public.customer_addresses(user_id);
create index if not exists idx_customer_addresses_is_default on public.customer_addresses(user_id, is_default);

drop trigger if exists trg_customer_addresses_updated_at on public.customer_addresses;
create trigger trg_customer_addresses_updated_at
before update on public.customer_addresses
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Return requests
-- ---------------------------------------------------------------------------
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_no text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text,
  customer_email text,
  customer_phone text,
  reason text not null,
  details text,
  requested_items jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'in_transit', 'received', 'refunded', 'cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  refund_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_return_requests_user_id on public.return_requests(user_id);
create index if not exists idx_return_requests_order_id on public.return_requests(order_id);
create index if not exists idx_return_requests_status on public.return_requests(status);
create index if not exists idx_return_requests_created_at on public.return_requests(created_at desc);

drop trigger if exists trg_return_requests_updated_at on public.return_requests;
create trigger trg_return_requests_updated_at
before update on public.return_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Refund transactions
-- ---------------------------------------------------------------------------
create table if not exists public.refund_transactions (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid references public.return_requests(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_provider text not null,
  provider_ref text,
  amount numeric(10,2) not null,
  currency text not null default 'TRY',
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed')),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_refund_transactions_order_id on public.refund_transactions(order_id);
create index if not exists idx_refund_transactions_return_request_id on public.refund_transactions(return_request_id);
create index if not exists idx_refund_transactions_status on public.refund_transactions(status);

drop trigger if exists trg_refund_transactions_updated_at on public.refund_transactions;
create trigger trg_refund_transactions_updated_at
before update on public.refund_transactions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Order status history
-- ---------------------------------------------------------------------------
create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text,
  payment_status text,
  source text not null default 'system',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_status_logs_order_id on public.order_status_logs(order_id);
create index if not exists idx_order_status_logs_created_at on public.order_status_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.customer_addresses enable row level security;
alter table public.return_requests enable row level security;
alter table public.refund_transactions enable row level security;
alter table public.order_status_logs enable row level security;

drop policy if exists customer_addresses_self_read on public.customer_addresses;
create policy customer_addresses_self_read
on public.customer_addresses
for select to authenticated
using (user_id = auth.uid());

drop policy if exists customer_addresses_self_insert on public.customer_addresses;
create policy customer_addresses_self_insert
on public.customer_addresses
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists customer_addresses_self_update on public.customer_addresses;
create policy customer_addresses_self_update
on public.customer_addresses
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists customer_addresses_self_delete on public.customer_addresses;
create policy customer_addresses_self_delete
on public.customer_addresses
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists return_requests_self_read on public.return_requests;
create policy return_requests_self_read
on public.return_requests
for select to authenticated
using (user_id = auth.uid());

drop policy if exists return_requests_self_insert on public.return_requests;
create policy return_requests_self_insert
on public.return_requests
for insert to authenticated
with check (user_id = auth.uid());


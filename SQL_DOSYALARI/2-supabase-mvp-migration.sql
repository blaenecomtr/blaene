-- Blaene MVP Phase Migration
-- Run AFTER supabase-setup.sql in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Shared trigger function
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
-- Core helpers for RBAC and tier checks
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select up.role from public.user_profiles up where up.id = auth.uid()),
    'viewer'
  );
$$;

create or replace function public.current_subscription_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select up.subscription_tier from public.user_profiles up where up.id = auth.uid()),
    'free'
  );
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_subscription_tier() to authenticated;

-- ---------------------------------------------------------------------------
-- Existing table compatibility upgrades
-- ---------------------------------------------------------------------------
alter table if exists public.products
  add column if not exists stock_threshold integer not null default 0,
  add column if not exists stock_quantity integer not null default 0;

alter table if exists public.orders
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  add column if not exists shipping_provider text,
  add column if not exists tracking_code text,
  add column if not exists shipped_at timestamptz;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'viewer'
    check (role in ('super_admin', 'admin', 'editor', 'viewer')),
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro', 'enterprise')),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_role on public.user_profiles(role);
create index if not exists idx_user_profiles_tier on public.user_profiles(subscription_tier);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  sku text,
  color text,
  size text,
  price numeric(10,2),
  stock integer not null default 0,
  images text[] not null default '{}',
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_variants_product_id on public.product_variants(product_id);
create index if not exists idx_product_variants_sku on public.product_variants(sku);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_tier text not null
    check (subscription_tier in ('free', 'pro', 'enterprise')),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'canceled', 'expired', 'past_due')),
  source text not null default 'admin_manual',
  period_start timestamptz,
  period_end timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null,
  usage_limit integer not null default 0,
  usage_count integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  target_scope text not null default 'all',
  target_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_promotions_code on public.promotions(code);
create index if not exists idx_promotions_active on public.promotions(is_active);

create table if not exists public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  display_name text not null,
  is_active boolean not null default true,
  api_key_hint text,
  credentials_json jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketplace_connections_provider on public.marketplace_connections(provider);
create index if not exists idx_marketplace_connections_active on public.marketplace_connections(is_active);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_email text not null,
  subject text not null,
  status text not null default 'open'
    check (status in ('open', 'pending', 'closed')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  category text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  ai_suggested_tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_tickets_status on public.support_tickets(status);
create index if not exists idx_support_tickets_priority on public.support_tickets(priority);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null default 'agent'
    check (sender_type in ('customer', 'agent', 'system')),
  sender_name text,
  message text not null,
  ai_generated boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_messages_ticket_id on public.support_messages(ticket_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  request_path text,
  request_method text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_actor_user_id on public.audit_logs(actor_user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  amount numeric(12,2) not null,
  currency text not null default 'TRY',
  source text not null default 'manual',
  source_ref text,
  commission_rate numeric(6,2),
  commission_amount numeric(12,2),
  description text,
  transaction_date timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_transactions_date on public.financial_transactions(transaction_date desc);
create index if not exists idx_financial_transactions_type on public.financial_transactions(transaction_type);

-- ---------------------------------------------------------------------------
-- Updated_at triggers on new tables
-- ---------------------------------------------------------------------------
drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_variants_updated_at on public.product_variants;
create trigger trg_product_variants_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_promotions_updated_at on public.promotions;
create trigger trg_promotions_updated_at
before update on public.promotions
for each row execute function public.set_updated_at();

drop trigger if exists trg_marketplace_connections_updated_at on public.marketplace_connections;
create trigger trg_marketplace_connections_updated_at
before update on public.marketplace_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

drop trigger if exists trg_support_messages_updated_at on public.support_messages;
create trigger trg_support_messages_updated_at
before update on public.support_messages
for each row execute function public.set_updated_at();

drop trigger if exists trg_financial_transactions_updated_at on public.financial_transactions;
create trigger trg_financial_transactions_updated_at
before update on public.financial_transactions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS enablement
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.product_variants enable row level security;
alter table public.subscriptions enable row level security;
alter table public.promotions enable row level security;
alter table public.marketplace_connections enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.audit_logs enable row level security;
alter table public.financial_transactions enable row level security;

-- Existing tables are already enabled in supabase-setup.sql.

-- ---------------------------------------------------------------------------
-- RLS policies: user self-access + admin/editor expanded access
-- ---------------------------------------------------------------------------

-- user_profiles
drop policy if exists user_profiles_self_read on public.user_profiles;
create policy user_profiles_self_read
on public.user_profiles
for select
using (auth.uid() = id or public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists user_profiles_self_update on public.user_profiles;
create policy user_profiles_self_update
on public.user_profiles
for update
using (auth.uid() = id or public.current_app_role() in ('super_admin', 'admin'))
with check (auth.uid() = id or public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists user_profiles_admin_insert on public.user_profiles;
create policy user_profiles_admin_insert
on public.user_profiles
for insert
with check (public.current_app_role() in ('super_admin', 'admin'));

-- product_variants
drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read
on public.product_variants
for select
using (true);

drop policy if exists product_variants_editor_write on public.product_variants;
create policy product_variants_editor_write
on public.product_variants
for all
using (public.current_app_role() in ('super_admin', 'admin', 'editor'))
with check (public.current_app_role() in ('super_admin', 'admin', 'editor'));

-- subscriptions
drop policy if exists subscriptions_self_read on public.subscriptions;
create policy subscriptions_self_read
on public.subscriptions
for select
using (user_id = auth.uid() or public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists subscriptions_admin_write on public.subscriptions;
create policy subscriptions_admin_write
on public.subscriptions
for all
using (public.current_app_role() in ('super_admin', 'admin'))
with check (public.current_app_role() in ('super_admin', 'admin'));

-- promotions
drop policy if exists promotions_public_read on public.promotions;
create policy promotions_public_read
on public.promotions
for select
using (is_active = true or public.current_app_role() in ('super_admin', 'admin', 'editor'));

drop policy if exists promotions_editor_write on public.promotions;
create policy promotions_editor_write
on public.promotions
for all
using (public.current_app_role() in ('super_admin', 'admin', 'editor'))
with check (public.current_app_role() in ('super_admin', 'admin', 'editor'));

-- marketplace_connections
drop policy if exists marketplace_connections_admin_read on public.marketplace_connections;
create policy marketplace_connections_admin_read
on public.marketplace_connections
for select
using (public.current_app_role() in ('super_admin', 'admin', 'editor'));

drop policy if exists marketplace_connections_admin_write on public.marketplace_connections;
create policy marketplace_connections_admin_write
on public.marketplace_connections
for all
using (public.current_app_role() in ('super_admin', 'admin', 'editor'))
with check (public.current_app_role() in ('super_admin', 'admin', 'editor'));

-- support_tickets / support_messages
drop policy if exists support_tickets_staff_read on public.support_tickets;
create policy support_tickets_staff_read
on public.support_tickets
for select
using (public.current_app_role() in ('super_admin', 'admin', 'editor', 'viewer'));

drop policy if exists support_tickets_editor_write on public.support_tickets;
create policy support_tickets_editor_write
on public.support_tickets
for all
using (public.current_app_role() in ('super_admin', 'admin', 'editor'))
with check (public.current_app_role() in ('super_admin', 'admin', 'editor'));

drop policy if exists support_messages_staff_read on public.support_messages;
create policy support_messages_staff_read
on public.support_messages
for select
using (public.current_app_role() in ('super_admin', 'admin', 'editor', 'viewer'));

drop policy if exists support_messages_editor_write on public.support_messages;
create policy support_messages_editor_write
on public.support_messages
for all
using (public.current_app_role() in ('super_admin', 'admin', 'editor'))
with check (public.current_app_role() in ('super_admin', 'admin', 'editor'));

-- audit_logs
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read
on public.audit_logs
for select
using (public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists audit_logs_admin_insert on public.audit_logs;
create policy audit_logs_admin_insert
on public.audit_logs
for insert
with check (public.current_app_role() in ('super_admin', 'admin', 'editor'));

-- financial_transactions
drop policy if exists financial_transactions_staff_read on public.financial_transactions;
create policy financial_transactions_staff_read
on public.financial_transactions
for select
using (public.current_app_role() in ('super_admin', 'admin', 'editor', 'viewer'));

drop policy if exists financial_transactions_admin_write on public.financial_transactions;
create policy financial_transactions_admin_write
on public.financial_transactions
for all
using (public.current_app_role() in ('super_admin', 'admin'))
with check (public.current_app_role() in ('super_admin', 'admin'));

-- Existing tables: tighten write access to editor+
drop policy if exists products_auth_write on public.products;
create policy products_auth_write
on public.products
for all
using (public.current_app_role() in ('super_admin', 'admin', 'editor'))
with check (public.current_app_role() in ('super_admin', 'admin', 'editor'));

drop policy if exists orders_auth_read on public.orders;
create policy orders_auth_read
on public.orders
for select
using (public.current_app_role() in ('super_admin', 'admin', 'editor', 'viewer'));

drop policy if exists order_items_auth_read on public.order_items;
create policy order_items_auth_read
on public.order_items
for select
using (public.current_app_role() in ('super_admin', 'admin', 'editor', 'viewer'));

drop policy if exists payment_events_auth_read on public.payment_events;
create policy payment_events_auth_read
on public.payment_events
for select
using (public.current_app_role() in ('super_admin', 'admin'));

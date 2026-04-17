-- Blaene admin advanced features migration
-- Run this script in Supabase SQL Editor after existing setup/mvp migrations.

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
-- Product SEO fields
-- ---------------------------------------------------------------------------
alter table if exists public.products
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists seo_slug text;

create index if not exists idx_products_seo_slug on public.products(seo_slug);

-- ---------------------------------------------------------------------------
-- Customer registration profile extras
-- ---------------------------------------------------------------------------
alter table if exists public.customer_profiles
  add column if not exists username text,
  add column if not exists consent_kvkk boolean not null default false,
  add column if not exists consent_terms boolean not null default false,
  add column if not exists consent_marketing_email boolean not null default false,
  add column if not exists consent_marketing_sms boolean not null default false,
  add column if not exists consent_marketing_call boolean not null default false;

create index if not exists idx_customer_profiles_username on public.customer_profiles(username);

-- ---------------------------------------------------------------------------
-- Generic site settings storage
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  description text,
  is_public boolean not null default false,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists site_settings_staff_read on public.site_settings;
create policy site_settings_staff_read
on public.site_settings
for select
using (auth.role() = 'authenticated');

drop policy if exists site_settings_staff_write on public.site_settings;
create policy site_settings_staff_write
on public.site_settings
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- Blaene: Customer Membership System Migration
-- Run this script in Supabase SQL Editor after supabase-setup.sql and supabase-mvp-migration.sql

-- =========================
-- CUSTOMER PROFILES TABLE
-- =========================
-- Separate table for customer data (distinct from staff user_profiles)
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  default_address TEXT,
  default_city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON public.customer_profiles(email);

-- =========================
-- ORDERS MODIFICATION
-- =========================
-- Add user_id column to link orders to customer accounts
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- =========================
-- RLS POLICIES
-- =========================

-- Customer profiles: self-service CRUD
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_self_read ON public.customer_profiles;
CREATE POLICY customer_self_read
  ON public.customer_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS customer_self_update ON public.customer_profiles;
CREATE POLICY customer_self_update
  ON public.customer_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS customer_insert_own ON public.customer_profiles;
CREATE POLICY customer_insert_own
  ON public.customer_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Orders: Replace broad authenticated-read policy with customer-specific policy
-- Customers can only see their own orders (where user_id = auth.uid())
-- Admin API uses service_role_key which bypasses RLS, so admin access is unaffected

DROP POLICY IF EXISTS orders_auth_read ON public.orders;
DROP POLICY IF EXISTS customers_own_orders ON public.orders;
CREATE POLICY customers_own_orders
  ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Order items: customers can only see items from their own orders
DROP POLICY IF EXISTS order_items_auth_read ON public.order_items;
DROP POLICY IF EXISTS customers_own_order_items ON public.order_items;
CREATE POLICY customers_own_order_items
  ON public.order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchAdmin } from '../lib/adminApi';
import { supabase, TOKEN_STORAGE_KEY } from '../lib/supabase';

type AuthStatus = 'loading' | 'signed_out' | 'ready' | 'error';

export interface AdminProfile {
  id: string;
  email: string | null;
  full_name?: string | null;
  role: string;
  subscription_tier?: string | null;
  is_active?: boolean;
}

export interface AdminOrderItem {
  id: string;
  order_id: string;
  product_code?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  line_total?: number | null;
}

export interface AdminOrder {
  id: string;
  order_no?: string | null;
  merchant_oid?: string | null;
  customer_name?: string | null;
  email?: string | null;
  phone?: string | null;
  total?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  status?: string | null;
  paytr_status?: string | null;
  created_at?: string | null;
  items?: AdminOrderItem[];
}

export interface AdminProduct {
  id: string;
  code?: string | null;
  name?: string | null;
  category?: string | null;
  price?: number | null;
  stock_quantity?: number | null;
  stock_threshold?: number | null;
  active?: boolean | null;
}

export interface AdminConnection {
  id: string;
  provider?: string | null;
  display_name?: string | null;
  is_active?: boolean | null;
  last_sync_at?: string | null;
  updated_at?: string | null;
}

export interface AdminPromotion {
  id: string;
  code?: string | null;
  title?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  usage_count?: number | null;
  usage_limit?: number | null;
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
}

export interface AdminUser {
  id: string;
  email: string | null;
  full_name?: string | null;
  role?: string | null;
  subscription_tier?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_seen_at?: string | null;
}

export interface AdminAnalytics {
  range: {
    startIso?: string | null;
    endIso?: string | null;
    label?: string | null;
  };
  metrics: {
    paid_revenue: number;
    new_orders: number;
    paid_orders: number;
    active_users: number;
    scoped_new_users: number;
    conversion_rate: number;
    low_stock_products: number;
    open_support_tickets: number;
  };
  charts: {
    daily_sales: Array<{ date: string; orders: number; paid_revenue: number }>;
    payment_distribution: Record<string, number>;
    order_status_distribution: Record<string, number>;
    product_category_distribution: Record<string, number>;
  };
}

interface SignInResult {
  ok: boolean;
  error?: string;
}

interface CreateUserInput {
  email: string;
  full_name?: string;
  password?: string;
  role?: string;
  subscription_tier?: string;
  is_active?: boolean;
}

interface CreateUserResult {
  ok: boolean;
  error?: string;
  temporaryPassword?: string | null;
  userId?: string | null;
}

interface AdminContextValue {
  authStatus: AuthStatus;
  authError: string | null;
  dataError: string | null;
  loadingData: boolean;
  token: string | null;
  profile: AdminProfile | null;
  analytics: AdminAnalytics | null;
  orders: AdminOrder[];
  products: AdminProduct[];
  connections: AdminConnection[];
  promotions: AdminPromotion[];
  users: AdminUser[];
  usersAccessDenied: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshData: () => Promise<void>;
  createUser: (payload: CreateUserInput) => Promise<CreateUserResult>;
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined);
const FORCE_LOGIN_EVERY_VISIT = false;

function fallbackProfile(session: Session): AdminProfile {
  return {
    id: session.user.id,
    email: session.user.email || null,
    full_name: session.user.user_metadata?.full_name || null,
    role: 'viewer',
    subscription_tier: 'free',
    is_active: true,
  };
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersAccessDenied, setUsersAccessDenied] = useState(false);

  const setSignedOut = useCallback((error: string | null = null) => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setProfile(null);
    setAnalytics(null);
    setOrders([]);
    setProducts([]);
    setConnections([]);
    setPromotions([]);
    setUsers([]);
    setUsersAccessDenied(false);
    setLoadingData(false);
    setDataError(null);
    setAuthError(error);
    setAuthStatus('signed_out');
  }, []);

  const loadAppData = useCallback(
    async (accessToken: string) => {
      setLoadingData(true);
      setDataError(null);

      const [analyticsRes, ordersRes, productsRes, connectionsRes, promotionsRes, usersRes] = await Promise.all([
        fetchAdmin<AdminAnalytics>('/api/admin/analytics?range=month', accessToken),
        fetchAdmin<AdminOrder[]>('/api/admin/orders?page=1&page_size=200&include_items=true', accessToken),
        fetchAdmin<AdminProduct[]>('/api/admin/products?page=1&page_size=1000', accessToken),
        fetchAdmin<AdminConnection[]>('/api/admin/marketplace-connections?page=1&page_size=200', accessToken),
        fetchAdmin<AdminPromotion[]>('/api/admin/promotions?page=1&page_size=200', accessToken),
        fetchAdmin<AdminUser[]>('/api/admin/users?page=1&page_size=200', accessToken),
      ]);

      const responses = [analyticsRes, ordersRes, productsRes, connectionsRes, promotionsRes, usersRes];
      if (responses.some((result) => result.status === 401)) {
        setSignedOut('Oturum suresi doldu. Lutfen tekrar giris yapin.');
        return;
      }

      if (analyticsRes.ok && analyticsRes.data) {
        setAnalytics(analyticsRes.data);
      } else {
        setAnalytics(null);
      }

      setOrders(ordersRes.ok && Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setProducts(productsRes.ok && Array.isArray(productsRes.data) ? productsRes.data : []);
      setConnections(connectionsRes.ok && Array.isArray(connectionsRes.data) ? connectionsRes.data : []);
      if (connectionsRes.status === 403) {
        setConnections([]);
      }

      setPromotions(promotionsRes.ok && Array.isArray(promotionsRes.data) ? promotionsRes.data : []);
      if (promotionsRes.status === 403) {
        setPromotions([]);
      }

      if (usersRes.ok && Array.isArray(usersRes.data)) {
        setUsers(usersRes.data);
        setUsersAccessDenied(false);
      } else if (usersRes.status === 403) {
        setUsers([]);
        setUsersAccessDenied(true);
      } else {
        setUsers([]);
        setUsersAccessDenied(false);
      }

      const errors = responses
        .filter((result) => !result.ok && result.status !== 403)
        .map((result) => result.error)
        .filter(Boolean) as string[];
      setDataError(errors.length ? errors.join(' | ') : null);
      setLoadingData(false);
    },
    [setSignedOut]
  );

  const hydrateFromSession = useCallback(
    async (session: Session | null) => {
      if (!session?.access_token) {
        setSignedOut(null);
        return;
      }

      const accessToken = session.access_token;
      localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
      setToken(accessToken);
      setAuthError(null);
      setProfile(fallbackProfile(session));

      const meRes = await fetchAdmin<{ user: { id: string; email: string | null }; profile: AdminProfile }>(
        '/api/admin/me',
        accessToken
      );

      if (meRes.status === 401) {
        setSignedOut('Oturum suresi doldu. Lutfen tekrar giris yapin.');
        return;
      }

      if (meRes.ok && meRes.data?.profile) {
        setProfile(meRes.data.profile);
      } else if (!meRes.ok) {
        setAuthError(meRes.error || 'Profil bilgisi okunamadi');
      }

      setAuthStatus('ready');
      await loadAppData(accessToken);
    },
    [loadAppData, setSignedOut]
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      setAuthStatus('loading');
      setAuthError(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setAuthStatus('signed_out');
        setAuthError(error.message);
        return { ok: false, error: error.message };
      }
      await hydrateFromSession(data.session ?? null);
      return { ok: true };
    },
    [hydrateFromSession]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => null);
    setSignedOut(null);
  }, [setSignedOut]);

  const refreshData = useCallback(async () => {
    if (!token) return;
    await loadAppData(token);
  }, [loadAppData, token]);

  const createUser = useCallback(
    async (payload: CreateUserInput): Promise<CreateUserResult> => {
      if (!token) {
        return { ok: false, error: 'Oturum bulunamadi' };
      }

      const result = await fetchAdmin<{ id?: string; temporary_password?: string | null }>('/api/admin/users', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (result.status === 401) {
        setSignedOut('Oturum suresi doldu. Lutfen tekrar giris yapin.');
        return { ok: false, error: 'Oturum suresi doldu' };
      }

      if (!result.ok) {
        return { ok: false, error: result.error || 'Uyelik olusturulamadi' };
      }

      await refreshData();
      return {
        ok: true,
        temporaryPassword: result.data?.temporary_password || null,
        userId: result.data?.id || null,
      };
    },
    [refreshData, setSignedOut, token]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (FORCE_LOGIN_EVERY_VISIT) {
        await supabase.auth.signOut().catch(() => null);
        if (cancelled) return;
        setSignedOut(null);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setAuthStatus('error');
        setAuthError(error.message);
        return;
      }
      await hydrateFromSession(data.session ?? null);
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void hydrateFromSession(session ?? null);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [hydrateFromSession]);

  const value = useMemo<AdminContextValue>(
    () => ({
      authStatus,
      authError,
      dataError,
      loadingData,
      token,
      profile,
      analytics,
      orders,
      products,
      connections,
      promotions,
      users,
      usersAccessDenied,
      signIn,
      signOut,
      refreshData,
      createUser,
    }),
    [
      analytics,
      authError,
      authStatus,
      connections,
      createUser,
      dataError,
      loadingData,
      orders,
      promotions,
      products,
      profile,
      refreshData,
      signIn,
      signOut,
      token,
      users,
      usersAccessDenied,
    ]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdminContext must be used inside AdminProvider');
  }
  return context;
}

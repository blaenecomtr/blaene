import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_uKwxlDCAxSOzus7W96aF9w_m2iDE2QA';
export const TOKEN_STORAGE_KEY = 'blaene_admin_access_token';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    },
  },
});

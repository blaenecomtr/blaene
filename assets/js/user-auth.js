// Blaene Customer Authentication
// Supabase Auth helpers for customer login/register/account management

(function (global) {
  // Supabase credentials (same as storefront.js for consistency)
  const SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_uKwxlDCAxSOzus7W96aF9w_m2iDE2QA';

  let supabaseClient = null;

  /**
   * Initialize Supabase client (requires supabase JS library to be loaded)
   */
  function initSupabase() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('Supabase JS library not loaded');
      return null;
    }
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
  }

  /**
   * Get current Supabase client instance
   */
  function getSupabase() {
    if (!supabaseClient) {
      return initSupabase();
    }
    return supabaseClient;
  }

  /**
   * Sign up new customer with email, password, name, phone
   * Creates auth.users entry + customer_profiles row
   */
  async function signUp(email, password, fullName, phone) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    email = (email || '').trim().toLowerCase();
    fullName = (fullName || '').trim();
    phone = (phone || '').trim();

    if (!email || !password || !fullName || !phone) {
      throw new Error('Tüm alanlar gerekli');
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone,
        },
      },
    });

    if (authError) {
      throw new Error(authError.message || 'Kayıt başarısız');
    }

    if (!authData.user) {
      throw new Error('Kullanıcı oluşturulamadı');
    }

    // 2. Create customer profile
    const { error: profileError } = await client
      .from('customer_profiles')
      .insert([
        {
          id: authData.user.id,
          email,
          full_name: fullName,
          phone,
        },
      ]);

    if (profileError) {
      console.error('Customer profile creation failed:', profileError);
      // Auth user created but profile failed — still allow login
    }

    return authData.user;
  }

  /**
   * Sign in with email and password
   */
  async function signIn(email, password) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    email = (email || '').trim().toLowerCase();

    if (!email || !password) {
      throw new Error('E-posta ve şifre gerekli');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message || 'Giriş başarısız');
    }

    if (!data.user) {
      throw new Error('Giriş yapılamadı');
    }

    return data.user;
  }

  /**
   * Sign out current user
   */
  async function signOut() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.signOut();
    if (error) {
      throw new Error(error.message || 'Çıkış başarısız');
    }
  }

  /**
   * Get current session
   */
  async function getSession() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error('Session fetch error:', error);
      return null;
    }
    return data.session;
  }

  /**
   * Get currently logged-in user
   */
  async function getCurrentUser() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return null;
    }
    return data.user;
  }

  /**
   * Get customer profile from customer_profiles table
   */
  async function getCustomerProfile() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await client
      .from('customer_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Profile fetch error:', error);
      return null;
    }
    return data;
  }

  /**
   * Update customer profile (phone, default_address, default_city)
   */
  async function updateCustomerProfile(updates) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı oturum açmamış');

    const { error } = await client
      .from('customer_profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      throw new Error(error.message || 'Profil güncellenemedi');
    }
  }

  /**
   * Fetch customer's orders from orders table
   */
  async function getCustomerOrders() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı oturum açmamış');

    const { data, error } = await client
      .from('orders')
      .select(
        `
      id,
      order_no,
      customer_name,
      email,
      phone,
      subtotal,
      shipping,
      total,
      payment_status,
      status,
      shipping_provider,
      tracking_code,
      shipped_at,
      created_at,
      updated_at,
      order_items (
        id,
        product_code,
        product_name,
        unit_price,
        quantity,
        line_total
      )
    `
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Orders fetch error:', error);
      throw new Error('Siparişler yüklenemedi');
    }

    return data || [];
  }

  /**
   * Listen for auth state changes
   * Calls callback whenever auth state changes (login/logout)
   */
  function onAuthStateChange(callback) {
    const client = getSupabase();
    if (!client) return null;

    const { data } = client.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return data.subscription;
  }

  /**
   * Get access token for API calls (Authorization: Bearer <token>)
   */
  async function getAccessToken() {
    const session = await getSession();
    return session?.access_token || null;
  }

  // Export functions
  global.BlaeneAuth = {
    initSupabase,
    getSupabase,
    signUp,
    signIn,
    signOut,
    getSession,
    getCurrentUser,
    getCustomerProfile,
    updateCustomerProfile,
    getCustomerOrders,
    onAuthStateChange,
    getAccessToken,
  };
})(window);

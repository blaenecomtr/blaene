// Blaene Customer Authentication
// Supabase Auth helpers for customer login/register/account management

(function (global) {
  const SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_uKwxlDCAxSOzus7W96aF9w_m2iDE2QA';

  let supabaseClient = null;
  const DUPLICATE_EMAIL_ERROR = 'Bu e-posta ile zaten bir hesap var. Giriş yapın veya şifremi unuttum adımını kullanın.';

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

  function getSupabase() {
    if (!supabaseClient) {
      return initSupabase();
    }
    return supabaseClient;
  }

  function isDuplicateEmailMessage(message) {
    const text = String(message || '').trim().toLowerCase();
    if (!text) return false;
    return (
      text.includes('already registered') ||
      text.includes('already exists') ||
      text.includes('already in use') ||
      text.includes('email exists') ||
      text.includes('user already') ||
      text.includes('bu e-posta') ||
      text.includes('kullanımda')
    );
  }

  function isObfuscatedExistingUser(authData) {
    const identities = authData && authData.user && authData.user.identities;
    return Array.isArray(identities) && identities.length === 0;
  }

  async function signUp(email, password, fullName, phone, options = {}) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    email = String(email || '').trim().toLowerCase();
    fullName = String(fullName || '').trim();
    phone = String(phone || '').trim();
    const defaultAddress = String(options.default_address || '').trim();
    const defaultCity = String(options.default_city || '').trim();
    const customerType = String(options.customer_type || '').trim().toLowerCase();
    const username = String(options.username || '').trim().toLowerCase();
    const consentKvkk = options.consent_kvkk === true;
    const consentTerms = options.consent_terms === true;
    const consentEmail = options.consent_marketing_email === true;
    const consentSms = options.consent_marketing_sms === true;
    const consentCall = options.consent_marketing_call === true;

    if (!email || !password || !fullName || !phone || !defaultAddress) {
      throw new Error('Tum alanlar gerekli');
    }
    if (!username || username.length < 3) {
      throw new Error('Kullanici adi en az 3 karakter olmali');
    }
    if (!consentKvkk || !consentTerms) {
      throw new Error('KVKK ve sozlesme onaylari zorunlu');
    }

    const { data: authData, error: authError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          default_address: defaultAddress,
          default_city: defaultCity,
          username,
          customer_type: customerType,
          consent_kvkk: consentKvkk,
          consent_terms: consentTerms,
          consent_marketing_email: consentEmail,
          consent_marketing_sms: consentSms,
          consent_marketing_call: consentCall,
        },
      },
    });

    if (authError) {
      if (isDuplicateEmailMessage(authError.message)) {
        throw new Error(DUPLICATE_EMAIL_ERROR);
      }
      throw new Error(authError.message || 'Kayit basarisiz');
    }
    if (isObfuscatedExistingUser(authData)) {
      throw new Error(DUPLICATE_EMAIL_ERROR);
    }
    if (!authData.user) {
      throw new Error('Kullanici olusturulamadi');
    }

    const richProfile = {
      id: authData.user.id,
      email,
      username,
      full_name: fullName,
      phone,
      default_address: defaultAddress,
      default_city: defaultCity,
      consent_kvkk: consentKvkk,
      consent_terms: consentTerms,
      consent_marketing_email: consentEmail,
      consent_marketing_sms: consentSms,
      consent_marketing_call: consentCall,
    };

    let { error: profileError } = await client
      .from('customer_profiles')
      .upsert([richProfile], { onConflict: 'id' });

    if (profileError) {
      const basicProfile = {
        id: authData.user.id,
        email,
        full_name: fullName,
        phone,
        default_address: defaultAddress,
        default_city: defaultCity,
      };
      const fallback = await client
        .from('customer_profiles')
        .upsert([basicProfile], { onConflict: 'id' });
      if (!fallback.error) {
        profileError = null;
      } else {
        const minimalProfile = {
          id: authData.user.id,
          email,
          full_name: fullName,
          phone,
          default_address: defaultAddress,
        };
        const finalFallback = await client
          .from('customer_profiles')
          .upsert([minimalProfile], { onConflict: 'id' });
        if (!finalFallback.error) profileError = null;
      }
    }

    if (profileError) {
      console.error('Customer profile creation failed:', profileError);
    }

    // Ensure session exists immediately after signup when confirmation is disabled.
    // If email confirmation is enabled, this may fail and caller can proceed with pending confirmation flow.
    if (!authData.session) {
      try {
        const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (!signInError && signInData?.user) {
          return signInData.user;
        }
      } catch (_) {
        // ignore; signup itself was successful
      }
    }

    return authData.user;
  }

  async function signIn(email, password) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    email = String(email || '').trim().toLowerCase();
    if (!email || !password) {
      throw new Error('E-posta ve sifre gerekli');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message || 'Giris basarisiz');
    }
    if (!data.user) {
      throw new Error('Giris yapilamadi');
    }
    return data.user;
  }

  async function signInWithGoogle(redirectPath = '/account.html') {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const redirectTo = new URL(redirectPath, window.location.origin).toString();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      throw new Error(error.message || 'Google girisi basarisiz');
    }

    return data;
  }

  async function signOut() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.signOut();
    if (error) {
      throw new Error(error.message || 'Cikis basarisiz');
    }
  }

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

  async function getCurrentUser() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return null;
    }
    return data.user;
  }

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

  async function updateCustomerProfile(updates) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanici oturum acmamis');

    const { error } = await client
      .from('customer_profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      throw new Error(error.message || 'Profil guncellenemedi');
    }
  }

  async function getCustomerOrders() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanici oturum acmamis');

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
      throw new Error('Siparisler yuklenemedi');
    }

    const orders = Array.isArray(data) ? data : [];
    if (!orders.length) return orders;

    const codeSet = new Set();
    const nameSet = new Set();
    orders.forEach((order) => {
      const items = Array.isArray(order && order.order_items) ? order.order_items : [];
      items.forEach((item) => {
        const code = String(item && item.product_code || '').trim();
        const name = String(item && item.product_name || '').trim().toLowerCase();
        if (code) codeSet.add(code);
        if (name) nameSet.add(name);
      });
    });

    if (!codeSet.size && !nameSet.size) return orders;

    const imageByCode = new Map();
    const imageByName = new Map();

    function extractFirstImage(imagesValue) {
      if (Array.isArray(imagesValue)) {
        const first = imagesValue.map((v) => String(v || '').trim()).find(Boolean);
        return first || '';
      }
      if (typeof imagesValue === 'string') {
        const raw = imagesValue.trim();
        if (!raw) return '';
        if (raw.startsWith('[')) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const first = parsed.map((v) => String(v || '').trim()).find(Boolean);
              if (first) return first;
            }
          } catch (_) {
            /* ignore JSON parse errors, fallback to raw string */
          }
        }
        return raw;
      }
      return '';
    }

    async function pullProductImagesByCodes(codes) {
      if (!codes.length) return;
      const { data: products, error: productError } = await client
        .from('products')
        .select('code,name,images')
        .in('code', codes);
      if (productError) {
        console.warn('Products by code fetch failed:', productError);
        return;
      }
      (products || []).forEach((product) => {
        const firstImage = extractFirstImage(product && product.images);
        if (!firstImage) return;
        const code = String(product && product.code || '').trim();
        const name = String(product && product.name || '').trim().toLowerCase();
        if (code) imageByCode.set(code, firstImage);
        if (name && !imageByName.has(name)) imageByName.set(name, firstImage);
      });
    }

    async function pullProductImagesByNames(names) {
      if (!names.length) return;
      const { data: products, error: productError } = await client
        .from('products')
        .select('code,name,images')
        .in('name', names.map((n) => String(n)));
      if (productError) {
        console.warn('Products by name fetch failed:', productError);
        return;
      }
      (products || []).forEach((product) => {
        const firstImage = extractFirstImage(product && product.images);
        if (!firstImage) return;
        const code = String(product && product.code || '').trim();
        const name = String(product && product.name || '').trim().toLowerCase();
        if (code && !imageByCode.has(code)) imageByCode.set(code, firstImage);
        if (name) imageByName.set(name, firstImage);
      });
    }

    await pullProductImagesByCodes(Array.from(codeSet));
    await pullProductImagesByNames(Array.from(nameSet));

    orders.forEach((order) => {
      const items = Array.isArray(order && order.order_items) ? order.order_items : [];
      items.forEach((item) => {
        const code = String(item && item.product_code || '').trim();
        const name = String(item && item.product_name || '').trim().toLowerCase();
        const mappedImage = imageByCode.get(code) || imageByName.get(name) || '';
        if (mappedImage) item.image_url = mappedImage;
      });
    });

    return orders;
  }

  function onAuthStateChange(callback) {
    const client = getSupabase();
    if (!client) return null;

    const { data } = client.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return data.subscription;
  }

  async function getAccessToken() {
    const session = await getSession();
    return session?.access_token || null;
  }

  async function updatePassword(newPassword) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    if (!newPassword || String(newPassword).length < 6) {
      throw new Error('Sifre en az 6 karakter olmali');
    }

    const { error } = await client.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      throw new Error(error.message || 'Sifre guncellenemedi');
    }
  }

  global.BlaeneAuth = {
    initSupabase,
    getSupabase,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    getSession,
    getCurrentUser,
    getCustomerProfile,
    updateCustomerProfile,
    getCustomerOrders,
    onAuthStateChange,
    getAccessToken,
    updatePassword,
  };
})(window);

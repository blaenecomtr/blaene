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

  const EMAIL_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
  const EMAIL_RESEND_COOLDOWN_PREFIX = 'blaene_email_resend_cooldown:';
  const SIGNUP_RATE_LIMIT_COOLDOWN_MS = 3 * 60 * 1000;
  const SIGNUP_RATE_LIMIT_PREFIX = 'blaene_signup_rate_limit:';

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

  function isEmailNotConfirmedError(message) {
    const text = String(message || '').trim().toLowerCase();
    if (!text) return false;
    return (
      text.includes('email not confirmed') ||
      text.includes('email_not_confirmed') ||
      text.includes('not confirmed')
    );
  }

  function isEmailRateLimitError(message) {
    const text = String(message || '').trim().toLowerCase();
    if (!text) return false;
    return (
      text.includes('rate limit') ||
      text.includes('too many requests') ||
      text.includes('too many') ||
      text.includes('over_email_send_rate_limit') ||
      text.includes('email rate limit') ||
      text.includes('for security purposes')
    );
  }

  function getEmailResendCooldownUntil(email) {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail) return 0;
    const key = EMAIL_RESEND_COOLDOWN_PREFIX + safeEmail;
    const raw = String(localStorage.getItem(key) || '').trim();
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function setEmailResendCooldown(email, ms) {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail) return;
    const key = EMAIL_RESEND_COOLDOWN_PREFIX + safeEmail;
    const until = Date.now() + Math.max(0, Number(ms || 0));
    localStorage.setItem(key, String(until));
  }

  function getSignupRateLimitUntil(email) {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail) return 0;
    const key = SIGNUP_RATE_LIMIT_PREFIX + safeEmail;
    const raw = String(localStorage.getItem(key) || '').trim();
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function setSignupRateLimitCooldown(email, ms) {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail) return;
    const key = SIGNUP_RATE_LIMIT_PREFIX + safeEmail;
    const until = Date.now() + Math.max(0, Number(ms || 0));
    localStorage.setItem(key, String(until));
  }

  async function tryExpediteSignupVerificationEmail(client, email) {
    if (!client || !email) return;
    try {
      const { error: resendError } = await client.auth.resend({
        type: 'signup',
        email,
      });
      if (resendError && isEmailRateLimitError(resendError.message)) {
        setSignupRateLimitCooldown(email, SIGNUP_RATE_LIMIT_COOLDOWN_MS);
      }
    } catch (_) {
      // Verification resend is best-effort; signup flow should continue.
    }
  }

  function makeAuthError(message, code) {
    const error = new Error(message || 'Islem basarisiz');
    if (code) error.code = code;
    return error;
  }

  function mapSignInErrorMessage(message) {
    const text = String(message || '').trim().toLowerCase();
    if (!text) return 'Giris basarisiz';
    if (isEmailNotConfirmedError(text)) {
      return 'E-posta dogrulamasi tamamlanmamis. Lutfen e-postanizdaki dogrulama baglantisina tiklayin.';
    }
    if (text.includes('invalid login credentials') || text.includes('invalid credentials')) {
      return 'E-posta veya sifre hatali.';
    }
    if (text.includes('too many requests') || text.includes('rate limit')) {
      return 'Cok fazla giris denemesi yapildi. Lutfen kisa bir sure sonra tekrar deneyin.';
    }
    return message || 'Giris basarisiz';
  }

  function formatCooldownSeconds(ms) {
    const seconds = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
    return String(seconds);
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
    let username = String(options.username || '').trim().toLowerCase();
    const companyName = String(options.company_name || '').trim();
    const nationalId = String(options.national_id || '').trim();
    const taxNumber = String(options.tax_number || '').trim();
    const taxOffice = String(options.tax_office || '').trim();
    const consentKvkk = options.consent_kvkk === true;
    const consentTerms = options.consent_terms === true;
    const consentEmail = options.consent_marketing_email === true;
    const consentSms = options.consent_marketing_sms === true;
    const consentCall = options.consent_marketing_call === true;

    if (!email || !password || !fullName || !phone || !defaultAddress) {
      throw new Error('Tum alanlar gerekli');
    }
    if (!username) {
      username = String(email.split('@')[0] || '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 32);
    }
    if (!username || username.length < 3) {
      username = ('user' + Math.random().toString(36).slice(2, 8)).slice(0, 32);
    }
    if (!consentKvkk || !consentTerms) {
      throw new Error('KVKK ve sozlesme onaylari zorunlu');
    }
    if (customerType === 'kurumsal' && (!companyName || !nationalId || !taxNumber || !taxOffice)) {
      throw new Error('Kurumsal hesap icin firma adi, TC, vergi no ve vergi dairesi zorunludur');
    }
    const signupCooldownUntil = getSignupRateLimitUntil(email);
    if (signupCooldownUntil > Date.now()) {
      const secondsLeft = formatCooldownSeconds(signupCooldownUntil - Date.now());
      throw makeAuthError(
        `Dogrulama e-postasi gonderim limiti aktif. Lutfen ${secondsLeft} sn bekleyip tekrar deneyin veya mevcut dogrulama e-postanizi kullanin.`,
        'AUTH_EMAIL_RATE_LIMIT'
      );
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
          customer_kind: customerType,
          company_name: companyName || null,
          national_id: nationalId || null,
          tax_number: taxNumber || null,
          tax_office: taxOffice || null,
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
      if (isEmailRateLimitError(authError.message)) {
        setSignupRateLimitCooldown(email, SIGNUP_RATE_LIMIT_COOLDOWN_MS);
        try {
          const { error: signInError } = await client.auth.signInWithPassword({ email, password });
          if (signInError && isEmailNotConfirmedError(signInError.message)) {
            throw makeAuthError(
              'Kayit zaten olusmus olabilir. Dogrulama e-postanizi (spam dahil) kontrol edin ve e-postanizi dogrulayip giris yapin.',
              'AUTH_EMAIL_NOT_CONFIRMED'
            );
          }
        } catch (pendingError) {
          if (pendingError && (pendingError.code === 'AUTH_EMAIL_NOT_CONFIRMED')) {
            throw pendingError;
          }
        }
        throw makeAuthError(
          'E-posta kullanim limiti asildi. Lutfen kisa bir sure bekleyin; hesap olustuysa mevcut dogrulama e-postanizi kullanarak giris yapabilirsiniz.',
          'AUTH_EMAIL_RATE_LIMIT'
        );
      }
      throw new Error(authError.message || 'Kayit basarisiz');
    }
    if (isObfuscatedExistingUser(authData)) {
      throw new Error(DUPLICATE_EMAIL_ERROR);
    }
    if (!authData.user) {
      throw new Error('Kullanici olusturulamadi');
    }
    localStorage.removeItem(SIGNUP_RATE_LIMIT_PREFIX + email);

    // Email confirmation enabled flows may take time to deliver on first send.
    // Trigger a best-effort resend right after signup without blocking UI flow.
    if (!authData.session) {
      void tryExpediteSignupVerificationEmail(client, email);
    }

    const richProfile = {
      id: authData.user.id,
      email,
      username,
      full_name: fullName,
      phone,
      default_address: defaultAddress,
      default_city: defaultCity,
      customer_type: customerType || null,
      customer_kind: customerType || null,
      company_name: companyName || null,
      national_id: nationalId || null,
      tax_number: taxNumber || null,
      tax_office: taxOffice || null,
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
        if (signInError && isEmailNotConfirmedError(signInError.message)) {
          void tryExpediteSignupVerificationEmail(client, email);
          throw makeAuthError(
            'Kayit tamamlandi ancak e-posta dogrulamasi gerekiyor. Dogrulama e-postasi yeniden tetiklendi; gelen kutunuzu (spam dahil) kontrol edip linke tiklayin.',
            'AUTH_EMAIL_NOT_CONFIRMED'
          );
        }
        throw makeAuthError(
          'Kayit tamamlandi ancak otomatik giris yapilamadi. Lutfen giris ekranindan devam edin.',
          'AUTH_SIGNUP_SESSION_MISSING'
        );
      } catch (_) {
        if (_ && _.code === 'AUTH_EMAIL_NOT_CONFIRMED') {
          throw _;
        }
        if (_ && _.code === 'AUTH_SIGNUP_SESSION_MISSING') {
          throw _;
        }
        throw makeAuthError(
          'Kayit tamamlandi ancak oturum baslatilamadi. Lutfen e-posta ve sifrenizle giris yapin.',
          'AUTH_SIGNUP_SESSION_MISSING'
        );
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
      if (isEmailNotConfirmedError(error.message)) {
        const cooldownUntil = getEmailResendCooldownUntil(email);
        if (cooldownUntil > Date.now()) {
          const secondsLeft = formatCooldownSeconds(cooldownUntil - Date.now());
          throw makeAuthError(
            `E-posta dogrulanmamis. Dogrulama e-postasi zaten gonderildi; lutfen ${secondsLeft} sn bekleyip tekrar deneyin veya gelen kutunuzu kontrol edin.`,
            'AUTH_EMAIL_NOT_CONFIRMED'
          );
        }
        try {
          const { error: resendError } = await client.auth.resend({
            type: 'signup',
            email,
          });
          if (resendError) {
            if (isEmailRateLimitError(resendError.message)) {
              setEmailResendCooldown(email, EMAIL_RESEND_COOLDOWN_MS);
              throw makeAuthError(
                'E-posta kullanim limiti asildi. Lutfen birkac dakika bekleyip tekrar deneyin veya daha once gelen dogrulama e-postasini kullanin.',
                'AUTH_EMAIL_RESEND_RATE_LIMIT'
              );
            }
            throw resendError;
          }
          setEmailResendCooldown(email, EMAIL_RESEND_COOLDOWN_MS);
        } catch (_) {
          if (_ && _.code === 'AUTH_EMAIL_RESEND_RATE_LIMIT') {
            throw _;
          }
        }
        throw makeAuthError(
          'E-posta dogrulanmamis. Dogrulama e-postasi yeniden gonderildi; gelen kutunuzu (spam dahil) kontrol edip tekrar deneyin.',
          'AUTH_EMAIL_NOT_CONFIRMED'
        );
      }
      throw makeAuthError(mapSignInErrorMessage(error.message), 'AUTH_SIGNIN_FAILED');
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
      const raw = String(error.message || '').toLowerCase();
      if (raw.includes('unsupported provider') || raw.includes('provider is not enabled')) {
        throw new Error('Google girisi aktif degil. Supabase > Authentication > Providers > Google secenegini acin.');
      }
      throw new Error(error.message || 'Google girisi basarisiz');
    }

    if (data && data.url) {
      window.location.assign(data.url);
      return data;
    }

    throw new Error('Google yonlendirme baglantisi olusturulamadi. Lutfen tekrar deneyin.');
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
      .maybeSingle();

    if (error) {
      console.error('Profile fetch error:', error);
      return null;
    }

    if (data) {
      const meta = user.user_metadata || {};
      return {
        ...data,
        customer_type:
          String(data.customer_type || data.customer_kind || meta.customer_type || meta.customer_kind || '').trim() || null,
        customer_kind:
          String(data.customer_kind || data.customer_type || meta.customer_kind || meta.customer_type || '').trim() || null,
        company_name: String(data.company_name || meta.company_name || '').trim() || null,
        national_id: String(data.national_id || meta.national_id || '').trim() || null,
        tax_number: String(data.tax_number || meta.tax_number || '').trim() || null,
        tax_office: String(data.tax_office || meta.tax_office || '').trim() || null,
      };
    }

    const meta = user.user_metadata || {};
    if (!meta || typeof meta !== 'object') return null;

    return {
      id: user.id,
      email: String(user.email || '').trim().toLowerCase() || null,
      full_name: String(meta.full_name || meta.name || '').trim() || null,
      phone: String(meta.phone || '').trim() || null,
      default_address: String(meta.default_address || '').trim() || null,
      default_city: String(meta.default_city || '').trim() || null,
      customer_type: String(meta.customer_type || '').trim() || null,
      customer_kind: String(meta.customer_kind || '').trim() || null,
      company_name: String(meta.company_name || '').trim() || null,
      national_id: String(meta.national_id || '').trim() || null,
      tax_number: String(meta.tax_number || '').trim() || null,
      tax_office: String(meta.tax_office || '').trim() || null,
    };
  }

  function hasCorporateColumnError(message) {
    const text = String(message || '').toLowerCase();
    if (!text) return false;
    return (
      text.includes('customer_type') ||
      text.includes('customer_kind') ||
      text.includes('company_name') ||
      text.includes('national_id') ||
      text.includes('tax_number') ||
      text.includes('tax_office')
    );
  }

  async function syncAuthUserMetadata(client, safeUpdates) {
    const data = {};
    [
      'full_name',
      'phone',
      'default_address',
      'default_city',
      'customer_type',
      'customer_kind',
      'company_name',
      'national_id',
      'tax_number',
      'tax_office',
    ].forEach((key) => {
      if (safeUpdates[key] !== undefined) data[key] = safeUpdates[key];
    });
    if (!Object.keys(data).length) return;

    try {
      await client.auth.updateUser({ data });
    } catch (error) {
      console.warn('Auth metadata sync failed:', error);
    }
  }

  async function updateCustomerProfile(updates) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanici oturum acmamis');

    const safeUpdates = updates && typeof updates === 'object' ? { ...updates } : {};
    delete safeUpdates.id;
    delete safeUpdates.email;

    const { data: existing, error: existingError } = await client
      .from('customer_profiles')
      .select('id,email,full_name,phone,default_address,default_city')
      .eq('id', user.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message || 'Profil bilgileri okunamadi');
    }

    const fallbackUpdates = { ...safeUpdates };
    delete fallbackUpdates.customer_type;
    delete fallbackUpdates.customer_kind;
    delete fallbackUpdates.company_name;
    delete fallbackUpdates.national_id;
    delete fallbackUpdates.tax_number;
    delete fallbackUpdates.tax_office;

    if (existing && existing.id) {
      let { error } = await client
        .from('customer_profiles')
        .update(safeUpdates)
        .eq('id', user.id);

      if (error && hasCorporateColumnError(error.message)) {
        const fallbackResult = await client
          .from('customer_profiles')
          .update(fallbackUpdates)
          .eq('id', user.id);
        error = fallbackResult.error || null;
      }

      if (error) {
        throw new Error(error.message || 'Profil guncellenemedi');
      }
      await syncAuthUserMetadata(client, safeUpdates);
      return;
    }

    const fallbackName =
      String(safeUpdates.full_name || '').trim() ||
      String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim() ||
      String((user.email || '').split('@')[0] || '').replace(/[._-]+/g, ' ').trim() ||
      'Musteri';

    const insertPayload = {
      id: user.id,
      email: String(user.email || '').trim().toLowerCase(),
      full_name: fallbackName,
      phone: safeUpdates.phone !== undefined ? safeUpdates.phone : null,
      default_address: safeUpdates.default_address !== undefined ? safeUpdates.default_address : null,
      default_city: safeUpdates.default_city !== undefined ? safeUpdates.default_city : null,
      ...safeUpdates,
    };

    let { error: insertError } = await client
      .from('customer_profiles')
      .upsert([insertPayload], { onConflict: 'id' });

    if (insertError && hasCorporateColumnError(insertError.message)) {
      const fallbackPayload = {
        id: user.id,
        email: String(user.email || '').trim().toLowerCase(),
        full_name: fallbackName,
        phone: safeUpdates.phone !== undefined ? safeUpdates.phone : null,
        default_address: safeUpdates.default_address !== undefined ? safeUpdates.default_address : null,
        default_city: safeUpdates.default_city !== undefined ? safeUpdates.default_city : null,
        ...fallbackUpdates,
      };
      const fallbackInsert = await client
        .from('customer_profiles')
        .upsert([fallbackPayload], { onConflict: 'id' });
      insertError = fallbackInsert.error || null;
    }

    if (insertError) {
      throw new Error(insertError.message || 'Profil olusturulamadi');
    }
    await syncAuthUserMetadata(client, safeUpdates);
  }

  async function getCustomerOrders() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanici oturum acmamis');

    const selectVariants = [
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
        payment_provider,
        payment_method,
        status,
        shipping_provider,
        tracking_code,
        shipped_at,
        created_at,
        updated_at,
        address,
        city,
        district,
        billing_same_as_shipping,
        billing_name,
        billing_address,
        billing_city,
        billing_district,
        promo_code,
        discount_amount,
        order_items (
          id,
          product_code,
          product_name,
          product_color,
          unit_price,
          quantity,
          line_total
        )
      `,
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
        payment_provider,
        payment_method,
        status,
        shipping_provider,
        tracking_code,
        shipped_at,
        created_at,
        updated_at,
        address,
        city,
        district,
        promo_code,
        discount_amount,
        order_items (
          id,
          product_code,
          product_name,
          product_color,
          unit_price,
          quantity,
          line_total
        )
      `,
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
        payment_provider,
        payment_method,
        status,
        shipping_provider,
        tracking_code,
        shipped_at,
        created_at,
        updated_at,
        address,
        city,
        district,
        order_items (
          id,
          product_code,
          product_name,
          product_color,
          unit_price,
          quantity,
          line_total
        )
      `,
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
        payment_provider,
        status,
        shipping_provider,
        tracking_code,
        shipped_at,
        created_at,
        updated_at,
        address,
        city,
        district,
        order_items (
          id,
          product_code,
          product_name,
          product_color,
          unit_price,
          quantity,
          line_total
        )
      `,
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
        address,
        city,
        district,
        order_items (
          id,
          product_code,
          product_name,
          product_color,
          unit_price,
          quantity,
          line_total
        )
      `,
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
        address,
        city,
        district,
        order_items (
          id,
          product_code,
          product_name,
          unit_price,
          quantity,
          line_total
        )
      `,
    ];

    let data = null;
    let error = null;
    for (const selectText of selectVariants) {
      ({ data, error } = await client
        .from('orders')
        .select(selectText)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }));
      if (!error) break;
    }

    if (error) {
      console.error('Orders fetch error:', error);
      throw new Error('Siparisler yuklenemedi');
    }

    const orders = Array.isArray(data) ? data : [];
    orders.forEach((order) => {
      const items = Array.isArray(order && order.order_items) ? order.order_items : [];
      items.forEach((item) => {
        if (!item) return;
        item.product_color = String(item.product_color || item.color || '').trim() || null;
      });
    });
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

  async function cancelCustomerOrder(orderId) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Siparis iptali icin tekrar giris yapin.');
    }
    const response = await fetch('/api/public/order-cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
      body: JSON.stringify({ order_id: String(orderId || '').trim() }),
    });
    const payload = await response.json().catch(function () { return null; });
    const ok = Boolean(payload && payload.success && payload.data);
    if (!response.ok || !ok) {
      throw new Error((payload && payload.error) || 'Siparis iptal edilemedi');
    }
    return payload.data;
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
    cancelCustomerOrder,
    updatePassword,
  };
})(window);

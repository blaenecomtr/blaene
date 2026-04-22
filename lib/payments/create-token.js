const crypto = require('crypto');
const {
  loadCheckoutSettings,
  computeShippingFee,
} = require('./checkout-settings');
const {
  resolveIyzicoConfig,
  isIyzicoConfigured,
  initializeCheckoutForm,
} = require('./iyzico');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function normalizeString(value, fallback = '') {
  return String(value || fallback).trim();
}

function normalizeProviderCode(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .trim();
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = normalizeString(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function extractBearerToken(req) {
  const header = normalizeString(req?.headers?.authorization);
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function normalizePhoneComparable(value) {
  const digits = normalizeString(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function isTruthyEnv(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function normalizeAbsoluteHttpUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function parsePrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function makeOrderNo() {
  const seed = Date.now().toString();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BLN-${seed.slice(-8)}-${suffix}`;
}

function makeMerchantOid() {
  const seed = Date.now().toString();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BLN${seed}${suffix}`;
}

function buildSupabaseHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function supabaseFetchAuthUser({ supabaseUrl, authApiKey, accessToken }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: authApiKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    return null;
  }
  return data;
}

async function supabaseSelectProducts({ supabaseUrl, serviceRoleKey, codes }) {
  const params = new URLSearchParams();
  params.set('select', 'id,code,name,price,active,images,category,stock_quantity');
  const quoted = codes.map((code) => `"${code.replaceAll('"', '\\"')}"`).join(',');
  params.set('code', `in.(${quoted})`);

  const response = await fetch(`${supabaseUrl}/rest/v1/products?${params.toString()}`, {
    method: 'GET',
    headers: buildSupabaseHeaders(serviceRoleKey),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error || 'Supabase urun sorgusu basarisiz.';
    throw new Error(message);
  }

  return Array.isArray(data) ? data : [];
}

async function supabaseInsertOrder({ supabaseUrl, serviceRoleKey, order }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(order),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error || 'Siparis kaydi olusturulamadi.';
    throw new Error(message);
  }

  if (!Array.isArray(data) || !data.length) {
    throw new Error('Siparis kaydi donmedi.');
  }

  return data[0];
}

async function supabaseInsertOrderItems({ supabaseUrl, serviceRoleKey, items }) {
  async function insertRows(rows) {
    const response = await fetch(`${supabaseUrl}/rest/v1/order_items`, {
      method: 'POST',
      headers: {
        ...buildSupabaseHeaders(serviceRoleKey),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    const data = response.ok ? null : await response.json().catch(() => null);
    return { response, data };
  }

  let attempt = await insertRows(items);
  if (attempt.response.ok) return;

  const rawMessage = String(attempt.data?.message || attempt.data?.error || '').toLowerCase();
  const hasColorColumnIssue =
    rawMessage.includes('product_color') ||
    rawMessage.includes('line_color') ||
    rawMessage.includes('color');

  if (hasColorColumnIssue) {
    const legacyRows = (Array.isArray(items) ? items : []).map((item) => ({
      order_id: item.order_id,
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      unit_price: item.unit_price,
      quantity: item.quantity,
      line_total: item.line_total,
    }));
    attempt = await insertRows(legacyRows);
    if (attempt.response.ok) return;
  }

  const message = attempt.data?.message || attempt.data?.error || 'Siparis kalemleri kaydedilemedi.';
  throw new Error(message);
}

async function supabasePatchOrderById({ supabaseUrl, serviceRoleKey, orderId, payload }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.message || data?.error || 'Siparis guncellenemedi.';
    throw new Error(message);
  }
}

async function supabaseSelectPromotionByCode({ supabaseUrl, serviceRoleKey, code }) {
  const params = new URLSearchParams();
  params.set('select', 'id,code,discount_type,discount_value,usage_limit,usage_count,is_active,starts_at,ends_at');
  params.set('code', `eq.${String(code).toUpperCase()}`);
  params.set('limit', '1');

  const response = await fetch(`${supabaseUrl}/rest/v1/promotions?${params.toString()}`, {
    method: 'GET',
    headers: buildSupabaseHeaders(serviceRoleKey),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return null;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function supabaseIncrementPromotionUsage({ supabaseUrl, serviceRoleKey, promotionId, currentCount }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/promotions?id=eq.${promotionId}`, {
    method: 'PATCH',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ usage_count: (currentCount || 0) + 1 }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || 'Failed to update promotion usage');
  }
}

async function supabaseSelectCustomerProfileByEmail({ supabaseUrl, serviceRoleKey, email }) {
  const params = new URLSearchParams();
  params.set('select', 'id,email,full_name,phone');
  params.set('email', `eq.${email}`);
  params.set('limit', '1');

  const response = await fetch(`${supabaseUrl}/rest/v1/customer_profiles?${params.toString()}`, {
    method: 'GET',
    headers: buildSupabaseHeaders(serviceRoleKey),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error || 'Musteri profili sorgulanamadi.';
    throw new Error(message);
  }

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function supabaseInsertCustomerProfile({ supabaseUrl, serviceRoleKey, profile }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/customer_profiles`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(profile),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error || 'Musteri profili olusturulamadi.';
    throw new Error(message);
  }

  if (!Array.isArray(data) || !data.length) {
    throw new Error('Musteri profili olusturulamadi.');
  }

  return data[0];
}

async function supabaseUpsertCustomerProfile({ supabaseUrl, serviceRoleKey, profile }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/customer_profiles?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.message || data?.error || 'Musteri profili guncellenemedi.';
    throw new Error(message);
  }
}

async function supabaseAuthAdminCreateUser({
  supabaseUrl,
  serviceRoleKey,
  email,
  password,
  fullName,
  phone,
  defaultAddress,
  defaultCity,
  customerType,
  companyName,
  nationalId,
  taxNumber,
  taxOffice,
}) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: buildSupabaseHeaders(serviceRoleKey),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || null,
        phone: phone || null,
        default_address: defaultAddress || null,
        default_city: defaultCity || null,
        customer_type: customerType || null,
        customer_kind: customerType || null,
        company_name: companyName || null,
        national_id: nationalId || null,
        tax_number: taxNumber || null,
        tax_office: taxOffice || null,
      },
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.user?.id) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || 'Uye hesabi olusturulamadi.';
    const error = new Error(message);
    error.code = String(data?.error || data?.code || '').toLowerCase();
    throw error;
  }

  return data.user;
}

async function createPaytrIframeToken({
  merchantId,
  merchantKey,
  merchantSalt,
  userIp,
  merchantOid,
  email,
  paymentAmount,
  userBasket,
  userName,
  userAddress,
  userPhone,
  merchantOkUrl,
  merchantFailUrl,
  currency,
  testMode,
  debugOn,
  noInstallment,
  maxInstallment,
  timeoutLimit,
}) {
  const hashStr = `${merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
  const paytrToken = crypto
    .createHmac('sha256', merchantKey)
    .update(hashStr + merchantSalt)
    .digest('base64');

  const body = new URLSearchParams({
    merchant_id: merchantId,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email,
    payment_amount: String(paymentAmount),
    paytr_token: paytrToken,
    user_basket: userBasket,
    no_installment: String(noInstallment),
    max_installment: String(maxInstallment),
    currency,
    test_mode: String(testMode),
    merchant_ok_url: merchantOkUrl,
    merchant_fail_url: merchantFailUrl,
    user_name: userName,
    user_address: userAddress,
    user_phone: userPhone,
    timeout_limit: String(timeoutLimit),
    debug_on: String(debugOn),
    lang: 'tr',
  });

  const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.status !== 'success' || !data.token) {
    const reason = data?.reason || data?.err_msg || data?.message || 'PayTR token alinamadi.';
    throw new Error(reason);
  }

  return data.token;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const requiredSupabaseEnv = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missingEnv = requiredSupabaseEnv.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    return sendJson(res, 500, {
      ok: false,
      error: `Eksik ortam degiskenleri: ${missingEnv.join(', ')}`,
    });
  }

  const checkoutRequireAuth = normalizeString(process.env.CHECKOUT_REQUIRE_AUTH, 'false').toLowerCase() === 'true';

  const checkoutMode = normalizeString(process.env.CHECKOUT_MODE, 'auto').toLowerCase();
  const forceMockMode = checkoutMode === 'mock' || isTruthyEnv(process.env.MOCK_CHECKOUT_MODE);
  const forcePaytrMode = checkoutMode === 'paytr';
  const forceIyzicoMode = checkoutMode === 'iyzico';

  let payload = null;
  try {
    const raw = await getRawBody(req);
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Gecersiz JSON body.' });
  }

  const customer = payload?.customer || {};
  const cart = Array.isArray(payload?.cart) ? payload.cart : [];
  const promoCode = normalizeString(payload?.promo_code, 80).toUpperCase();

  const customerName = normalizeString(customer.name);
  const email = normalizeString(customer.email).toLowerCase();
  const phone = normalizeString(customer.phone);
  const city = normalizeString(customer.city);
  const address = normalizeString(customer.address);
  const note = normalizeString(customer.note);
  const customerTypeRaw = normalizeString(customer.customer_type, 'bireysel').toLowerCase();
  const customerType = customerTypeRaw === 'kurumsal' ? 'kurumsal' : 'bireysel';
  const companyName = normalizeString(customer.company_name);
  const nationalId = normalizeString(customer.national_id);
  const taxNumber = normalizeString(customer.tax_number);
  const taxOffice = normalizeString(customer.tax_office);
  const requestedPaymentMethod = normalizeString(payload?.payment?.method, 'card').toLowerCase();
  const paymentMethod = requestedPaymentMethod === 'bank_transfer' ? 'bank_transfer' : 'card';
  const billingPayload = payload?.billing && typeof payload.billing === 'object' ? payload.billing : {};
  const billingSameAsShipping = toBoolean(billingPayload.same_as_shipping, true);
  const corporateDisplayName = customerType === 'kurumsal' && companyName ? companyName : customerName;
  const billingName = normalizeString(
    billingSameAsShipping ? (billingPayload.name || corporateDisplayName) : billingPayload.name
  );
  const billingAddress = normalizeString(
    billingSameAsShipping ? (billingPayload.address || address) : billingPayload.address
  );
  const billingCity = normalizeString(
    billingSameAsShipping ? (billingPayload.city || city) : billingPayload.city
  );
  const billingDistrict = normalizeString(billingPayload.district);
  const requestedShippingProvider = normalizeProviderCode(payload?.shipping?.provider);
  const account = payload?.account && typeof payload.account === 'object' ? payload.account : {};
  const accountCreateRequested = Boolean(account.create);
  const accountPassword = normalizeString(account.password);

  if (!customerName || !email || !phone || !address) {
    return sendJson(res, 400, { ok: false, error: 'Musteri alanlari eksik.' });
  }
  if (!billingSameAsShipping && (!billingName || !billingAddress)) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Fatura adresi secildiginde ad ve adres zorunludur.',
    });
  }
  if (customerType === 'kurumsal' && (!companyName || !nationalId || !taxNumber || !taxOffice)) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Kurumsal secimde firma adi, TC, vergi no ve vergi dairesi zorunludur.',
    });
  }

  if (accountCreateRequested && accountPassword.length < 6) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Hesap olusturmak icin en az 6 karakterli sifre gerekli.',
    });
  }

  if (!cart.length) {
    return sendJson(res, 400, { ok: false, error: 'Sepet bos.' });
  }

  const normalizedCart = cart
    .map((item) => ({
      code: normalizeString(item.code).toUpperCase(),
      quantity: Math.max(1, Number(item.quantity || 1)),
      color: normalizeString(item.color || ''),
    }))
    .filter((item) => item.code && Number.isFinite(item.quantity));

  if (!normalizedCart.length) {
    return sendJson(res, 400, { ok: false, error: 'Sepet gecersiz.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authApiKey = normalizeString(process.env.SUPABASE_ANON_KEY) || serviceRoleKey;
  let checkoutSettings = null;
  let settingsLoadError = null;
  try {
    checkoutSettings = await loadCheckoutSettings({ supabaseUrl, serviceRoleKey });
  } catch (err) {
    settingsLoadError = err?.message || 'Odeme ayarlari yuklenemedi';
  }
  if (settingsLoadError && paymentMethod === 'card') {
    return sendJson(res, 503, {
      ok: false,
      error: `Odeme islemi simdi gerceklestirilemedi: ${settingsLoadError}. Lutfen daha sonra tekrar deneyin.`,
    });
  }
  const paymentSettings = checkoutSettings?.payment || {};
  const shippingSettings = checkoutSettings?.shipping || {};
  const shippingProviders = Array.isArray(shippingSettings.providers)
    ? shippingSettings.providers
      .map((item) => ({
        provider: normalizeProviderCode(typeof item === 'string' ? item : item?.provider),
        enabled: typeof item === 'object' && item ? item.enabled !== false : true,
      }))
      .filter((item) => item.provider && item.enabled)
      .map((item) => item.provider)
    : [];
  const normalizedShippingProviders = shippingProviders.length
    ? shippingProviders
    : ['yurtici', 'mng', 'aras'];
  const selectedShippingProvider = requestedShippingProvider && normalizedShippingProviders.includes(requestedShippingProvider)
    ? requestedShippingProvider
    : normalizedShippingProviders[0];
  const paytrEnabledFromSettings = paymentSettings?.paytr_enabled !== false;
  const iyzicoEnabledFromSettings = paymentSettings?.iyzico_enabled === true;
  const providerPreference = normalizeString(paymentSettings?.provider_preference, '').toLowerCase();

  const paytrConfig = {
    merchantId: normalizeString(paymentSettings?.paytr_merchant_id || process.env.PAYTR_MERCHANT_ID),
    merchantKey: normalizeString(paymentSettings?.paytr_merchant_key || process.env.PAYTR_MERCHANT_KEY),
    merchantSalt: normalizeString(paymentSettings?.paytr_merchant_salt || process.env.PAYTR_MERCHANT_SALT),
  };
  const paytrAvailable = Boolean(paytrConfig.merchantId && paytrConfig.merchantKey && paytrConfig.merchantSalt);
  const missingPaytrEnv = [];
  if (!paytrConfig.merchantId) missingPaytrEnv.push('PAYTR_MERCHANT_ID');
  if (!paytrConfig.merchantKey) missingPaytrEnv.push('PAYTR_MERCHANT_KEY');
  if (!paytrConfig.merchantSalt) missingPaytrEnv.push('PAYTR_MERCHANT_SALT');

  const iyzicoConfig = resolveIyzicoConfig({
    ...process.env,
    IYZICO_API_KEY: paymentSettings?.iyzico_api_key || process.env.IYZICO_API_KEY,
    IYZICO_SECRET_KEY: paymentSettings?.iyzico_secret_key || process.env.IYZICO_SECRET_KEY,
    IYZICO_BASE_URL: paymentSettings?.iyzico_base_url || process.env.IYZICO_BASE_URL,
  });
  const iyzicoAvailable = isIyzicoConfigured(iyzicoConfig);

  if (paymentMethod === 'card' && forcePaytrMode && !paytrAvailable) {
    return sendJson(res, 500, {
      ok: false,
      error: `PayTR modu secili ancak eksik ortam degiskenleri var: ${missingPaytrEnv.join(', ')}`,
    });
  }
  if (paymentMethod === 'card' && forceIyzicoMode && !iyzicoAvailable) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Iyzico modu secili ancak IYZICO_API_KEY / IYZICO_SECRET_KEY eksik.',
    });
  }

  let selectedProvider = 'manual';
  if (paymentMethod === 'card') {
    selectedProvider = 'mock';
  }
  if (paymentMethod === 'card' && !forceMockMode) {
    if (forceIyzicoMode && iyzicoAvailable) {
      selectedProvider = 'iyzico';
    } else if (forcePaytrMode && paytrAvailable) {
      selectedProvider = 'paytr';
    } else if (providerPreference === 'iyzico' && iyzicoEnabledFromSettings && iyzicoAvailable) {
      selectedProvider = 'iyzico';
    } else if (providerPreference === 'paytr' && paytrEnabledFromSettings && paytrAvailable) {
      selectedProvider = 'paytr';
    } else if (iyzicoEnabledFromSettings && iyzicoAvailable) {
      selectedProvider = 'iyzico';
    } else if (paytrEnabledFromSettings && paytrAvailable) {
      selectedProvider = 'paytr';
    }
  }

  let checkoutUserId = null;
  const accountResult = {
    requested: accountCreateRequested,
    created: false,
    existing: false,
  };

  if (checkoutRequireAuth) {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Siparis icin uye girisi zorunlu. Lutfen giris yapin.',
      });
    }

    const authUser = await supabaseFetchAuthUser({
      supabaseUrl,
      authApiKey,
      accessToken,
    });

    if (!authUser) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Gecersiz veya suresi dolmus oturum. Lutfen tekrar giris yapin.',
      });
    }

    const memberEmail = normalizeString(
      authUser.email || authUser.user_metadata?.contact_email || authUser.user_metadata?.email
    ).toLowerCase();
    const memberPhone = normalizePhoneComparable(
      authUser.phone || authUser.user_metadata?.phone || authUser.user_metadata?.contact_phone
    );
    const formPhone = normalizePhoneComparable(phone);

    if (!authUser.phone_confirmed_at || !memberPhone) {
      return sendJson(res, 403, {
        ok: false,
        error: 'Siparis icin telefon dogrulamasi zorunlu. SMS kodu ile telefonunuzu dogrulayin.',
      });
    }

    if (!memberEmail) {
      return sendJson(res, 403, {
        ok: false,
        error: 'Hesabinizda dogrulanmis e-posta bulunamadi. Uye bilgilerinizi tamamlayin.',
      });
    }

    if (memberEmail !== email) {
      return sendJson(res, 403, {
        ok: false,
        error: 'Siparis e-postasi uye e-postasi ile ayni olmali.',
      });
    }

    if (memberPhone !== formPhone) {
      return sendJson(res, 403, {
        ok: false,
        error: 'Siparis telefonu, dogrulanmis uye telefonu ile ayni olmali.',
      });
    }

    checkoutUserId = authUser.id;
    accountResult.existing = true;
  } else {
    // Optional auth: even if checkout doesn't require auth, check for optional Bearer token
    // If provided, link the order to the logged-in user (if they match email)
    const accessToken = extractBearerToken(req);
    if (accessToken) {
      try {
        const authUser = await supabaseFetchAuthUser({
          supabaseUrl,
          authApiKey,
          accessToken,
        });

        if (authUser) {
          // Optionally validate email match (recommended)
          const authEmail = normalizeString(
            authUser.email || authUser.user_metadata?.contact_email || authUser.user_metadata?.email
          ).toLowerCase();

          if (authEmail && authEmail === email) {
            checkoutUserId = authUser.id;
            accountResult.existing = true;
          }
        }
      } catch (_) {
        // Silently ignore optional auth errors
      }
    }
  }

  const mergedCart = [];
  normalizedCart.forEach((item) => {
    const colorKey = normalizeString(item.color).toLowerCase();
    const existing = mergedCart.find((row) => (
      row.code === item.code && normalizeString(row.color).toLowerCase() === colorKey
    ));
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      mergedCart.push({ ...item });
    }
  });

  try {
    if (accountCreateRequested && !checkoutUserId) {
      const existingProfile = await supabaseSelectCustomerProfileByEmail({
        supabaseUrl,
        serviceRoleKey,
        email,
      });

      if (existingProfile?.id) {
        throw new Error('Bu e-posta ile hesap zaten var. Lutfen giris yaparak satin alimi tamamlayin.');
      } else {
        let createdAuthUser = null;
        try {
          createdAuthUser = await supabaseAuthAdminCreateUser({
            supabaseUrl,
            serviceRoleKey,
            email,
            password: accountPassword,
            fullName: customerName,
            phone,
            defaultAddress: address,
            defaultCity: city,
            customerType,
            companyName,
            nationalId,
            taxNumber,
            taxOffice,
          });
        } catch (createError) {
          const message = normalizeString(createError?.message).toLowerCase();
          if (message.includes('already') || message.includes('registered')) {
            throw new Error('Bu e-posta ile hesap zaten var. Lutfen giris yaparak satin alimi tamamlayin.');
          } else {
            throw createError;
          }
        }

        if (createdAuthUser?.id) {
          checkoutUserId = createdAuthUser.id;
          accountResult.created = true;
        }
      }
    }

    if (checkoutUserId) {
      const profileBase = {
        id: checkoutUserId,
        email,
        full_name: customerName,
        phone: phone || null,
        default_address: address || null,
        default_city: city || null,
      };
      const profileRich = {
        ...profileBase,
        customer_type: customerType,
        customer_kind: customerType,
        company_name: customerType === 'kurumsal' ? companyName : null,
        national_id: customerType === 'kurumsal' ? nationalId : null,
        tax_number: customerType === 'kurumsal' ? taxNumber : null,
        tax_office: customerType === 'kurumsal' ? taxOffice : null,
      };
      try {
        await supabaseUpsertCustomerProfile({
          supabaseUrl,
          serviceRoleKey,
          profile: profileRich,
        });
      } catch (profileError) {
        const message = normalizeString(profileError?.message).toLowerCase();
        const hasCorporateColumnError =
          message.includes('customer_type') ||
          message.includes('customer_kind') ||
          message.includes('company_name') ||
          message.includes('national_id') ||
          message.includes('tax_number') ||
          message.includes('tax_office');
        if (hasCorporateColumnError) {
          await supabaseUpsertCustomerProfile({
            supabaseUrl,
            serviceRoleKey,
            profile: profileBase,
          }).catch(() => null);
        } else {
          console.warn('Customer profile sync skipped:', profileError);
        }
      }
    }

    const products = await supabaseSelectProducts({
      supabaseUrl,
      serviceRoleKey,
      codes: mergedCart.map((item) => item.code),
    });

    if (!products.length) {
      return sendJson(res, 400, { ok: false, error: 'Sepetteki urunler bulunamadi.' });
    }

    const productByCode = new Map(products.map((product) => [String(product.code).toUpperCase(), product]));

    const orderItems = [];
    let subtotal = 0;

    for (const row of mergedCart) {
      const product = productByCode.get(row.code);
      if (!product) {
        return sendJson(res, 400, { ok: false, error: `${row.code} urunu bulunamadi.` });
      }
      if (product.active === false) {
        return sendJson(res, 400, { ok: false, error: `${row.code} urunu aktif degil.` });
      }

      const unitPrice = parsePrice(product.price);
      if (unitPrice === null || unitPrice <= 0) {
        return sendJson(res, 400, { ok: false, error: `${row.code} urunu satin alima acik degil.` });
      }

      const quantity = Math.max(1, Math.floor(row.quantity));
      const availableStock = Math.max(0, Math.floor(Number(product.stock_quantity || 0)));
      if (availableStock <= 0) {
        return sendJson(res, 400, { ok: false, error: `${row.code} urunu stokta yok.` });
      }
      if (quantity > availableStock) {
        return sendJson(res, 400, {
          ok: false,
          error: `${row.code} icin stok yetersiz. Mevcut stok: ${availableStock}.`,
        });
      }
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      subtotal += lineTotal;

      orderItems.push({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        productColor: row.color || null,
        category: product.category || 'general',
        unitPrice,
        quantity,
        lineTotal,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // Handle promo code
    let appliedPromo = null;
    let discountAmountValue = 0;
    if (promoCode) {
      appliedPromo = await supabaseSelectPromotionByCode({
        supabaseUrl,
        serviceRoleKey,
        code: promoCode,
      });

      if (appliedPromo) {
        const now = new Date();
        const isActive = appliedPromo.is_active === true;
        const isWithinDateRange = (!appliedPromo.starts_at || new Date(appliedPromo.starts_at) <= now) &&
                                   (!appliedPromo.ends_at || new Date(appliedPromo.ends_at) >= now);
        const hasUsageAvailable = !appliedPromo.usage_limit || (appliedPromo.usage_count || 0) < appliedPromo.usage_limit;

        if (isActive && isWithinDateRange && hasUsageAvailable) {
          // Apply discount
          if (appliedPromo.discount_type === 'percent') {
            discountAmountValue = Math.round(
              subtotal * (Number(appliedPromo.discount_value || 0) / 100) * 100
            ) / 100;
            subtotal = Math.max(0, Math.round((subtotal - discountAmountValue) * 100) / 100);
          } else if (appliedPromo.discount_type === 'fixed') {
            discountAmountValue = Math.max(0, Number(appliedPromo.discount_value || 0));
            subtotal = Math.max(0, Math.round((subtotal - discountAmountValue) * 100) / 100);
          }
        } else {
          appliedPromo = null;
        }
      }
    }

    const shipping = computeShippingFee(subtotal, checkoutSettings?.shipping);
    const total = Math.round((subtotal + shipping) * 100) / 100;

    const merchantOid = makeMerchantOid();
    const orderNo = makeOrderNo();
    const corporateInvoiceNote = customerType === 'kurumsal'
      ? `Kurumsal Fatura Bilgisi | Firma: ${companyName} | TC: ${nationalId} | Vergi No: ${taxNumber} | Vergi Dairesi: ${taxOffice}`
      : '';
    const normalizedOrderNote = [note, corporateInvoiceNote].filter(Boolean).join('\n');

    const orderInsert = {
      order_no: orderNo,
      merchant_oid: merchantOid,
      customer_name: customerName,
      email,
      phone,
      address,
      city: city || null,
      district: null,
      note: normalizedOrderNote || null,
      subtotal,
      shipping,
      total,
      currency: 'TRY',
      shipping_provider: selectedShippingProvider || null,
      payment_method: paymentMethod,
      billing_same_as_shipping: billingSameAsShipping,
      billing_name: billingName || customerName || null,
      billing_address: billingAddress || address || null,
      billing_city: billingCity || city || null,
      billing_district: billingDistrict || null,
      promo_code: appliedPromo?.code || promoCode || null,
      discount_amount: Math.round(Math.max(0, Number(discountAmountValue || 0)) * 100) / 100,
      payment_provider: selectedProvider,
      payment_status: 'pending',
      user_id: checkoutUserId || null,
    };

    let insertedOrder = null;
    try {
      insertedOrder = await supabaseInsertOrder({
        supabaseUrl,
        serviceRoleKey,
        order: orderInsert,
      });
    } catch (insertError) {
      const fallbackInsert = {
        order_no: orderInsert.order_no,
        merchant_oid: orderInsert.merchant_oid,
        customer_name: orderInsert.customer_name,
        email: orderInsert.email,
        phone: orderInsert.phone,
        address: orderInsert.address,
        city: orderInsert.city,
        district: orderInsert.district,
        note: orderInsert.note,
        subtotal: orderInsert.subtotal,
        shipping: orderInsert.shipping,
        total: orderInsert.total,
        currency: orderInsert.currency,
        payment_provider: orderInsert.payment_provider,
        payment_status: orderInsert.payment_status,
        user_id: orderInsert.user_id,
        shipping_provider: orderInsert.shipping_provider,
      };
      try {
        insertedOrder = await supabaseInsertOrder({
          supabaseUrl,
          serviceRoleKey,
          order: fallbackInsert,
        });
      } catch {
        throw insertError;
      }
    }

    const itemsToInsert = orderItems.map((item) => ({
      order_id: insertedOrder.id,
      product_id: item.productId,
      product_code: item.productCode,
      product_name: item.productName,
      product_color: item.productColor || null,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      line_total: item.lineTotal,
    }));

    await supabaseInsertOrderItems({
      supabaseUrl,
      serviceRoleKey,
      items: itemsToInsert,
    });

    // Increment promo code usage if applied
    if (appliedPromo && appliedPromo.id) {
      await supabaseIncrementPromotionUsage({
        supabaseUrl,
        serviceRoleKey,
        promotionId: appliedPromo.id,
        currentCount: appliedPromo.usage_count || 0,
      }).catch(() => null);
    }

    const paymentAmount = Math.round(total * 100);
    const basketPayload = orderItems.map((item) => [
      String(item.productName).slice(0, 120),
      item.unitPrice.toFixed(2),
      item.quantity,
    ]);
    const userBasket = Buffer.from(JSON.stringify(basketPayload), 'utf8').toString('base64');

    if (paymentMethod === 'bank_transfer') {
      const configuredAccounts = Array.isArray(paymentSettings?.bank_transfer_accounts)
        ? paymentSettings.bank_transfer_accounts
        : [];
      const activeAccounts = configuredAccounts
        .map((item) => ({
          bank_name: normalizeString(item?.bank_name),
          account_name: normalizeString(item?.account_name),
          iban: normalizeString(item?.iban).toUpperCase(),
          branch: normalizeString(item?.branch),
          account_no: normalizeString(item?.account_no),
          currency: normalizeString(item?.currency || 'TRY').toUpperCase(),
          enabled: item?.enabled !== false,
        }))
        .filter((item) => item.enabled !== false && (item.bank_name || item.account_name || item.iban));

      const fallbackAccount = {
        bank_name: normalizeString(process.env.BANK_TRANSFER_BANK_NAME, 'Ziraat Bankasi'),
        account_name: normalizeString(process.env.BANK_TRANSFER_ACCOUNT_NAME, 'Blaene Metal Urunleri'),
        iban: normalizeString(process.env.BANK_TRANSFER_IBAN, 'TR00 0000 0000 0000 0000 0000 00').toUpperCase(),
        branch: '',
        account_no: '',
        currency: 'TRY',
      };
      const bankAccounts = activeAccounts.length ? activeAccounts : [fallbackAccount];
      const primaryAccount = bankAccounts[0];
      const companyName = normalizeString(
        paymentSettings?.bank_transfer_company_name || process.env.BANK_TRANSFER_COMPANY_NAME,
        primaryAccount.account_name || 'Blaene Metal Urunleri'
      );

      return sendJson(res, 200, {
        ok: true,
        mode: 'bank_transfer',
        order_no: insertedOrder.order_no,
        merchant_oid: insertedOrder.merchant_oid,
        bank_transfer: {
          company_name: companyName,
          bank_name: primaryAccount.bank_name,
          account_name: primaryAccount.account_name,
          iban: primaryAccount.iban,
          accounts: bankAccounts,
          note_hint: `Aciklamaya siparis numarasi yazin: ${insertedOrder.order_no}`,
        },
        account: accountResult.requested
          ? {
              requested: true,
              created: accountResult.created,
              existing: accountResult.existing,
              user_id: checkoutUserId,
            }
          : undefined,
        message: 'Siparis olusturuldu. Lutfen havale/EFT yapip Hesabim > Havale Bildirimi adimindan bildiriniz.',
      });
    }

    if (selectedProvider === 'mock') {
      let mockReason = 'payment_provider_not_configured';
      if (forceMockMode) mockReason = 'mock_mode_forced';
      else if (!paytrEnabledFromSettings && !iyzicoEnabledFromSettings) mockReason = 'all_payment_providers_disabled';
      else if (providerPreference === 'iyzico' && !iyzicoAvailable) mockReason = 'iyzico_not_configured';
      else if (providerPreference === 'paytr' && !paytrAvailable) mockReason = 'paytr_not_configured';

      return sendJson(res, 200, {
        ok: true,
        mode: 'mock',
        mock_reason: mockReason,
        order_no: insertedOrder.order_no,
        merchant_oid: insertedOrder.merchant_oid,
        account: accountResult.requested
          ? {
              requested: true,
              created: accountResult.created,
              existing: accountResult.existing,
              user_id: checkoutUserId,
            }
          : undefined,
        message:
          'Siparis olusturuldu. Odeme saglayicisi aktif olmadigi icin siparisiniz pending olarak kaydedildi.',
      });
    }

    if (selectedProvider === 'iyzico') {
      const siteUrl = normalizeAbsoluteHttpUrl(process.env.SITE_URL);
      const baseSiteUrl = siteUrl ? siteUrl.replace(/\/$/, '') : '';
      const configuredCallbackUrl = normalizeAbsoluteHttpUrl(process.env.IYZICO_CALLBACK_URL);
      const callbackUrl =
        configuredCallbackUrl ||
        (baseSiteUrl
          ? `${baseSiteUrl}/api/public/iyzico-callback?merchant_oid=${encodeURIComponent(merchantOid)}`
          : '');

      if (!callbackUrl) {
        return sendJson(res, 500, {
          ok: false,
          error: 'IYZICO_CALLBACK_URL veya SITE_URL mutlak bir URL olmali.',
        });
      }

      let iyzicoResult = null;
      try {
        iyzicoResult = await initializeCheckoutForm({
          config: iyzicoConfig,
          merchantOid,
          customer: {
            name: customerName,
            email,
            phone,
            city,
            address,
            userId: checkoutUserId,
          },
          orderItems,
          total,
          callbackUrl,
          userIp: getClientIp(req),
        });
      } catch (tokenError) {
        await supabasePatchOrderById({
          supabaseUrl,
          serviceRoleKey,
          orderId: insertedOrder.id,
          payload: {
            payment_status: 'failed',
            paytr_status: 'iyzico_init_failed',
            failed_reason_msg: String(tokenError?.message || 'Iyzico checkout init basarisiz.').slice(0, 500),
          },
        }).catch(() => {});
        throw tokenError;
      }

      return sendJson(res, 200, {
        ok: true,
        mode: 'iyzico',
        order_no: insertedOrder.order_no,
        merchant_oid: insertedOrder.merchant_oid,
        payment_page_url: iyzicoResult.paymentPageUrl || null,
        iyzico_token: iyzicoResult.token || null,
        account: accountResult.requested
          ? {
              requested: true,
              created: accountResult.created,
              existing: accountResult.existing,
              user_id: checkoutUserId,
            }
          : undefined,
      });
    }

    const explicitOkUrl = normalizeAbsoluteHttpUrl(process.env.PAYTR_OK_URL);
    const explicitFailUrl = normalizeAbsoluteHttpUrl(process.env.PAYTR_FAIL_URL);
    const siteUrl = normalizeAbsoluteHttpUrl(process.env.SITE_URL);
    const baseSiteUrl = siteUrl ? siteUrl.replace(/\/$/, '') : '';

    const merchantOkUrl = explicitOkUrl || (baseSiteUrl ? `${baseSiteUrl}/checkout.html?pay=ok` : '');
    const merchantFailUrl = explicitFailUrl || (baseSiteUrl ? `${baseSiteUrl}/checkout.html?pay=fail` : '');

    if (!merchantOkUrl || !merchantFailUrl) {
      return sendJson(res, 500, {
        ok: false,
        error: 'PAYTR_OK_URL/PAYTR_FAIL_URL veya SITE_URL mutlak bir URL olmali.',
      });
    }

    let iframeToken = null;
    try {
      iframeToken = await createPaytrIframeToken({
        merchantId: paytrConfig.merchantId,
        merchantKey: paytrConfig.merchantKey,
        merchantSalt: paytrConfig.merchantSalt,
        userIp: getClientIp(req),
        merchantOid,
        email,
        paymentAmount,
        userBasket,
        userName: customerName,
        userAddress: address,
        userPhone: phone,
        merchantOkUrl,
        merchantFailUrl,
        currency: 'TL',
        testMode: Number(process.env.PAYTR_TEST_MODE || 1),
        debugOn: Number(process.env.PAYTR_DEBUG_ON || 0),
        noInstallment: Number(process.env.PAYTR_NO_INSTALLMENT || 0),
        maxInstallment: Number(process.env.PAYTR_MAX_INSTALLMENT || 0),
        timeoutLimit: Number(process.env.PAYTR_TIMEOUT_LIMIT || 30),
      });
    } catch (tokenError) {
      await supabasePatchOrderById({
        supabaseUrl,
        serviceRoleKey,
        orderId: insertedOrder.id,
        payload: {
          payment_status: 'failed',
          paytr_status: 'token_failed',
          failed_reason_msg: String(tokenError?.message || 'PayTR token alinamadi.').slice(0, 500),
        },
      }).catch(() => {});

      throw tokenError;
    }

    return sendJson(res, 200, {
      ok: true,
      mode: 'paytr',
      order_no: insertedOrder.order_no,
      merchant_oid: insertedOrder.merchant_oid,
      iframe_token: iframeToken,
      account: accountResult.requested
        ? {
            requested: true,
            created: accountResult.created,
            existing: accountResult.existing,
            user_id: checkoutUserId,
          }
        : undefined,
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error?.message || 'Beklenmeyen hata.',
    });
  }
};

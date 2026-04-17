const crypto = require('crypto');

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
  const response = await fetch(`${supabaseUrl}/rest/v1/order_items`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(items),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.message || data?.error || 'Siparis kalemleri kaydedilemedi.';
    throw new Error(message);
  }
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

async function supabaseAuthAdminCreateUser({
  supabaseUrl,
  serviceRoleKey,
  email,
  password,
  fullName,
  phone,
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

  const paytrRequiredEnv = ['PAYTR_MERCHANT_ID', 'PAYTR_MERCHANT_KEY', 'PAYTR_MERCHANT_SALT'];
  const missingPaytrEnv = paytrRequiredEnv.filter((key) => !process.env[key]);
  const checkoutMode = normalizeString(process.env.CHECKOUT_MODE, 'auto').toLowerCase();
  const forceMockMode = checkoutMode === 'mock' || isTruthyEnv(process.env.MOCK_CHECKOUT_MODE);
  const forcePaytrMode = checkoutMode === 'paytr';

  if (forcePaytrMode && missingPaytrEnv.length) {
    return sendJson(res, 500, {
      ok: false,
      error: `PayTR modu secili ancak eksik ortam degiskenleri var: ${missingPaytrEnv.join(', ')}`,
    });
  }

  const usePaytr = !forceMockMode && missingPaytrEnv.length === 0;

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
  const account = payload?.account && typeof payload.account === 'object' ? payload.account : {};
  const accountCreateRequested = Boolean(account.create);
  const accountPassword = normalizeString(account.password);

  if (!customerName || !email || !phone || !address) {
    return sendJson(res, 400, { ok: false, error: 'Musteri alanlari eksik.' });
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
    }))
    .filter((item) => item.code && Number.isFinite(item.quantity));

  if (!normalizedCart.length) {
    return sendJson(res, 400, { ok: false, error: 'Sepet gecersiz.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authApiKey = normalizeString(process.env.SUPABASE_ANON_KEY) || serviceRoleKey;
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
    const existing = mergedCart.find((row) => row.code === item.code);
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
          await supabaseInsertCustomerProfile({
            supabaseUrl,
            serviceRoleKey,
            profile: {
              id: createdAuthUser.id,
              email,
              full_name: customerName,
              phone: phone || null,
              default_address: address || null,
              default_city: city || null,
            },
          });
          checkoutUserId = createdAuthUser.id;
          accountResult.created = true;
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
        unitPrice,
        quantity,
        lineTotal,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // Handle promo code
    let appliedPromo = null;
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
            subtotal = Math.round(subtotal * (1 - (Number(appliedPromo.discount_value || 0) / 100)) * 100) / 100;
          } else if (appliedPromo.discount_type === 'fixed') {
            subtotal = Math.max(0, Math.round((subtotal - Number(appliedPromo.discount_value || 0)) * 100) / 100);
          }
        } else {
          appliedPromo = null;
        }
      }
    }

    const shipping = 0;
    const total = Math.round((subtotal + shipping) * 100) / 100;

    const merchantOid = makeMerchantOid();
    const orderNo = makeOrderNo();

    const orderInsert = {
      order_no: orderNo,
      merchant_oid: merchantOid,
      customer_name: customerName,
      email,
      phone,
      address,
      city: city || null,
      district: null,
      note: note || null,
      subtotal,
      shipping,
      total,
      currency: 'TRY',
      payment_provider: usePaytr ? 'paytr' : 'mock',
      payment_status: 'pending',
      user_id: checkoutUserId || null,
    };

    const insertedOrder = await supabaseInsertOrder({
      supabaseUrl,
      serviceRoleKey,
      order: orderInsert,
    });

    const itemsToInsert = orderItems.map((item) => ({
      order_id: insertedOrder.id,
      product_id: item.productId,
      product_code: item.productCode,
      product_name: item.productName,
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

    if (!usePaytr) {
      return sendJson(res, 200, {
        ok: true,
        mode: 'mock',
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
          'Siparis olusturuldu. Odeme entegrasyonu henuz aktif degil, siparisiniz pending olarak kaydedildi.',
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
        merchantId: process.env.PAYTR_MERCHANT_ID,
        merchantKey: process.env.PAYTR_MERCHANT_KEY,
        merchantSalt: process.env.PAYTR_MERCHANT_SALT,
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

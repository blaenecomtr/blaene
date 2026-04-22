const { createApiHandler } = require('../api/handler');
const { sendSuccess, sendError } = require('../api/response');
const { normalizeEmail, normalizeText } = require('../api/validation');
const { restInsert, restSelect, restUpdate } = require('../api/supabase');
const { sendEmail } = require('../email/resend');
const {
  cartAbandonedTemplate,
  productShowcaseTemplate,
  reviewRequestTemplate,
  orderConfirmationTemplate,
  orderDeliveredTemplate,
  stockBackInTemplate,
  priceDropTemplate,
  invoiceReadyTemplate,
} = require('../email/templates');
const {
  loadEmailAutomationSettings,
} = require('../email/automation-settings');

const DEFAULT_SITE_ORIGIN = 'https://www.blaene.com.tr';
const DEFAULT_SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
const ABANDONED_CART_MINUTES = 45;
const EMAIL_AUTOMATION_SNAPSHOT_KEY = 'email_automation_snapshot';

function buildInFilter(values, maxLen = 200) {
  const items = Array.isArray(values)
    ? values
      .map((value) => normalizeText(value, maxLen))
      .filter(Boolean)
      .map((value) => `"${String(value).replaceAll('"', '\\"')}"`)
    : [];
  if (!items.length) return '';
  return `in.(${items.join(',')})`;
}

function toAbsoluteImageUrl(value) {
  const raw = normalizeText(value, 2000);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return '';

  const supabaseUrl = normalizeText(process.env.SUPABASE_URL, 500) || DEFAULT_SUPABASE_URL;
  const siteOrigin = normalizeText(process.env.SITE_ORIGIN || process.env.SITE_URL, 500) || DEFAULT_SITE_ORIGIN;

  if (normalized.startsWith('storage/v1/object/public/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/${normalized}`;
  }
  if (normalized.startsWith('product-images/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${normalized}`;
  }
  if (normalized.startsWith('products/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/product-images/${normalized}`;
  }
  return `${siteOrigin.replace(/\/+$/, '')}/${normalized}`;
}

function firstImageUrl(images) {
  if (Array.isArray(images)) {
    const first = images.map((item) => toAbsoluteImageUrl(item)).find(Boolean);
    return first || '';
  }
  if (typeof images === 'string') {
    const raw = images.trim();
    if (!raw) return '';
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const first = parsed.map((item) => toAbsoluteImageUrl(item)).find(Boolean);
          if (first) return first;
        }
      } catch (_) {
        // ignore invalid JSON arrays
      }
    }
    return toAbsoluteImageUrl(raw);
  }
  return '';
}

function extractRequestSecret(req) {
  const auth = String(req.headers.authorization || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
  const url = new URL(req.url, 'http://localhost');
  const querySecret = String(url.searchParams.get('secret') || '').trim();
  return bearer || headerSecret || querySecret;
}

function hasCronAuthorization(req) {
  const configuredSecret = normalizeText(process.env.MARKETING_CRON_SECRET, 300) || normalizeText(process.env.CRON_SECRET, 300);
  if (configuredSecret) {
    return extractRequestSecret(req) === configuredSecret;
  }
  return String(req.headers['x-vercel-cron'] || '').trim() === '1';
}

function normalizeEmailFromMetadata(metadata) {
  return normalizeEmail(metadata && metadata.customer_email);
}

function isAddToCartEvent(row) {
  const action = normalizeText(row && row.action, 80).toLowerCase();
  if (action !== 'traffic.click') return false;
  const metadata = row && typeof row.metadata === 'object' ? row.metadata : {};
  const kind = normalizeText(metadata.track_kind, 80).toLowerCase();
  const label = normalizeText(metadata.element_text, 200).toLowerCase();
  return kind === 'add_to_cart' || label.includes('sepete ekle');
}

function isCheckoutViewEvent(row) {
  const action = normalizeText(row && row.action, 80).toLowerCase();
  if (action !== 'traffic.page_view') return false;
  const metadata = row && typeof row.metadata === 'object' ? row.metadata : {};
  const pagePath = normalizeText(metadata.page_path || row.request_path, 300).toLowerCase();
  return pagePath.includes('checkout');
}

function toIsoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function toIsoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function parsePositiveDays(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function isWithinRange(value, startIso = null, endIso = null) {
  const ts = Date.parse(String(value || ''));
  if (Number.isNaN(ts)) return false;
  if (startIso) {
    const startTs = Date.parse(String(startIso));
    if (!Number.isNaN(startTs) && ts < startTs) return false;
  }
  if (endIso) {
    const endTs = Date.parse(String(endIso));
    if (!Number.isNaN(endTs) && ts > endTs) return false;
  }
  return true;
}

async function loadAutomationSnapshot(config) {
  const rows = await restSelect(config, 'site_settings', {
    select: 'key,value_json',
    key: `eq.${EMAIL_AUTOMATION_SNAPSHOT_KEY}`,
    limit: 1,
  }).catch(() => []);
  const value = Array.isArray(rows) && rows.length ? rows[0]?.value_json : null;
  return value && typeof value === 'object' ? value : { products: {} };
}

async function saveAutomationSnapshot(config, snapshot) {
  const payload = {
    key: EMAIL_AUTOMATION_SNAPSHOT_KEY,
    value_json: snapshot && typeof snapshot === 'object' ? snapshot : { products: {} },
    description: 'Mail otomasyon urun snapshot',
    is_public: false,
    updated_by: 'system',
  };
  const existing = await restSelect(config, 'site_settings', {
    select: 'key',
    key: `eq.${EMAIL_AUTOMATION_SNAPSHOT_KEY}`,
    limit: 1,
  }).catch(() => []);
  if (Array.isArray(existing) && existing.length) {
    await restUpdate(config, 'site_settings', { key: `eq.${EMAIL_AUTOMATION_SNAPSHOT_KEY}` }, payload).catch(() => null);
  } else {
    await restInsert(config, 'site_settings', payload, { prefer: 'return=minimal' }).catch(() => null);
  }
}

async function loadMarketingAudienceByProduct(config, options = {}) {
  const lookbackDays = parsePositiveDays(options.lookback_days, 90);
  const sinceIso = toIsoDaysAgo(lookbackDays);

  const consentRows = await restSelect(config, 'customer_profiles', {
    select: 'email,full_name,consent_marketing_email',
    consent_marketing_email: 'eq.true',
    email: 'not.is.null',
    limit: 5000,
  }).catch(() => []);
  const consentMap = new Map();
  (consentRows || []).forEach((row) => {
    const email = normalizeEmail(row?.email);
    if (!email) return;
    consentMap.set(email, normalizeText(row?.full_name, 180) || '');
  });

  const logs = await restSelect(config, 'audit_logs', {
    select: 'actor_email,metadata,action,created_at',
    created_at: `gte.${sinceIso}`,
    action: 'in.("traffic.click","traffic.page_view")',
    order: 'created_at.desc',
    limit: 10000,
  }).catch(() => []);

  const audienceByProductCode = new Map();
  (logs || []).forEach((row) => {
    const metadata = row && typeof row.metadata === 'object' ? row.metadata : {};
    const email = normalizeEmail(row?.actor_email || metadata.customer_email);
    const productCode = normalizeText(metadata.product_code, 120).toUpperCase();
    if (!email || !productCode) return;
    if (!consentMap.has(email)) return;
    if (!audienceByProductCode.has(productCode)) audienceByProductCode.set(productCode, new Map());
    const current = audienceByProductCode.get(productCode);
    current.set(email, consentMap.get(email) || '');
  });
  return audienceByProductCode;
}

async function runAbandonedCartFlow(config) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) {
    return { enabled: false, reason: 'RESEND_API_KEY missing', checked_sessions: 0, sent: 0 };
  }

  const rows = await restSelect(config, 'audit_logs', {
    select: 'id,actor_email,action,metadata,created_at',
    created_at: `gte.${toIsoHoursAgo(48)}`,
    action: 'in.("traffic.click","traffic.page_view","email.cart_abandoned.sent")',
    order: 'created_at.asc',
    limit: 5000,
  }).catch(() => []);

  const sessions = new Map();
  const sentRecently = new Set();

  rows.forEach((row) => {
    const action = normalizeText(row && row.action, 80).toLowerCase();
    const metadata = row && typeof row.metadata === 'object' ? row.metadata : {};
    const actorEmail = normalizeEmail(row && row.actor_email) || normalizeEmailFromMetadata(metadata);
    const sessionId = normalizeText(metadata.session_id, 200);

    if (action === 'email.cart_abandoned.sent') {
      const loggedEmail = actorEmail || normalizeEmail(metadata.email);
      const loggedSession = sessionId || normalizeText(metadata.session_id, 200);
      if (loggedEmail && loggedSession) {
        sentRecently.add(`${loggedEmail}|${loggedSession}`);
      }
      return;
    }

    if (!actorEmail || !sessionId) return;
    const key = `${actorEmail}|${sessionId}`;
    const entry = sessions.get(key) || {
      email: actorEmail,
      session_id: sessionId,
      add_to_cart_at: null,
      checkout_at: null,
      products: {},
    };

    if (isAddToCartEvent(row)) {
      const productCode = normalizeText(metadata.product_code, 120).toUpperCase();
      const productName = normalizeText(metadata.product_name, 220);
      entry.add_to_cart_at = row.created_at || entry.add_to_cart_at;
      if (productCode) {
        entry.products[productCode] = entry.products[productCode] || {
          product_code: productCode,
          product_name: productName || productCode,
          quantity: 0,
        };
        entry.products[productCode].quantity += 1;
        if (!entry.products[productCode].product_name && productName) {
          entry.products[productCode].product_name = productName;
        }
      }
    } else if (isCheckoutViewEvent(row)) {
      entry.checkout_at = row.created_at || entry.checkout_at;
    }

    sessions.set(key, entry);
  });

  const minAgeMs = ABANDONED_CART_MINUTES * 60 * 1000;
  const nowTs = Date.now();
  const candidates = Array.from(sessions.values()).filter((entry) => {
    if (!entry.add_to_cart_at) return false;
    const addTs = new Date(entry.add_to_cart_at).getTime();
    if (!Number.isFinite(addTs)) return false;
    if (nowTs - addTs < minAgeMs) return false;

    if (entry.checkout_at) {
      const checkoutTs = new Date(entry.checkout_at).getTime();
      if (Number.isFinite(checkoutTs) && checkoutTs >= addTs) return false;
    }
    if (sentRecently.has(`${entry.email}|${entry.session_id}`)) return false;
    return Object.keys(entry.products || {}).length > 0;
  });

  if (!candidates.length) {
    return { enabled: true, checked_sessions: sessions.size, candidates: 0, sent: 0 };
  }

  const productCodes = Array.from(new Set(
    candidates.flatMap((entry) => Object.keys(entry.products || {}))
  ));
  const codeFilter = buildInFilter(productCodes, 120);
  const products = codeFilter
    ? await restSelect(config, 'products', {
      select: 'code,name,price,images,seo_slug',
      code: codeFilter,
      limit: 3000,
    }).catch(() => [])
    : [];

  const productByCode = new Map(
    (products || []).map((row) => [normalizeText(row && row.code, 120).toUpperCase(), row])
  );

  const promoCode = normalizeText(process.env.ABANDONED_CART_PROMO_CODE, 80).toUpperCase();
  const promoText = normalizeText(process.env.ABANDONED_CART_PROMO_TEXT, 200);
  let sent = 0;

  for (const entry of candidates) {
    const topItems = Object.values(entry.products || {})
      .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
      .slice(0, 4)
      .map((item) => {
        const product = productByCode.get(String(item.product_code || '').toUpperCase());
        return {
          name: normalizeText((product && product.name) || item.product_name, 220) || 'Urun',
          quantity: Number(item.quantity || 1),
        };
      });

    const html = cartAbandonedTemplate({
      customerName: '',
      items: topItems,
      cartUrl: `${DEFAULT_SITE_ORIGIN}/checkout.html`,
      discountCode: promoCode || '',
      discountText: promoText || '',
    });

    try {
      await sendEmail({
        to: entry.email,
        subject: promoCode
          ? `Sepetiniz sizi bekliyor - indirim kodunuz: ${promoCode}`
          : 'Sepetinizde urunler sizi bekliyor',
        html,
      });
      sent += 1;

      await restInsert(config, 'audit_logs', {
        actor_user_id: null,
        actor_email: entry.email,
        actor_role: 'system',
        action: 'email.cart_abandoned.sent',
        entity_type: 'marketing_email',
        entity_id: entry.session_id,
        metadata: {
          session_id: entry.session_id,
          email: entry.email,
          product_codes: Object.keys(entry.products || {}),
          promo_code: promoCode || null,
        },
        request_path: '/api/public/marketing-cron',
        request_method: 'GET',
      }, { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      console.error('[marketing] abandoned cart email failed:', error?.message || error);
    }
  }

  return {
    enabled: true,
    checked_sessions: sessions.size,
    candidates: candidates.length,
    sent,
  };
}

async function runProductIntroFlow(config) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) {
    return { enabled: false, reason: 'RESEND_API_KEY missing', recipients: 0, sent: 0 };
  }

  const recipients = await restSelect(config, 'customer_profiles', {
    select: 'id,email,full_name,consent_marketing_email',
    consent_marketing_email: 'eq.true',
    email: 'not.is.null',
    limit: 2000,
  }).catch(() => []);

  if (!recipients.length) {
    return { enabled: true, recipients: 0, sent: 0 };
  }

  const recentSends = await restSelect(config, 'audit_logs', {
    select: 'actor_email,action,created_at',
    action: 'eq.email.product_intro.sent',
    created_at: `gte.${toIsoDaysAgo(7)}`,
    limit: 5000,
  }).catch(() => []);

  const alreadySent = new Set(
    (recentSends || [])
      .map((row) => normalizeEmail(row && row.actor_email))
      .filter(Boolean)
  );

  let products = await restSelect(config, 'products', {
    select: 'code,name,price,images,seo_slug,active,archived,created_at,display_order',
    active: 'eq.true',
    archived: 'eq.false',
    order: 'created_at.desc',
    limit: 24,
  }).catch(() => []);

  if (!products.length) {
    products = await restSelect(config, 'products', {
      select: 'code,name,price,images,seo_slug,active,created_at,display_order',
      active: 'eq.true',
      order: 'created_at.desc',
      limit: 24,
    }).catch(() => []);
  }

  const showcaseProducts = (products || [])
    .filter((row) => normalizeText(row && row.name, 200))
    .slice(0, 6)
    .map((row) => {
      const code = normalizeText(row && row.code, 120).toUpperCase();
      const image = firstImageUrl(row && row.images);
      const url = code
        ? `${DEFAULT_SITE_ORIGIN}/product.html?code=${encodeURIComponent(code)}`
        : DEFAULT_SITE_ORIGIN;
      return {
        name: normalizeText(row && row.name, 220),
        price: Number.isFinite(Number(row && row.price)) ? Number(row.price).toFixed(2) : '',
        image,
        url,
      };
    });

  if (!showcaseProducts.length) {
    return { enabled: true, recipients: recipients.length, sent: 0, reason: 'no active products' };
  }

  const batchLimit = parsePositiveInt(process.env.PRODUCT_INTRO_BATCH_LIMIT, 150);
  const targetRecipients = recipients
    .map((row) => ({
      email: normalizeEmail(row && row.email),
      full_name: normalizeText(row && row.full_name, 180),
    }))
    .filter((row) => row.email && !alreadySent.has(row.email))
    .slice(0, batchLimit);

  let sent = 0;
  for (const recipient of targetRecipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: 'Sizin icin secilen yeni urunler',
        html: productShowcaseTemplate({
          customerName: recipient.full_name || '',
          products: showcaseProducts,
          catalogUrl: DEFAULT_SITE_ORIGIN,
        }),
      });
      sent += 1;

      await restInsert(config, 'audit_logs', {
        actor_user_id: null,
        actor_email: recipient.email,
        actor_role: 'system',
        action: 'email.product_intro.sent',
        entity_type: 'marketing_email',
        entity_id: recipient.email,
        metadata: {
          campaign: 'weekly_product_intro',
        },
        request_path: '/api/public/marketing-cron',
        request_method: 'GET',
      }, { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      console.error('[marketing] product intro email failed:', error?.message || error);
    }
  }

  return {
    enabled: true,
    recipients: recipients.length,
    queued: targetRecipients.length,
    sent,
  };
}

async function runReviewRequestFlow(config, automationSettings = null) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) {
    return { enabled: false, reason: 'RESEND_API_KEY missing', eligible: 0, sent: 0 };
  }

  const settings = automationSettings && typeof automationSettings === 'object' ? automationSettings : {};
  const delayDays = parsePositiveDays(settings.review_request_delay_days, parsePositiveDays(process.env.REVIEW_REQUEST_DELAY_DAYS, 5));
  const batchLimit = parsePositiveInt(settings.review_request_batch_limit, parsePositiveInt(process.env.REVIEW_REQUEST_BATCH_LIMIT, 200));
  const thresholdIso = toIsoDaysAgo(delayDays);

  const orders = await restSelect(config, 'orders', {
    select: 'id,order_no,customer_name,email,status,shipped_at,created_at',
    status: 'eq.delivered',
    order: 'created_at.desc',
    limit: 5000,
  }).catch(() => []);

  if (!orders.length) {
    return { enabled: true, delay_days: delayDays, eligible: 0, sent: 0 };
  }

  const recentLogs = await restSelect(config, 'audit_logs', {
    select: 'entity_id,action,created_at',
    action: 'eq.email.review_request.sent',
    created_at: `gte.${toIsoDaysAgo(180)}`,
    limit: 5000,
  }).catch(() => []);

  const alreadySentOrderIds = new Set(
    (recentLogs || [])
      .map((row) => normalizeText(row?.entity_id, 120))
      .filter(Boolean)
  );

  const eligible = (orders || [])
    .map((row) => ({
      id: normalizeText(row?.id, 120),
      order_no: normalizeText(row?.order_no, 120) || '-',
      customer_name: normalizeText(row?.customer_name, 180) || '',
      email: normalizeEmail(row?.email),
      date_ref: normalizeText(row?.shipped_at, 80) || normalizeText(row?.created_at, 80) || null,
    }))
    .filter((row) => {
      if (!row.id || !row.email || !row.date_ref) return false;
      if (alreadySentOrderIds.has(row.id)) return false;
      return isWithinRange(row.date_ref, null, thresholdIso);
    })
    .slice(0, batchLimit);

  let sent = 0;
  for (const row of eligible) {
    const reviewUrl = `${DEFAULT_SITE_ORIGIN}/account.html?review=${encodeURIComponent(row.order_no)}`;
    try {
      await sendEmail({
        to: row.email,
        subject: `Siparis deneyiminizi degerlendirin #${row.order_no}`,
        html: reviewRequestTemplate({
          orderNo: row.order_no,
          customerName: row.customer_name,
          reviewUrl,
        }),
      });
      sent += 1;

      await restInsert(config, 'audit_logs', {
        actor_user_id: null,
        actor_email: row.email,
        actor_role: 'system',
        action: 'email.review_request.sent',
        entity_type: 'order',
        entity_id: row.id,
        metadata: {
          order_no: row.order_no,
          email: row.email,
          delay_days: delayDays,
        },
        request_path: '/api/public/marketing-cron',
        request_method: 'GET',
      }, { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      console.error('[marketing] review request email failed:', error?.message || error);
    }
  }

  return {
    enabled: true,
    delay_days: delayDays,
    eligible: eligible.length,
    sent,
  };
}

async function fetchAutomationProducts(config) {
  let products = await restSelect(config, 'products', {
    select: 'code,name,price,images,seo_slug,active,archived,stock_quantity',
    active: 'eq.true',
    archived: 'eq.false',
    limit: 5000,
  }).catch(() => []);
  if (!products.length) {
    products = await restSelect(config, 'products', {
      select: 'code,name,price,images,seo_slug,active,stock_quantity',
      active: 'eq.true',
      limit: 5000,
    }).catch(() => []);
  }
  return products || [];
}

function buildProductSnapshot(products) {
  const next = {};
  (products || []).forEach((row) => {
    const code = normalizeText(row?.code, 120).toUpperCase();
    if (!code) return;
    const price = Number(row?.price);
    const stock = Number(row?.stock_quantity);
    next[code] = {
      price: Number.isFinite(price) ? Math.round(price * 100) / 100 : null,
      stock_quantity: Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0,
    };
  });
  return next;
}

async function runStockBackInFlow(config, previousSnapshot = {}, products = null) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return { enabled: false, reason: 'RESEND_API_KEY missing', sent: 0 };

  const list = Array.isArray(products) ? products : await fetchAutomationProducts(config);
  const currentSnapshot = buildProductSnapshot(list);
  const prev = previousSnapshot && typeof previousSnapshot === 'object' ? previousSnapshot : {};

  const restockedCodes = Object.keys(currentSnapshot).filter((code) => {
    const prevStock = Number(prev?.[code]?.stock_quantity || 0);
    const nextStock = Number(currentSnapshot?.[code]?.stock_quantity || 0);
    return prevStock <= 0 && nextStock > 0;
  });
  if (!restockedCodes.length) return { enabled: true, candidates: 0, sent: 0 };

  const audienceByProduct = await loadMarketingAudienceByProduct(config);
  const recentLogs = await restSelect(config, 'audit_logs', {
    select: 'actor_email,entity_id,action,created_at',
    action: 'eq.email.stock_back_in.sent',
    created_at: `gte.${toIsoDaysAgo(14)}`,
    limit: 5000,
  }).catch(() => []);
  const recentlySent = new Set(
    (recentLogs || [])
      .map((row) => `${normalizeEmail(row?.actor_email)}|${normalizeText(row?.entity_id, 120).toUpperCase()}`)
      .filter((key) => key !== '|')
  );

  const byCode = new Map((list || []).map((row) => [normalizeText(row?.code, 120).toUpperCase(), row]));
  let sent = 0;
  let candidates = 0;
  for (const code of restockedCodes) {
    const recipientsMap = audienceByProduct.get(code);
    if (!recipientsMap || !recipientsMap.size) continue;
    const product = byCode.get(code);
    const productName = normalizeText(product?.name, 220) || code;
    const priceValue = Number(product?.price);
    const price = Number.isFinite(priceValue) ? priceValue.toFixed(2) : '';
    const productUrl = `${DEFAULT_SITE_ORIGIN}/product.html?code=${encodeURIComponent(code)}`;
    for (const [email, fullName] of recipientsMap.entries()) {
      const dedupeKey = `${email}|${code}`;
      if (recentlySent.has(dedupeKey)) continue;
      candidates += 1;
      try {
        await sendEmail({
          to: email,
          subject: `${productName} tekrar stokta`,
          html: stockBackInTemplate({
            customerName: fullName || '',
            productName,
            productUrl,
            price,
          }),
        });
        sent += 1;
        recentlySent.add(dedupeKey);
        await restInsert(config, 'audit_logs', {
          actor_user_id: null,
          actor_email: email,
          actor_role: 'system',
          action: 'email.stock_back_in.sent',
          entity_type: 'product',
          entity_id: code,
          metadata: { product_code: code, product_name: productName },
          request_path: '/api/public/marketing-cron',
          request_method: 'GET',
        }, { prefer: 'return=minimal' }).catch(() => null);
      } catch (error) {
        console.error('[marketing] stock back in email failed:', error?.message || error);
      }
    }
  }

  return { enabled: true, candidates, sent, product_count: restockedCodes.length };
}

async function runPriceDropFlow(config, previousSnapshot = {}, products = null) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return { enabled: false, reason: 'RESEND_API_KEY missing', sent: 0 };

  const list = Array.isArray(products) ? products : await fetchAutomationProducts(config);
  const currentSnapshot = buildProductSnapshot(list);
  const prev = previousSnapshot && typeof previousSnapshot === 'object' ? previousSnapshot : {};

  const droppedCodes = Object.keys(currentSnapshot).filter((code) => {
    const prevPrice = Number(prev?.[code]?.price);
    const nextPrice = Number(currentSnapshot?.[code]?.price);
    if (!Number.isFinite(prevPrice) || !Number.isFinite(nextPrice)) return false;
    return nextPrice > 0 && nextPrice < prevPrice;
  });
  if (!droppedCodes.length) return { enabled: true, candidates: 0, sent: 0 };

  const audienceByProduct = await loadMarketingAudienceByProduct(config);
  const recentLogs = await restSelect(config, 'audit_logs', {
    select: 'actor_email,entity_id,action,created_at',
    action: 'eq.email.price_drop.sent',
    created_at: `gte.${toIsoDaysAgo(7)}`,
    limit: 5000,
  }).catch(() => []);
  const recentlySent = new Set(
    (recentLogs || [])
      .map((row) => `${normalizeEmail(row?.actor_email)}|${normalizeText(row?.entity_id, 120).toUpperCase()}`)
      .filter((key) => key !== '|')
  );

  const byCode = new Map((list || []).map((row) => [normalizeText(row?.code, 120).toUpperCase(), row]));
  let sent = 0;
  let candidates = 0;
  for (const code of droppedCodes) {
    const recipientsMap = audienceByProduct.get(code);
    if (!recipientsMap || !recipientsMap.size) continue;
    const product = byCode.get(code);
    const productName = normalizeText(product?.name, 220) || code;
    const productUrl = `${DEFAULT_SITE_ORIGIN}/product.html?code=${encodeURIComponent(code)}`;
    const oldPrice = Number(prev?.[code]?.price || 0);
    const newPrice = Number(currentSnapshot?.[code]?.price || 0);
    for (const [email, fullName] of recipientsMap.entries()) {
      const dedupeKey = `${email}|${code}`;
      if (recentlySent.has(dedupeKey)) continue;
      candidates += 1;
      try {
        await sendEmail({
          to: email,
          subject: `${productName} fiyatinda indirim`,
          html: priceDropTemplate({
            customerName: fullName || '',
            productName,
            oldPrice,
            newPrice,
            productUrl,
          }),
        });
        sent += 1;
        recentlySent.add(dedupeKey);
        await restInsert(config, 'audit_logs', {
          actor_user_id: null,
          actor_email: email,
          actor_role: 'system',
          action: 'email.price_drop.sent',
          entity_type: 'product',
          entity_id: code,
          metadata: { product_code: code, product_name: productName, old_price: oldPrice, new_price: newPrice },
          request_path: '/api/public/marketing-cron',
          request_method: 'GET',
        }, { prefer: 'return=minimal' }).catch(() => null);
      } catch (error) {
        console.error('[marketing] price drop email failed:', error?.message || error);
      }
    }
  }
  return { enabled: true, candidates, sent, product_count: droppedCodes.length };
}

async function runOrderConfirmationAutoFlow(config) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return { enabled: false, reason: 'RESEND_API_KEY missing', sent: 0 };

  const rows = await restSelect(config, 'orders', {
    select: 'id,order_no,customer_name,email,payment_status,created_at',
    payment_status: 'eq.paid',
    created_at: `gte.${toIsoDaysAgo(14)}`,
    order: 'created_at.desc',
    limit: 5000,
  }).catch(() => []);

  const logs = await restSelect(config, 'audit_logs', {
    select: 'entity_id,action,created_at',
    action: 'in.("email.order_confirmation.manual.sent","email.order_confirmation.auto.sent")',
    created_at: `gte.${toIsoDaysAgo(180)}`,
    limit: 5000,
  }).catch(() => []);
  const sentOrderIds = new Set((logs || []).map((row) => normalizeText(row?.entity_id, 120)).filter(Boolean));

  let sent = 0;
  const eligible = (rows || []).filter((row) => {
    const id = normalizeText(row?.id, 120);
    const email = normalizeEmail(row?.email);
    return id && email && !sentOrderIds.has(id);
  });

  for (const row of eligible.slice(0, 400)) {
    const orderNo = normalizeText(row?.order_no, 120) || '-';
    const email = normalizeEmail(row?.email);
    const customerName = normalizeText(row?.customer_name, 180) || '';
    try {
      await sendEmail({
        to: email,
        subject: `Siparisiniz Alindi #${orderNo}`,
        html: orderConfirmationTemplate({
          orderNo,
          customerName,
          items: [],
          total: null,
        }),
      });
      sent += 1;
      await restInsert(config, 'audit_logs', {
        actor_user_id: null,
        actor_email: email,
        actor_role: 'system',
        action: 'email.order_confirmation.auto.sent',
        entity_type: 'order',
        entity_id: normalizeText(row?.id, 120) || null,
        metadata: { order_no: orderNo, email },
        request_path: '/api/public/marketing-cron',
        request_method: 'GET',
      }, { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      console.error('[marketing] order confirmation auto email failed:', error?.message || error);
    }
  }
  return { enabled: true, eligible: eligible.length, sent };
}

async function runDeliveredAutoFlow(config) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return { enabled: false, reason: 'RESEND_API_KEY missing', sent: 0 };
  const rows = await restSelect(config, 'orders', {
    select: 'id,order_no,customer_name,email,status,created_at',
    status: 'eq.delivered',
    created_at: `gte.${toIsoDaysAgo(30)}`,
    order: 'created_at.desc',
    limit: 5000,
  }).catch(() => []);
  const logs = await restSelect(config, 'audit_logs', {
    select: 'entity_id,action,created_at',
    action: 'in.("email.delivered.manual.sent","email.delivered.auto.sent")',
    created_at: `gte.${toIsoDaysAgo(180)}`,
    limit: 5000,
  }).catch(() => []);
  const sentOrderIds = new Set((logs || []).map((row) => normalizeText(row?.entity_id, 120)).filter(Boolean));
  let sent = 0;
  const eligible = (rows || []).filter((row) => {
    const id = normalizeText(row?.id, 120);
    const email = normalizeEmail(row?.email);
    return id && email && !sentOrderIds.has(id);
  });
  for (const row of eligible.slice(0, 300)) {
    const orderNo = normalizeText(row?.order_no, 120) || '-';
    const email = normalizeEmail(row?.email);
    const customerName = normalizeText(row?.customer_name, 180) || '';
    try {
      await sendEmail({
        to: email,
        subject: `Siparisiniz Teslim Edildi #${orderNo}`,
        html: orderDeliveredTemplate({
          orderNo,
          customerName,
        }),
      });
      sent += 1;
      await restInsert(config, 'audit_logs', {
        actor_user_id: null,
        actor_email: email,
        actor_role: 'system',
        action: 'email.delivered.auto.sent',
        entity_type: 'order',
        entity_id: normalizeText(row?.id, 120) || null,
        metadata: { order_no: orderNo, email },
        request_path: '/api/public/marketing-cron',
        request_method: 'GET',
      }, { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      console.error('[marketing] delivered auto email failed:', error?.message || error);
    }
  }
  return { enabled: true, eligible: eligible.length, sent };
}

async function runInvoiceReadyFlow(config) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return { enabled: false, reason: 'RESEND_API_KEY missing', sent: 0 };
  const rows = await restSelect(config, 'orders', {
    select: 'id,order_no,customer_name,email,payment_status,paid_at,created_at',
    payment_status: 'eq.paid',
    created_at: `gte.${toIsoDaysAgo(45)}`,
    order: 'created_at.desc',
    limit: 5000,
  }).catch(() => []);
  const logs = await restSelect(config, 'audit_logs', {
    select: 'entity_id,action,created_at',
    action: 'eq.email.invoice_ready.sent',
    created_at: `gte.${toIsoDaysAgo(365)}`,
    limit: 5000,
  }).catch(() => []);
  const sentOrderIds = new Set((logs || []).map((row) => normalizeText(row?.entity_id, 120)).filter(Boolean));

  let sent = 0;
  const eligible = (rows || []).filter((row) => {
    const id = normalizeText(row?.id, 120);
    const email = normalizeEmail(row?.email);
    return id && email && !sentOrderIds.has(id);
  });

  for (const row of eligible.slice(0, 400)) {
    const orderNo = normalizeText(row?.order_no, 120) || '-';
    const email = normalizeEmail(row?.email);
    const customerName = normalizeText(row?.customer_name, 180) || '';
    try {
      await sendEmail({
        to: email,
        subject: `Faturaniz hazir #${orderNo}`,
        html: invoiceReadyTemplate({
          customerName,
          orderNo,
          invoiceUrl: `${DEFAULT_SITE_ORIGIN}/account.html`,
        }),
      });
      sent += 1;
      await restInsert(config, 'audit_logs', {
        actor_user_id: null,
        actor_email: email,
        actor_role: 'system',
        action: 'email.invoice_ready.sent',
        entity_type: 'order',
        entity_id: normalizeText(row?.id, 120) || null,
        metadata: { order_no: orderNo, email },
        request_path: '/api/public/marketing-cron',
        request_method: 'GET',
      }, { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      console.error('[marketing] invoice ready email failed:', error?.message || error);
    }
  }
  return { enabled: true, eligible: eligible.length, sent };
}

async function runMarketingFlowsByMode(config, mode = 'all') {
  const automationSettings = await loadEmailAutomationSettings(config).catch(() => null);
  const automation = automationSettings && typeof automationSettings === 'object'
    ? automationSettings
    : {};
  const normalizedMode = normalizeText(mode, 40).toLowerCase() || 'all';
  const runAbandoned = normalizedMode === 'all' || normalizedMode === 'abandoned';
  const runProductIntro = normalizedMode === 'all' || normalizedMode === 'product-intro';
  const runReviewRequest = normalizedMode === 'all' || normalizedMode === 'review-request';
  const runStockBack = normalizedMode === 'all' || normalizedMode === 'stock-back';
  const runPriceDrop = normalizedMode === 'all' || normalizedMode === 'price-drop';
  const runOrderConfirmation = normalizedMode === 'all' || normalizedMode === 'order-confirmation';
  const runDelivered = normalizedMode === 'all' || normalizedMode === 'delivered';
  const runInvoiceReady = normalizedMode === 'all' || normalizedMode === 'invoice-ready';

  const result = {
    mode: normalizedMode,
    automation,
    abandoned_cart: null,
    product_intro: null,
    review_request: null,
    stock_back_in: null,
    price_drop: null,
    order_confirmation: null,
    delivered: null,
    invoice_ready: null,
  };

  if (runAbandoned) {
    result.abandoned_cart = automation.auto_abandoned_cart === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runAbandonedCartFlow(config);
  }
  if (runProductIntro) {
    result.product_intro = automation.auto_product_intro === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runProductIntroFlow(config);
  }
  if (runReviewRequest) {
    result.review_request = automation.auto_review_request === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runReviewRequestFlow(config, automation);
  }

  const shouldRunInventoryFlows = (runStockBack || runPriceDrop) &&
    (automation.auto_stock_back_in !== false || automation.auto_price_drop !== false);
  const products = shouldRunInventoryFlows ? await fetchAutomationProducts(config) : [];
  const snapshotState = shouldRunInventoryFlows ? await loadAutomationSnapshot(config) : { products: {} };
  const previousProducts = snapshotState && typeof snapshotState === 'object' && snapshotState.products && typeof snapshotState.products === 'object'
    ? snapshotState.products
    : {};

  if (runStockBack) {
    result.stock_back_in = automation.auto_stock_back_in === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runStockBackInFlow(config, previousProducts, products);
  }
  if (runPriceDrop) {
    result.price_drop = automation.auto_price_drop === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runPriceDropFlow(config, previousProducts, products);
  }
  if (shouldRunInventoryFlows) {
    await saveAutomationSnapshot(config, {
      updated_at: new Date().toISOString(),
      products: buildProductSnapshot(products),
    });
  }

  if (runOrderConfirmation) {
    result.order_confirmation = automation.auto_order_confirmation === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runOrderConfirmationAutoFlow(config);
  }
  if (runDelivered) {
    result.delivered = automation.auto_delivered === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runDeliveredAutoFlow(config);
  }
  if (runInvoiceReady) {
    result.invoice_ready = automation.auto_invoice_ready === false
      ? { enabled: false, reason: 'disabled_by_setting' }
      : await runInvoiceReadyFlow(config);
  }
  return result;
}

function getMarketingEnvStatus() {
  const configuredSecret = normalizeText(process.env.MARKETING_CRON_SECRET, 300) || normalizeText(process.env.CRON_SECRET, 300);
  return {
    resend_configured: Boolean(process.env.RESEND_API_KEY),
    cron_secret_configured: Boolean(configuredSecret),
    abandoned_cart_promo_code: normalizeText(process.env.ABANDONED_CART_PROMO_CODE, 80) || null,
    product_intro_batch_limit: parsePositiveInt(process.env.PRODUCT_INTRO_BATCH_LIMIT, 150),
    review_request_delay_days: parsePositiveDays(process.env.REVIEW_REQUEST_DELAY_DAYS, 5),
    review_request_batch_limit: parsePositiveInt(process.env.REVIEW_REQUEST_BATCH_LIMIT, 200),
    inventory_snapshot_key: EMAIL_AUTOMATION_SNAPSHOT_KEY,
  };
}

const publicMarketingCronHandler = createApiHandler(
  {
    methods: ['GET', 'POST'],
    requireAuth: false,
    rateLimit: 20,
  },
  async (req, res, ctx) => {
    if (!hasCronAuthorization(req)) {
      return sendError(res, 403, 'Forbidden', 'CRON_FORBIDDEN');
    }

    const mode = normalizeText(new URL(req.url, 'http://localhost').searchParams.get('mode'), 40).toLowerCase() || 'all';
    const result = await runMarketingFlowsByMode(ctx.config, mode);

    return sendSuccess(res, result);
  }
);

publicMarketingCronHandler.runByMode = runMarketingFlowsByMode;
publicMarketingCronHandler.getEnvStatus = getMarketingEnvStatus;

module.exports = publicMarketingCronHandler;

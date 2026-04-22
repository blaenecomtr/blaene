const { createApiHandler } = require('../api/handler');
const { sendSuccess, sendError } = require('../api/response');
const { normalizeEmail, normalizeText } = require('../api/validation');
const { restInsert, restSelect } = require('../api/supabase');
const { sendEmail } = require('../email/resend');
const { cartAbandonedTemplate, productShowcaseTemplate, reviewRequestTemplate } = require('../email/templates');

const DEFAULT_SITE_ORIGIN = 'https://www.blaene.com.tr';
const DEFAULT_SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
const ABANDONED_CART_MINUTES = 45;

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

async function runReviewRequestFlow(config) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) {
    return { enabled: false, reason: 'RESEND_API_KEY missing', eligible: 0, sent: 0 };
  }

  const delayDays = parsePositiveDays(process.env.REVIEW_REQUEST_DELAY_DAYS, 5);
  const batchLimit = parsePositiveInt(process.env.REVIEW_REQUEST_BATCH_LIMIT, 200);
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

async function runMarketingFlowsByMode(config, mode = 'all') {
  const normalizedMode = normalizeText(mode, 40).toLowerCase() || 'all';
  const runAbandoned = normalizedMode === 'all' || normalizedMode === 'abandoned';
  const runProductIntro = normalizedMode === 'all' || normalizedMode === 'product-intro';
  const runReviewRequest = normalizedMode === 'all' || normalizedMode === 'review-request';

  const result = {
    mode: normalizedMode,
    abandoned_cart: null,
    product_intro: null,
    review_request: null,
  };

  if (runAbandoned) {
    result.abandoned_cart = await runAbandonedCartFlow(config);
  }
  if (runProductIntro) {
    result.product_intro = await runProductIntroFlow(config);
  }
  if (runReviewRequest) {
    result.review_request = await runReviewRequestFlow(config);
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

const crypto = require('crypto');
const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess, sendError } = require('../../lib/api/response');
const {
  restSelect,
  restInsert,
  restUpdate,
  restDelete,
  buildServiceHeaders,
} = require('../../lib/api/supabase');
const { readJsonBody } = require('../../lib/api/request');
const {
  sanitizeObjectShallow,
  validateRequiredFields,
  normalizeText,
  normalizePrice,
  normalizePositiveInt,
  normalizeEmail,
  normalizeRole,
  normalizeTier,
} = require('../../lib/api/validation');
const { hasRole, canManageRole } = require('../../lib/api/auth');
const { ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER } = require('../../lib/api/constants');
const { writeAuditLog } = require('../../lib/api/audit');
const { createShipment, isProviderConfigured, PROVIDERS } = require('../../lib/api/shipping-adapters');
const { sendEmail } = require('../../lib/email/resend');
const {
  orderConfirmationTemplate,
  orderShippedTemplate,
  orderDeliveredTemplate,
  reviewRequestTemplate,
  supportTicketUpdatedTemplate,
  invoiceReadyTemplate,
  couponBroadcastTemplate,
} = require('../../lib/email/templates');
const marketingCronHandler = require('../../lib/handlers/public-marketing-cron');
const { loadEmailAutomationSettings } = require('../../lib/email/automation-settings');

const STAFF_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER];
const ADMIN_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN];
const WRITER_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR];
const CATEGORY_ALLOWED = ['bath', 'forge', 'industrial'];
const PAYMENT_STATUS_ALLOWED = ['pending', 'paid', 'failed'];
const ORDER_STATUS_ALLOWED = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const SUBSCRIPTION_STATUS_ALLOWED = ['active', 'trialing', 'canceled', 'expired', 'past_due'];
const PROMOTION_TYPE_ALLOWED = ['percent', 'fixed'];
const TICKET_STATUS_ALLOWED = ['open', 'pending', 'closed'];
const TICKET_PRIORITY_ALLOWED = ['low', 'medium', 'high', 'urgent'];
const SENDER_TYPE_ALLOWED = ['customer', 'agent', 'system'];
const FINANCIAL_TYPE_ALLOWED = ['income', 'expense'];
const MAX_PAGE_SIZE = 200;
const MAX_IMAGE_UPLOAD_BYTES = 6 * 1024 * 1024;
const IMAGE_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const PRODUCT_OPTIONAL_COLUMNS = [
  'stock_threshold',
  'stock_quantity',
  'seo_title',
  'seo_description',
  'seo_slug',
];

function shippingProviderLabel(value) {
  const key = normalizeText(value, 80).toLowerCase();
  if (!key) return '';
  const map = {
    yurtici: 'Yurtici Kargo',
    mng: 'MNG Kargo',
    aras: 'Aras Kargo',
  };
  return map[key] || value;
}

async function sendOrderShippedEmailIfPossible(order) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return false;

  const to = normalizeEmail(order?.email || order?.customer_email);
  if (!to) return false;

  const orderNo = normalizeText(order?.order_no, 120) || '-';
  const customerName = normalizeText(order?.customer_name, 180) || '';
  const trackingCode = normalizeText(order?.tracking_code, 120) || '';
  const shippingProvider = shippingProviderLabel(order?.shipping_provider);

  try {
    await sendEmail({
      to,
      subject: `Siparisiniz Kargoya Verildi #${orderNo}`,
      html: orderShippedTemplate({
        orderNo,
        customerName,
        trackingCode,
        shippingProvider,
      }),
    });
    return true;
  } catch (error) {
    console.error('[shipping] shipped email failed:', error?.message || error);
    return false;
  }
}

async function sendOrderDeliveredEmailIfPossible(order) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return false;

  const to = normalizeEmail(order?.email || order?.customer_email);
  if (!to) return false;

  const orderNo = normalizeText(order?.order_no, 120) || '-';
  const customerName = normalizeText(order?.customer_name, 180) || '';

  try {
    await sendEmail({
      to,
      subject: `Siparisiniz Teslim Edildi #${orderNo}`,
      html: orderDeliveredTemplate({
        orderNo,
        customerName,
      }),
    });
    return true;
  } catch (error) {
    console.error('[order] delivered email failed:', error?.message || error);
    return false;
  }
}

async function sendOrderConfirmationEmailIfPossible(order) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return false;

  const to = normalizeEmail(order?.email || order?.customer_email);
  if (!to) return false;

  const orderNo = normalizeText(order?.order_no, 120) || '-';
  const customerName = normalizeText(order?.customer_name, 180) || '';
  const totalValue = Number(order?.total || 0);

  try {
    await sendEmail({
      to,
      subject: `Siparisiniz Alindi #${orderNo}`,
      html: orderConfirmationTemplate({
        orderNo,
        customerName,
        total: Number.isFinite(totalValue) && totalValue > 0 ? totalValue.toFixed(2) : null,
      }),
    });
    return true;
  } catch (error) {
    console.error('[order] confirmation email failed:', error?.message || error);
    return false;
  }
}

async function sendOrderReviewRequestEmailIfPossible(order) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return false;

  const to = normalizeEmail(order?.email || order?.customer_email);
  if (!to) return false;

  const orderNo = normalizeText(order?.order_no, 120) || '-';
  const customerName = normalizeText(order?.customer_name, 180) || '';
  const reviewUrl = `https://www.blaene.com.tr/account.html?review=${encodeURIComponent(orderNo)}`;

  try {
    await sendEmail({
      to,
      subject: `Siparis degerlendirme daveti #${orderNo}`,
      html: reviewRequestTemplate({
        orderNo,
        customerName,
        reviewUrl,
      }),
    });
    return true;
  } catch (error) {
    console.error('[order] review request email failed:', error?.message || error);
    return false;
  }
}

async function sendInvoiceReadyEmailIfPossible(order) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return false;

  const to = normalizeEmail(order?.email || order?.customer_email);
  if (!to) return false;

  const orderNo = normalizeText(order?.order_no, 120) || '-';
  const customerName = normalizeText(order?.customer_name, 180) || '';

  try {
    await sendEmail({
      to,
      subject: `Faturaniz hazir #${orderNo}`,
      html: invoiceReadyTemplate({
        customerName,
        orderNo,
        invoiceUrl: 'https://www.blaene.com.tr/account.html',
      }),
    });
    return true;
  } catch (error) {
    console.error('[order] invoice ready email failed:', error?.message || error);
    return false;
  }
}

async function sendSupportTicketUpdatedEmailIfPossible(ticket, messageText) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) return false;
  const to = normalizeEmail(ticket?.customer_email);
  if (!to) return false;

  const ticketId = normalizeText(ticket?.id, 120) || '';
  const customerName = normalizeText(ticket?.customer_name, 180) || '';
  const subject = normalizeText(ticket?.subject, 220) || 'Destek talebiniz';
  const preview = normalizeText(messageText, 1000) || 'Talebiniz guncellendi.';

  try {
    await sendEmail({
      to,
      subject: `Destek talebiniz guncellendi${ticketId ? ` #${ticketId.slice(0, 8)}` : ''}`,
      html: supportTicketUpdatedTemplate({
        customerName,
        ticketId,
        subject,
        messagePreview: preview,
      }),
    });
    return true;
  } catch (error) {
    console.error('[support] ticket update email failed:', error?.message || error);
    return false;
  }
}

function isOrderPaymentApproved(order) {
  return normalizeText(order?.payment_status, 40).toLowerCase() === 'paid';
}

function getUrl(req) {
  return new URL(req.url, 'http://localhost');
}

function getRouteKey(req) {
  const path = getUrl(req).pathname.replace(/^\/+/, '');
  const parts = path.split('/');
  const adminIndex = parts.findIndex((part) => part === 'admin');
  if (adminIndex < 0) return '';
  return parts.slice(adminIndex + 1).filter(Boolean).join('/');
}

function parsePagination(query, defaults = {}) {
  const page = normalizePositiveInt(query.get('page'), defaults.page || 1, 999999);
  const pageSize = normalizePositiveInt(
    query.get('page_size'),
    defaults.pageSize || 25,
    defaults.maxPageSize || MAX_PAGE_SIZE
  );
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function paginateRows(rows, pagination) {
  return {
    items: rows.slice(pagination.offset, pagination.offset + pagination.pageSize),
    meta: {
      pagination: {
        page: pagination.page,
        page_size: pagination.pageSize,
        total: rows.length,
      },
    },
  };
}

function parseIsoDate(value) {
  const text = normalizeText(value, 60);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isWithinRange(dateValue, startIso, endIso) {
  if (!startIso && !endIso) return true;
  const value = new Date(dateValue || '');
  if (Number.isNaN(value.getTime())) return false;
  if (startIso) {
    const start = new Date(startIso);
    if (value < start) return false;
  }
  if (endIso) {
    const end = new Date(endIso);
    if (value > end) return false;
  }
  return true;
}

function buildDateRange(query) {
  const range = normalizeText(query.get('range'), 20).toLowerCase();
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { startIso: start.toISOString(), endIso: now.toISOString(), label: 'today' };
  }
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { startIso: start.toISOString(), endIso: now.toISOString(), label: 'week' };
  }
  if (range === 'month') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { startIso: start.toISOString(), endIso: now.toISOString(), label: 'month' };
  }
  const startIso = parseIsoDate(query.get('from'));
  const endIso = parseIsoDate(query.get('to'));
  return { startIso, endIso, label: startIso || endIso ? 'custom' : 'all' };
}

function buildInFilter(ids) {
  const sanitized = ids
    .map((id) => normalizeText(id, 120))
    .filter(Boolean)
    .map((id) => `"${id.replaceAll('"', '\\"')}"`);
  if (!sanitized.length) return '';
  return `in.(${sanitized.join(',')})`;
}

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = normalizeText(value, 10).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function getAIApiKey() {
  return (
    normalizeText(process.env.ANTHROPIC_API_KEY, 4000) ||
    normalizeText(process.env.CLAUDE_API_KEY, 4000)
  );
}

function generateTempPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function getAdminOwnerEmails() {
  const raw = normalizeText(process.env.ADMIN_EMAIL, 4000);
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
}

function isAdminOwner(auth) {
  const actorEmail = normalizeEmail(auth?.user?.email);
  if (!actorEmail) return false;
  const owners = getAdminOwnerEmails();
  if (!owners.length) return false;
  return owners.includes(actorEmail);
}

function isProtectedOwnerEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getAdminOwnerEmails().includes(normalized);
}

function maskSecret(raw) {
  const value = normalizeText(raw, 500);
  if (!value) return null;
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function encryptJsonPayload(payload) {
  const keySource = normalizeText(process.env.CREDENTIALS_ENCRYPTION_KEY, 4000);
  if (!payload || typeof payload !== 'object') return { stored: {}, encrypted: false };
  if (!keySource) return { stored: payload, encrypted: false };

  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(keySource).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    stored: {
      _encrypted: true,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
    },
    encrypted: true,
  };
}

function redactConnection(connection) {
  const credentials = connection?.credentials_json;
  const hasEncryptedPayload = Boolean(credentials && typeof credentials === 'object' && credentials._encrypted);
  const hasPlainCredentials = Boolean(credentials && typeof credentials === 'object' && Object.keys(credentials).length);
  return {
    ...connection,
    credentials_json: undefined,
    credentials_configured: hasEncryptedPayload || hasPlainCredentials,
  };
}

function parseProductPromptFallback(prompt) {
  const clean = normalizeText(prompt, 2000);
  if (!clean) return [];

  const quantityMatch = clean.match(/(\d+)\s*(adet|pcs|piece)?/i);
  const priceMatch = clean.match(/(\d+[.,]?\d*)\s*(₺|tl|try)/i);
  const sizeMatch = clean.match(/\b(xs|s|m|l|xl|xxl)\b/gi);
  const colorMatch = clean.match(/kirmizi|mavi|siyah|beyaz|yesil|gri|kahve|bej/gi);

  const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
  const price = priceMatch ? Number(String(priceMatch[1]).replace(',', '.')) : null;

  const name = clean
    .replace(/(\d+)\s*(adet|pcs|piece)?/ig, '')
    .replace(/(\d+[.,]?\d*)\s*(₺|tl|try)/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  const normalizedSizes = Array.from(
    new Set((sizeMatch || []).map((item) => item.toUpperCase()))
  ).slice(0, 12);
  const normalizedColors = Array.from(
    new Set((colorMatch || []).map((item) => item.toLowerCase()))
  ).slice(0, 8);

  return [{
    code: `AI-${Date.now().toString().slice(-6)}`,
    name: name || 'AI urun taslagi',
    category: 'bath',
    quantity,
    estimated_price: Number.isFinite(price) ? Math.round(price * 100) / 100 : null,
    sizes: normalizedSizes,
    colors: normalizedColors,
  }];
}

function buildSupportReplyFallback(message, ticket) {
  const normalized = normalizeText(message, 2000).toLowerCase();
  if (normalized.includes('iade')) {
    return 'Merhaba, iade talebiniz icin yardimci olmaktan memnuniyet duyariz. Siparis numaranizi paylasirsaniz sureci hemen baslatalim.';
  }
  if (normalized.includes('kargo') || normalized.includes('teslim')) {
    return 'Merhaba, kargo surecinizi kontrol ediyoruz. Takip numarasi olustugunda sizinle ayni kanal uzerinden hemen paylasacagiz.';
  }
  if (normalized.includes('fiyat') || normalized.includes('stok')) {
    return 'Merhaba, fiyat ve stok bilgisi icin ilgili urunu kontrol edip size en kisa surede net bilgi verecegiz.';
  }
  const ticketRef = ticket ? ` Talep no: ${ticket}.` : '';
  return `Merhaba, mesajinizi aldik.${ticketRef} Konuyu kontrol edip en kisa surede net cozumle geri donuyor olacagiz.`;
}

async function safeSelect(config, table, query, fallback = []) {
  try {
    return await restSelect(config, table, query);
  } catch {
    return fallback;
  }
}

async function getShippingProvidersFromSettings(config) {
  const defaultProviders = PROVIDERS.map((provider) => ({
    provider,
    label: provider,
    enabled: true,
  }));

  const rows = await safeSelect(config, 'site_settings', {
    select: 'value_json',
    key: 'eq.shipping_settings',
    limit: 1,
  }, []);

  const valueJson = Array.isArray(rows) && rows.length ? rows[0]?.value_json : null;
  const fromSettings = Array.isArray(valueJson?.providers) ? valueJson.providers : [];
  const normalized = fromSettings
    .map((item, index) => {
      const rawProvider = normalizeText(typeof item === 'string' ? item : item?.provider, 40)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .trim();
      if (!rawProvider) return null;
      return {
        provider: rawProvider,
        label: normalizeText(typeof item === 'string' ? '' : item?.label, 120) || rawProvider || `provider-${index + 1}`,
        enabled: typeof item === 'object' && item ? item.enabled !== false : true,
      };
    })
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((row) => row.provider === item.provider) === index);

  const active = normalized.filter((item) => item.enabled !== false);
  return active.length ? active : defaultProviders;
}

function parseBodySafe(req) {
  return readJsonBody(req).catch(() => ({ body: null }));
}

function toIsoDaysAgo(days) {
  const safeDays = Math.max(0, Number(days) || 0);
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeStorageToken(input, fallback = 'asset') {
  const value = normalizeText(input, 120).toLowerCase();
  const cleaned = value.replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function normalizeSlug(input, fallback = '') {
  const value = normalizeText(input, 220)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const cleaned = value.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function parseImageDataUrl(input) {
  const value = normalizeText(input, 16 * 1024 * 1024);
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const mime = String(match[1] || '').toLowerCase();
  if (!IMAGE_MIME_EXT[mime]) return null;
  let binary;
  try {
    binary = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (!binary || !binary.length) return null;
  return { mime, binary };
}

function normalizeProductPayload(input) {
  const payload = sanitizeObjectShallow(input || {});
  const category = normalizeText(payload.category, 32).toLowerCase();
  const fallbackSlug = normalizeStorageToken(payload.code || payload.name, 'product');
  return {
    code: normalizeText(payload.code, 40).toUpperCase(),
    name: normalizeText(payload.name, 180),
    category: CATEGORY_ALLOWED.includes(category) ? category : 'bath',
    material: normalizeText(payload.material, 180) || null,
    thickness: normalizeText(payload.thickness, 120) || null,
    dims: normalizeText(payload.dims, 180) || null,
    description: normalizeText(payload.description, 3000) || null,
    price: payload.price === null || payload.price === '' ? null : normalizePrice(payload.price),
    price_visible: toBool(payload.price_visible, false),
    images: Array.isArray(payload.images) ? payload.images.filter(Boolean).slice(0, 24) : [],
    variants: Array.isArray(payload.variants) ? payload.variants : [],
    seo_title: normalizeText(payload.seo_title, 160) || null,
    seo_description: normalizeText(payload.seo_description, 320) || null,
    seo_slug: normalizeSlug(payload.seo_slug || payload.name || payload.code, fallbackSlug),
    display_order: normalizePositiveInt(payload.display_order || 0, 0, 9999),
    active: payload.active === undefined ? true : toBool(payload.active, true),
    stock_threshold: normalizePositiveInt(payload.stock_threshold || 0, 0, 999999),
    stock_quantity: normalizePositiveInt(payload.stock_quantity || 0, 0, 999999),
  };
}

function normalizeProductPatch(input) {
  const payload = sanitizeObjectShallow(input || {});
  const patch = {};
  if (payload.code !== undefined) patch.code = normalizeText(payload.code, 40).toUpperCase();
  if (payload.name !== undefined) patch.name = normalizeText(payload.name, 180);
  if (payload.category !== undefined) {
    const category = normalizeText(payload.category, 32).toLowerCase();
    patch.category = CATEGORY_ALLOWED.includes(category) ? category : 'bath';
  }
  if (payload.material !== undefined) patch.material = normalizeText(payload.material, 180) || null;
  if (payload.thickness !== undefined) patch.thickness = normalizeText(payload.thickness, 120) || null;
  if (payload.dims !== undefined) patch.dims = normalizeText(payload.dims, 180) || null;
  if (payload.description !== undefined) patch.description = normalizeText(payload.description, 3000) || null;
  if (payload.price !== undefined) patch.price = payload.price === null || payload.price === '' ? null : normalizePrice(payload.price);
  if (payload.price_visible !== undefined) patch.price_visible = toBool(payload.price_visible, false);
  if (payload.images !== undefined) patch.images = Array.isArray(payload.images) ? payload.images.filter(Boolean).slice(0, 24) : [];
  if (payload.variants !== undefined) patch.variants = Array.isArray(payload.variants) ? payload.variants : [];
  if (payload.seo_title !== undefined) patch.seo_title = normalizeText(payload.seo_title, 160) || null;
  if (payload.seo_description !== undefined) patch.seo_description = normalizeText(payload.seo_description, 320) || null;
  if (payload.seo_slug !== undefined) patch.seo_slug = normalizeSlug(payload.seo_slug, '');
  if (payload.display_order !== undefined) patch.display_order = normalizePositiveInt(payload.display_order || 0, 0, 9999);
  if (payload.active !== undefined) patch.active = toBool(payload.active, true);
  if (payload.archived !== undefined) patch.archived = toBool(payload.archived, false);
  if (payload.stock_threshold !== undefined) patch.stock_threshold = normalizePositiveInt(payload.stock_threshold || 0, 0, 999999);
  if (payload.stock_quantity !== undefined) patch.stock_quantity = normalizePositiveInt(payload.stock_quantity || 0, 0, 999999);
  return patch;
}

function normalizeVariantPayload(input) {
  const payload = sanitizeObjectShallow(input || {});
  return {
    product_id: normalizeText(payload.product_id, 120),
    label: normalizeText(payload.label, 180),
    sku: normalizeText(payload.sku, 120) || null,
    color: normalizeText(payload.color, 80) || null,
    size: normalizeText(payload.size, 40) || null,
    price: payload.price === null || payload.price === '' ? null : normalizePrice(payload.price),
    stock: normalizePositiveInt(payload.stock || 0, 0, 999999),
    images: Array.isArray(payload.images) ? payload.images.filter(Boolean).slice(0, 24) : [],
    active: payload.active === undefined ? true : toBool(payload.active, true),
    display_order: normalizePositiveInt(payload.display_order || 0, 0, 9999),
  };
}

function normalizeVariantPatch(input) {
  const payload = sanitizeObjectShallow(input || {});
  const patch = {};
  if (payload.label !== undefined) patch.label = normalizeText(payload.label, 180);
  if (payload.sku !== undefined) patch.sku = normalizeText(payload.sku, 120) || null;
  if (payload.color !== undefined) patch.color = normalizeText(payload.color, 80) || null;
  if (payload.size !== undefined) patch.size = normalizeText(payload.size, 40) || null;
  if (payload.price !== undefined) patch.price = payload.price === null || payload.price === '' ? null : normalizePrice(payload.price);
  if (payload.stock !== undefined) patch.stock = normalizePositiveInt(payload.stock || 0, 0, 999999);
  if (payload.images !== undefined) patch.images = Array.isArray(payload.images) ? payload.images.filter(Boolean).slice(0, 24) : [];
  if (payload.active !== undefined) patch.active = toBool(payload.active, true);
  if (payload.display_order !== undefined) patch.display_order = normalizePositiveInt(payload.display_order || 0, 0, 9999);
  return patch;
}

function extractMissingColumnName(error) {
  const parts = [
    error?.details?.message,
    error?.details?.hint,
    error?.message,
    error?.details?.details,
  ]
    .map((item) => normalizeText(item, 400))
    .filter(Boolean);
  if (!parts.length) return null;
  const joined = parts.join(' ');

  const cacheMatch = joined.match(/Could not find the '([a-z_]+)' column/i);
  if (cacheMatch?.[1]) return cacheMatch[1].toLowerCase();

  const pgMatch = joined.match(/column\s+"?([a-z_]+)"?/i);
  if (pgMatch?.[1]) return pgMatch[1].toLowerCase();

  return null;
}

function stripUnavailableProductColumn(payload, error) {
  const missingColumn = extractMissingColumnName(error);
  if (!missingColumn) return null;
  if (!PRODUCT_OPTIONAL_COLUMNS.includes(missingColumn)) return null;
  if (!(missingColumn in payload)) return null;
  const next = { ...payload };
  delete next[missingColumn];
  return next;
}

async function insertProductWithFallback(config, payload, options = undefined) {
  let candidate = { ...(payload || {}) };
  for (let attempt = 0; attempt < PRODUCT_OPTIONAL_COLUMNS.length + 1; attempt += 1) {
    try {
      return await restInsert(config, 'products', candidate, options);
    } catch (error) {
      const next = stripUnavailableProductColumn(candidate, error);
      if (!next) throw error;
      candidate = next;
    }
  }
  return restInsert(config, 'products', candidate, options);
}

async function updateProductWithFallback(config, filters, payload, options = undefined) {
  let candidate = { ...(payload || {}) };
  for (let attempt = 0; attempt < PRODUCT_OPTIONAL_COLUMNS.length + 1; attempt += 1) {
    try {
      await restUpdate(config, 'products', filters, candidate, options);
      return;
    } catch (error) {
      const next = stripUnavailableProductColumn(candidate, error);
      if (!next) throw error;
      candidate = next;
    }
  }
  await restUpdate(config, 'products', filters, candidate, options);
}

function normalizePromotionPayload(input, existing = {}) {
  const payload = sanitizeObjectShallow(input || {});
  const next = { ...existing };
  if (payload.code !== undefined) next.code = normalizeText(payload.code, 80).toUpperCase();
  if (payload.title !== undefined) next.title = normalizeText(payload.title, 180);
  if (payload.description !== undefined) next.description = normalizeText(payload.description, 3000) || null;
  if (payload.discount_type !== undefined) {
    const type = normalizeText(payload.discount_type, 40).toLowerCase();
    next.discount_type = PROMOTION_TYPE_ALLOWED.includes(type) ? type : 'percent';
  }
  if (payload.discount_value !== undefined) {
    next.discount_value = Math.max(0, Number(normalizePrice(payload.discount_value) || 0));
  }
  if (payload.usage_limit !== undefined) next.usage_limit = normalizePositiveInt(payload.usage_limit || 0, 0, 999999);
  if (payload.usage_count !== undefined) next.usage_count = normalizePositiveInt(payload.usage_count || 0, 0, 999999);
  if (payload.starts_at !== undefined) next.starts_at = parseIsoDate(payload.starts_at);
  if (payload.ends_at !== undefined) next.ends_at = parseIsoDate(payload.ends_at);
  if (payload.is_active !== undefined) next.is_active = toBool(payload.is_active, true);
  if (payload.target_scope !== undefined) next.target_scope = normalizeText(payload.target_scope, 80) || 'all';
  if (payload.target_value !== undefined) next.target_value = normalizeText(payload.target_value, 180) || null;
  return next;
}

function normalizeConnectionPayload(input, existing = {}) {
  const payload = sanitizeObjectShallow(input || {});
  const next = { ...existing };
  if (payload.provider !== undefined) next.provider = normalizeText(payload.provider, 80).toLowerCase();
  if (payload.display_name !== undefined) next.display_name = normalizeText(payload.display_name, 180);
  if (payload.is_active !== undefined) next.is_active = toBool(payload.is_active, true);
  if (payload.last_error !== undefined) next.last_error = normalizeText(payload.last_error, 800) || null;
  if (payload.last_sync_at !== undefined) next.last_sync_at = parseIsoDate(payload.last_sync_at);
  if (payload.credentials_json !== undefined && payload.credentials_json && typeof payload.credentials_json === 'object') {
    next.credentials_json = payload.credentials_json;
  }
  if (payload.api_key_hint !== undefined) next.api_key_hint = normalizeText(payload.api_key_hint, 40) || null;
  return next;
}

function normalizeTicketPayload(input, existing = {}) {
  const payload = sanitizeObjectShallow(input || {});
  const next = { ...existing };
  if (payload.customer_name !== undefined) next.customer_name = normalizeText(payload.customer_name, 180) || null;
  if (payload.customer_email !== undefined) next.customer_email = normalizeEmail(payload.customer_email);
  if (payload.subject !== undefined) next.subject = normalizeText(payload.subject, 220);
  if (payload.status !== undefined) {
    const status = normalizeText(payload.status, 40).toLowerCase();
    next.status = TICKET_STATUS_ALLOWED.includes(status) ? status : 'open';
  }
  if (payload.priority !== undefined) {
    const priority = normalizeText(payload.priority, 40).toLowerCase();
    next.priority = TICKET_PRIORITY_ALLOWED.includes(priority) ? priority : 'medium';
  }
  if (payload.category !== undefined) next.category = normalizeText(payload.category, 80) || null;
  if (payload.assigned_user_id !== undefined) next.assigned_user_id = normalizeText(payload.assigned_user_id, 120) || null;
  if (payload.ai_suggested_tags !== undefined) {
    next.ai_suggested_tags = Array.isArray(payload.ai_suggested_tags) ? payload.ai_suggested_tags.slice(0, 20) : [];
  }
  if (payload.metadata !== undefined && payload.metadata && typeof payload.metadata === 'object') {
    next.metadata = payload.metadata;
  }
  return next;
}

function normalizeSupportMessagePayload(input, existing = {}) {
  const payload = sanitizeObjectShallow(input || {});
  const next = { ...existing };
  if (payload.ticket_id !== undefined) next.ticket_id = normalizeText(payload.ticket_id, 120);
  if (payload.sender_type !== undefined) {
    const senderType = normalizeText(payload.sender_type, 40).toLowerCase();
    next.sender_type = SENDER_TYPE_ALLOWED.includes(senderType) ? senderType : 'agent';
  }
  if (payload.sender_name !== undefined) next.sender_name = normalizeText(payload.sender_name, 120) || null;
  if (payload.message !== undefined) next.message = normalizeText(payload.message, 10000);
  if (payload.ai_generated !== undefined) next.ai_generated = toBool(payload.ai_generated, false);
  if (payload.metadata !== undefined && payload.metadata && typeof payload.metadata === 'object') {
    next.metadata = payload.metadata;
  }
  return next;
}

function normalizeFinancialPayload(input, existing = {}) {
  const payload = sanitizeObjectShallow(input || {});
  const next = { ...existing };
  if (payload.transaction_type !== undefined) {
    const type = normalizeText(payload.transaction_type, 40).toLowerCase();
    next.transaction_type = FINANCIAL_TYPE_ALLOWED.includes(type) ? type : 'income';
  }
  if (payload.amount !== undefined) next.amount = Math.max(0, Number(normalizePrice(payload.amount) || 0));
  if (payload.currency !== undefined) next.currency = normalizeText(payload.currency, 10).toUpperCase() || 'TRY';
  if (payload.source !== undefined) next.source = normalizeText(payload.source, 80) || 'manual';
  if (payload.source_ref !== undefined) next.source_ref = normalizeText(payload.source_ref, 120) || null;
  if (payload.commission_rate !== undefined) next.commission_rate = normalizePrice(payload.commission_rate);
  if (payload.commission_amount !== undefined) next.commission_amount = normalizePrice(payload.commission_amount);
  if (payload.description !== undefined) next.description = normalizeText(payload.description, 1000) || null;
  if (payload.transaction_date !== undefined) next.transaction_date = parseIsoDate(payload.transaction_date);
  if (payload.metadata !== undefined && payload.metadata && typeof payload.metadata === 'object') {
    next.metadata = payload.metadata;
  }
  return next;
}

async function syncProductVariantsCache(config, productId) {
  const id = normalizeText(productId, 120);
  if (!id) return [];
  const variants = await restSelect(config, 'product_variants', {
    select: 'id,label,sku,color,size,price,stock,images,active,display_order',
    product_id: `eq.${id}`,
    order: 'display_order.asc,created_at.asc',
    limit: 1000,
  });
  try {
    await restUpdate(config, 'products', { id: `eq.${id}` }, { variants });
  } catch {
    // products.variants column may not be present in every installation.
  }
  return variants;
}

async function supabaseAdminCreateUser(config, payload) {
  const password = payload.password || generateTempPassword(14);
  const response = await fetch(`${config.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: buildServiceHeaders(config),
    body: JSON.stringify({
      email: payload.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.fullName || null,
      },
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error || 'Auth user create failed';
    const error = new Error(message);
    error.httpStatus = 400;
    error.code = 'AUTH_USER_CREATE_FAILED';
    throw error;
  }
  return {
    userId: normalizeText(data?.id || data?.user?.id, 120),
    generatedPassword: payload.password ? null : password,
  };
}

async function supabaseAdminUpdateUser(config, userId, patch) {
  const normalizedId = normalizeText(userId, 120);
  if (!normalizedId) return;
  const response = await fetch(`${config.url}/auth/v1/admin/users/${normalizedId}`, {
    method: 'PUT',
    headers: buildServiceHeaders(config),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.msg || data?.message || data?.error || 'Auth user update failed';
    const error = new Error(message);
    error.httpStatus = 400;
    error.code = 'AUTH_USER_UPDATE_FAILED';
    throw error;
  }
}

async function supabaseAdminListUsers(config, options = {}) {
  const page = normalizePositiveInt(options.page, 1, 999999);
  const perPage = normalizePositiveInt(options.perPage, 1000, 1000);
  const response = await fetch(`${config.url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
    method: 'GET',
    headers: buildServiceHeaders(config),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error || 'Auth user list failed';
    const error = new Error(message);
    error.httpStatus = 400;
    error.code = 'AUTH_USER_LIST_FAILED';
    throw error;
  }
  if (Array.isArray(data?.users)) return data.users;
  if (Array.isArray(data)) return data;
  return [];
}

async function supabaseAdminDeleteUser(config, userId) {
  const normalizedId = normalizeText(userId, 120);
  if (!normalizedId) return;
  const response = await fetch(`${config.url}/auth/v1/admin/users/${normalizedId}`, {
    method: 'DELETE',
    headers: buildServiceHeaders(config),
    body: JSON.stringify({ should_soft_delete: false }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.msg || data?.message || data?.error || 'Auth user delete failed';
    const error = new Error(message);
    error.httpStatus = response.status || 400;
    error.code = response.status === 404 ? 'AUTH_USER_NOT_FOUND' : 'AUTH_USER_DELETE_FAILED';
    throw error;
  }
}

async function handleMe(req, res, ctx) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  const { config, auth } = ctx;
  const ownerEmailsConfigured = getAdminOwnerEmails().length > 0;
  const canManageAdminUsers = isAdminOwner(auth);
  await restUpdate(config, 'user_profiles', { id: `eq.${auth.user.id}` }, { last_seen_at: new Date().toISOString() }).catch(() => null);
  return sendSuccess(res, {
    user: { id: auth.user.id, email: auth.user.email || null },
    profile: auth.profile,
    permissions: {
      can_manage_admin_users: canManageAdminUsers,
      owner_emails_configured: ownerEmailsConfigured,
    },
  });
}

async function handleUploadImage(req, res, ctx) {
  const { config, auth } = ctx;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  if (!hasRole(auth.profile.role, WRITER_ROLES)) return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const dataUrl = body.data_url;
  const productCode = normalizeStorageToken(body.product_code, 'product');
  const parsedImage = parseImageDataUrl(dataUrl);
  if (!parsedImage) {
    return sendError(res, 400, 'Gecersiz gorsel formati', 'VALIDATION_IMAGE_FORMAT');
  }
  if (parsedImage.binary.length > MAX_IMAGE_UPLOAD_BYTES) {
    return sendError(res, 400, 'Gorsel boyutu 6MB ustunde', 'VALIDATION_IMAGE_SIZE');
  }

  const ext = IMAGE_MIME_EXT[parsedImage.mime];
  const filenameToken = normalizeStorageToken(body.filename, 'upload');
  const randomToken = crypto.randomBytes(6).toString('hex');
  const objectPathRaw = `products/${productCode}/${Date.now()}-${filenameToken}-${randomToken}.${ext}`;
  const encodedPath = objectPathRaw
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const uploadUrl = `${config.url}/storage/v1/object/product-images/${encodedPath}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...buildServiceHeaders(config),
      'Content-Type': parsedImage.mime,
      'x-upsert': 'false',
    },
    body: parsedImage.binary,
  });

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => '');
    return sendError(res, 500, details || 'Gorsel yukleme basarisiz', 'UPLOAD_FAILED');
  }

  const publicUrl = `${config.url}/storage/v1/object/public/product-images/${encodedPath}`;
  await writeAuditLog(
    config,
    req,
    auth,
    'product.image_upload',
    { product_code: productCode, object_path: objectPathRaw },
    { entityType: 'product' }
  );
  return sendSuccess(res, { url: publicUrl });
}

async function handleProducts(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'products', {
      select: '*',
      order: 'display_order.asc,created_at.asc',
      limit: 3000,
    });
    const search = normalizeText(query.get('search'), 120).toLowerCase();
    const category = normalizeText(query.get('category'), 40).toLowerCase();
    const showArchived = query.get('archived') === 'true';

    rows = rows.filter((item) => {
      const isArchived = item.archived === true;
      return showArchived ? isArchived : !isArchived;
    });

    if (category && category !== 'all') {
      rows = rows.filter((item) => String(item.category || '') === category);
    }
    if (search) {
      rows = rows.filter((item) =>
        String(item.code || '').toLowerCase().includes(search) ||
        String(item.name || '').toLowerCase().includes(search)
      );
    }
    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 1000 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const rawPayload = sanitizeObjectShallow(body);
    const requiredRaw = validateRequiredFields(rawPayload, ['code', 'name', 'category', 'material', 'thickness', 'dims']);
    if (!requiredRaw.valid) {
      return sendError(res, 400, `Missing fields: ${requiredRaw.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }

    const normalizedCategory = normalizeText(rawPayload.category, 32).toLowerCase();
    if (!CATEGORY_ALLOWED.includes(normalizedCategory)) {
      return sendError(res, 400, 'Invalid category', 'VALIDATION_CATEGORY');
    }

    const payload = normalizeProductPayload(body);
    const required = validateRequiredFields(payload, ['code', 'name', 'category', 'material', 'thickness', 'dims']);
    if (!required.valid) {
      return sendError(res, 400, `Missing fields: ${required.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }
    let inserted;
    try {
      inserted = await insertProductWithFallback(config, payload);
    } catch (error) {
      const sqlState = error?.details?.code;
      const rawMessage = String(error?.message || '').toLowerCase();
      if (sqlState === '23505' || rawMessage.includes('duplicate key') || rawMessage.includes('unique constraint')) {
        return sendError(res, 409, `Bu ürün kodu zaten kullanımda: ${payload.code}`, 'PRODUCT_CODE_CONFLICT');
      }
      throw error;
    }
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await writeAuditLog(config, req, auth, 'product.create', { code: payload.code }, {
      entityType: 'product',
      entityId: row?.id || null,
    });
    return sendSuccess(res, row, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    const patch = normalizeProductPatch(body);
    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    await updateProductWithFallback(config, { id: `eq.${id}` }, patch);
    await writeAuditLog(config, req, auth, 'product.update', { id }, { entityType: 'product', entityId: id });
    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    await updateProductWithFallback(config, { id: `eq.${id}` }, { archived: true });
    await writeAuditLog(config, req, auth, 'product.delete', { id }, { entityType: 'product', entityId: id });
    return sendSuccess(res, { id });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleProductsBulk(req, res, ctx) {
  const { config, auth } = ctx;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  if (!hasRole(auth.profile.role, WRITER_ROLES)) return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const records = Array.isArray(body.records) ? body.records : [];
  if (!records.length) return sendError(res, 400, 'records is required', 'VALIDATION_REQUIRED_RECORDS');

  let inserted = 0;
  let updated = 0;
  for (const input of records) {
    const payload = normalizeProductPayload(input);
    if (!payload.code || !payload.name) continue;
    const existing = await restSelect(config, 'products', {
      select: 'id',
      code: `eq.${payload.code}`,
      limit: 1,
    });
    if (existing.length) {
      await updateProductWithFallback(config, { id: `eq.${existing[0].id}` }, payload);
      updated += 1;
    } else {
      await insertProductWithFallback(config, payload, { prefer: 'return=minimal' });
      inserted += 1;
    }
  }
  await writeAuditLog(config, req, auth, 'products.bulk_upsert', { inserted, updated }, { entityType: 'product' });
  return sendSuccess(res, { inserted, updated, total: inserted + updated });
}

async function handleProductsPriceBulk(req, res, ctx) {
  const { config, auth } = ctx;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  if (!hasRole(auth.profile.role, WRITER_ROLES)) return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  const modeRaw = normalizeText(body.mode || body.operation, 40).toLowerCase();
  const mode = ['set', 'increase_percent', 'increase_fixed'].includes(modeRaw) ? modeRaw : 'set';
  const amount = normalizePrice(body.amount);
  const category = normalizeText(body.category, 40).toLowerCase();
  const explicitIds = Array.isArray(body.product_ids)
    ? body.product_ids.map((value) => normalizeText(value, 120)).filter(Boolean)
    : [];
  const includeInactive = toBool(body.include_inactive, false);

  if (amount === null || !Number.isFinite(amount)) {
    return sendError(res, 400, 'amount is required', 'VALIDATION_REQUIRED_AMOUNT');
  }
  if (category && category !== 'all' && !CATEGORY_ALLOWED.includes(category)) {
    return sendError(res, 400, 'Invalid category', 'VALIDATION_CATEGORY');
  }

  let rows = await restSelect(config, 'products', {
    select: 'id,code,name,category,price,active',
    order: 'created_at.asc',
    limit: 5000,
  });

  if (category && category !== 'all') {
    rows = rows.filter((row) => String(row.category || '').toLowerCase() === category);
  }
  if (!includeInactive) {
    rows = rows.filter((row) => row.active !== false);
  }
  if (explicitIds.length) {
    const idSet = new Set(explicitIds);
    rows = rows.filter((row) => idSet.has(String(row.id || '')));
  }

  if (!rows.length) {
    return sendSuccess(res, { updated: 0, mode, amount, category: category || 'all', sample: [] });
  }

  const updatedProducts = [];
  for (const row of rows) {
    const currentPrice = Number(row.price || 0);
    if (!Number.isFinite(currentPrice) && mode !== 'set') continue;

    let nextPrice = currentPrice;
    if (mode === 'set') {
      nextPrice = Number(amount || 0);
    } else if (mode === 'increase_percent') {
      nextPrice = currentPrice + (currentPrice * Number(amount || 0)) / 100;
    } else if (mode === 'increase_fixed') {
      nextPrice = currentPrice + Number(amount || 0);
    }

    nextPrice = Math.round(Math.max(0, nextPrice) * 100) / 100;
    await updateProductWithFallback(config, { id: `eq.${row.id}` }, {
      price: nextPrice,
    });

    updatedProducts.push({
      id: row.id,
      code: row.code,
      from: Math.round(currentPrice * 100) / 100,
      to: nextPrice,
    });
  }

  await writeAuditLog(config, req, auth, 'products.bulk_price_update', {
    mode,
    amount,
    category: category || 'all',
    include_inactive: includeInactive,
    explicit_ids_count: explicitIds.length,
    updated: updatedProducts.length,
  }, { entityType: 'product' });

  return sendSuccess(res, {
    updated: updatedProducts.length,
    mode,
    amount,
    category: category || 'all',
    sample: updatedProducts.slice(0, 20),
  });
}

async function handleOrders(req, res, ctx) {
  const { config } = ctx;
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  const query = getUrl(req).searchParams;
  let rows = await restSelect(config, 'orders', {
    select: '*',
    order: 'created_at.desc',
    limit: 3000,
  });
  const status = normalizeText(query.get('status'), 40).toLowerCase();
  const workflowStatus = normalizeText(query.get('workflow_status'), 40).toLowerCase();
  const search = normalizeText(query.get('search'), 120).toLowerCase();
  if (status && status !== 'all') rows = rows.filter((item) => String(item.payment_status || '').toLowerCase() === status);
  if (workflowStatus && workflowStatus !== 'all') {
    rows = rows.filter((item) => String(item.status || '').toLowerCase() === workflowStatus);
  }
  if (search) {
    rows = rows.filter((item) =>
      String(item.order_no || '').toLowerCase().includes(search) ||
      String(item.email || '').toLowerCase().includes(search) ||
      String(item.customer_name || '').toLowerCase().includes(search)
    );
  }

  const includeItems = toBool(query.get('include_items'), true);
  if (includeItems && rows.length) {
    const orderIds = rows.map((row) => row.id).filter(Boolean);
    const inFilter = buildInFilter(orderIds);
    if (inFilter) {
      const orderItems = await safeSelect(config, 'order_items', {
        select: '*',
        order_id: inFilter,
        order: 'created_at.asc',
        limit: 5000,
      });
      const itemsByOrder = new Map();
      orderItems.forEach((item) => {
        const key = String(item.order_id || '');
        if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
        itemsByOrder.get(key).push(item);
      });
      rows = rows.map((row) => ({
        ...row,
        items: itemsByOrder.get(String(row.id || '')) || [],
      }));
    }
  }

  if (rows.length) {
    const orderIds = rows.map((row) => normalizeText(row?.id, 120)).filter(Boolean);
    const inFilter = buildInFilter(orderIds);
    if (inFilter) {
      const shippedMailLogs = await safeSelect(config, 'audit_logs', {
        select: 'entity_id,action,created_at',
        entity_id: inFilter,
        order: 'created_at.desc',
        limit: 5000,
      }, []);

      const latestMailSentByOrderId = new Map();
      (shippedMailLogs || []).forEach((row) => {
        const action = normalizeText(row?.action, 120).toLowerCase();
        if (action !== 'email.shipped.manual.sent') return;
        const entityId = normalizeText(row?.entity_id, 120);
        const createdAt = normalizeText(row?.created_at, 80) || null;
        if (!entityId || !createdAt) return;
        if (!latestMailSentByOrderId.has(entityId)) {
          latestMailSentByOrderId.set(entityId, createdAt);
        }
      });

      rows = rows.map((row) => {
        const orderId = normalizeText(row?.id, 120);
        const sentAt = orderId ? latestMailSentByOrderId.get(orderId) || null : null;
        return {
          ...row,
          shipped_email_sent_at: sentAt,
          shipped_email_sent: Boolean(sentAt),
        };
      });
    }
  }

  const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 1000 });
  const paged = paginateRows(rows, pagination);
  return sendSuccess(res, paged.items, 200, paged.meta);
}

async function handleOrderStatus(req, res, ctx) {
  const { config, auth } = ctx;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  if (!hasRole(auth.profile.role, WRITER_ROLES)) return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const paymentStatus = normalizeText(body.status, 24).toLowerCase();
  const workflowStatus = normalizeText(body.workflow_status, 24).toLowerCase();
  const orderIds = Array.isArray(body.order_ids)
    ? body.order_ids.map((value) => normalizeText(value, 120)).filter(Boolean)
    : [];
  if (!orderIds.length) return sendError(res, 400, 'order_ids required', 'VALIDATION_ORDER_IDS');
  if (!paymentStatus && !workflowStatus) {
    return sendError(res, 400, 'status or workflow_status required', 'VALIDATION_STATUS_REQUIRED');
  }
  if (paymentStatus && !PAYMENT_STATUS_ALLOWED.includes(paymentStatus)) {
    return sendError(res, 400, 'Invalid payment status', 'VALIDATION_STATUS');
  }
  if (workflowStatus && !ORDER_STATUS_ALLOWED.includes(workflowStatus)) {
    return sendError(res, 400, 'Invalid workflow status', 'VALIDATION_WORKFLOW_STATUS');
  }

  const patch = {};
  if (paymentStatus) {
    patch.payment_status = paymentStatus;
    patch.paytr_status = `manual_${paymentStatus}`;
    patch.failed_reason_code = paymentStatus === 'failed' ? 'MANUAL' : null;
    patch.failed_reason_msg = paymentStatus === 'failed' ? 'Admin panelinden manuel guncellendi.' : null;
    patch.paid_at = paymentStatus === 'paid' ? new Date().toISOString() : null;
  }
  if (workflowStatus) {
    patch.status = workflowStatus;
    if (workflowStatus === 'shipped') patch.shipped_at = new Date().toISOString();
  }

  const idsQuery = buildInFilter(orderIds);
  if (workflowStatus === 'shipped') {
    const paymentRows = await safeSelect(config, 'orders', {
      select: 'id,order_no,payment_status',
      id: idsQuery,
      limit: 5000,
    }, []);
    const notPaidRows = paymentRows.filter((row) => !isOrderPaymentApproved(row));
    if (notPaidRows.length) {
      const sampleOrderNo = normalizeText(notPaidRows[0]?.order_no, 120) || null;
      return sendError(
        res,
        400,
        sampleOrderNo
          ? `Payment approval required before shipping (${sampleOrderNo})`
          : 'Payment approval required before shipping',
        'ORDER_PAYMENT_REQUIRED_FOR_SHIPPING'
      );
    }
  }

  await restUpdate(config, 'orders', { id: idsQuery }, patch);

  const automation = await loadEmailAutomationSettings(config).catch(() => null);
  const autoOrderConfirmation = automation ? automation.auto_order_confirmation !== false : true;
  const autoDelivered = automation ? automation.auto_delivered !== false : true;
  const autoInvoiceReady = automation ? automation.auto_invoice_ready !== false : true;

  const shouldCheckOrderConfirmation = paymentStatus === 'paid' && autoOrderConfirmation;
  const shouldCheckInvoiceReady = paymentStatus === 'paid' && autoInvoiceReady;
  const shouldCheckDelivered = workflowStatus === 'delivered' && autoDelivered;

  if (shouldCheckOrderConfirmation || shouldCheckInvoiceReady || shouldCheckDelivered) {
    const updatedRows = await safeSelect(config, 'orders', {
      select: 'id,order_no,customer_name,email,payment_status,status,total',
      id: idsQuery,
      limit: 5000,
    }, []);

    const updatedOrderIds = updatedRows
      .map((row) => normalizeText(row?.id, 120))
      .filter(Boolean);

    if (updatedOrderIds.length) {
      const sentLogs = await safeSelect(config, 'audit_logs', {
        select: 'entity_id,action',
        entity_id: buildInFilter(updatedOrderIds),
        action: 'in.("email.order_confirmation.manual.sent","email.order_confirmation.auto.sent","email.delivered.manual.sent","email.delivered.auto.sent","email.invoice_ready.sent")',
        created_at: `gte.${toIsoDaysAgo(365)}`,
        limit: 5000,
      }, []);

      const sentByOrderId = new Map();
      (sentLogs || []).forEach((row) => {
        const orderId = normalizeText(row?.entity_id, 120);
        const action = normalizeText(row?.action, 120);
        if (!orderId || !action) return;
        if (!sentByOrderId.has(orderId)) sentByOrderId.set(orderId, new Set());
        sentByOrderId.get(orderId).add(action);
      });

      for (const order of updatedRows) {
        const orderId = normalizeText(order?.id, 120);
        const orderEmail = normalizeEmail(order?.email);
        if (!orderId || !orderEmail) continue;
        const sentActions = sentByOrderId.get(orderId) || new Set();

        if (
          shouldCheckOrderConfirmation &&
          !sentActions.has('email.order_confirmation.manual.sent') &&
          !sentActions.has('email.order_confirmation.auto.sent')
        ) {
          const sent = await sendOrderConfirmationEmailIfPossible(order);
          if (sent) {
            await restInsert(config, 'audit_logs', {
              actor_user_id: auth.user?.id || null,
              actor_email: normalizeText(auth.user?.email, 180) || null,
              actor_role: 'system',
              action: 'email.order_confirmation.auto.sent',
              entity_type: 'order',
              entity_id: orderId,
              metadata: {
                order_no: normalizeText(order?.order_no, 120) || null,
                email: orderEmail,
              },
              request_path: req.url,
              request_method: req.method,
            }, { prefer: 'return=minimal' }).catch(() => null);
            sentActions.add('email.order_confirmation.auto.sent');
          }
        }

        if (
          shouldCheckInvoiceReady &&
          !sentActions.has('email.invoice_ready.sent')
        ) {
          const sent = await sendInvoiceReadyEmailIfPossible(order);
          if (sent) {
            await restInsert(config, 'audit_logs', {
              actor_user_id: auth.user?.id || null,
              actor_email: normalizeText(auth.user?.email, 180) || null,
              actor_role: 'system',
              action: 'email.invoice_ready.sent',
              entity_type: 'order',
              entity_id: orderId,
              metadata: {
                order_no: normalizeText(order?.order_no, 120) || null,
                email: orderEmail,
                trigger: 'order.status.bulk_update',
              },
              request_path: req.url,
              request_method: req.method,
            }, { prefer: 'return=minimal' }).catch(() => null);
            sentActions.add('email.invoice_ready.sent');
          }
        }

        if (
          shouldCheckDelivered &&
          !sentActions.has('email.delivered.manual.sent') &&
          !sentActions.has('email.delivered.auto.sent')
        ) {
          const sent = await sendOrderDeliveredEmailIfPossible(order);
          if (sent) {
            await restInsert(config, 'audit_logs', {
              actor_user_id: auth.user?.id || null,
              actor_email: normalizeText(auth.user?.email, 180) || null,
              actor_role: 'system',
              action: 'email.delivered.auto.sent',
              entity_type: 'order',
              entity_id: orderId,
              metadata: {
                order_no: normalizeText(order?.order_no, 120) || null,
                email: orderEmail,
              },
              request_path: req.url,
              request_method: req.method,
            }, { prefer: 'return=minimal' }).catch(() => null);
            sentActions.add('email.delivered.auto.sent');
          }
        }
      }
    }
  }

  await writeAuditLog(config, req, auth, 'order.status.bulk_update', {
    payment_status: paymentStatus || null,
    workflow_status: workflowStatus || null,
    count: orderIds.length,
  }, { entityType: 'order' });
  return sendSuccess(res, { updated: orderIds.length, ...patch });
}

async function handleProductVariants(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'product_variants', {
      select: '*',
      order: 'display_order.asc,created_at.asc',
      limit: 5000,
    });
    const productId = normalizeText(query.get('product_id'), 120);
    const search = normalizeText(query.get('search'), 120).toLowerCase();
    if (productId) rows = rows.filter((row) => String(row.product_id || '') === productId);
    if (search) {
      rows = rows.filter((row) =>
        String(row.label || '').toLowerCase().includes(search) ||
        String(row.sku || '').toLowerCase().includes(search) ||
        String(row.color || '').toLowerCase().includes(search) ||
        String(row.size || '').toLowerCase().includes(search)
      );
    }
    const pagination = parsePagination(query, { pageSize: 50, maxPageSize: 1000 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const payload = normalizeVariantPayload(body);
    const required = validateRequiredFields(payload, ['product_id', 'label']);
    if (!required.valid) {
      return sendError(res, 400, `Missing fields: ${required.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }
    const inserted = await restInsert(config, 'product_variants', payload);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await syncProductVariantsCache(config, payload.product_id);
    await writeAuditLog(config, req, auth, 'variant.create', { product_id: payload.product_id }, {
      entityType: 'product_variant',
      entityId: row?.id || null,
    });
    return sendSuccess(res, row, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    const patch = normalizeVariantPatch(body);
    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    await restUpdate(config, 'product_variants', { id: `eq.${id}` }, patch);
    const row = await restSelect(config, 'product_variants', {
      select: 'id,product_id',
      id: `eq.${id}`,
      limit: 1,
    });
    if (row[0]?.product_id) await syncProductVariantsCache(config, row[0].product_id);
    await writeAuditLog(config, req, auth, 'variant.update', { id }, { entityType: 'product_variant', entityId: id });
    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    const row = await restSelect(config, 'product_variants', {
      select: 'id,product_id',
      id: `eq.${id}`,
      limit: 1,
    });
    await restDelete(config, 'product_variants', { id: `eq.${id}` });
    if (row[0]?.product_id) await syncProductVariantsCache(config, row[0].product_id);
    await writeAuditLog(config, req, auth, 'variant.delete', { id }, { entityType: 'product_variant', entityId: id });
    return sendSuccess(res, { id });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleAnalytics(req, res, ctx) {
  const { config } = ctx;
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

  const query = getUrl(req).searchParams;
  const range = buildDateRange(query);
  const [orders, users, products, tickets, auditLogs] = await Promise.all([
    safeSelect(config, 'orders', { select: 'id,total,payment_status,status,created_at', order: 'created_at.desc', limit: 5000 }),
    safeSelect(config, 'user_profiles', { select: 'id,is_active,subscription_tier,created_at', limit: 5000 }),
    safeSelect(config, 'products', { select: 'id,category,stock_quantity,stock_threshold,active', limit: 5000 }),
    safeSelect(config, 'support_tickets', { select: 'id,status,priority,created_at', limit: 5000 }),
    safeSelect(config, 'audit_logs', { select: 'action,request_path,metadata,created_at,ip_address,user_agent', order: 'created_at.desc', limit: 10000 }),
  ]);

  const scopedOrders = orders.filter((row) => isWithinRange(row.created_at, range.startIso, range.endIso));
  const scopedUsers = users.filter((row) => isWithinRange(row.created_at, range.startIso, range.endIso));
  const paidOrders = scopedOrders.filter((row) => String(row.payment_status || '').toLowerCase() === 'paid');

  const dailyMap = new Map();
  scopedOrders.forEach((row) => {
    const date = new Date(row.created_at || '');
    if (Number.isNaN(date.getTime())) return;
    const key = date.toISOString().slice(0, 10);
    if (!dailyMap.has(key)) dailyMap.set(key, { date: key, orders: 0, paid_revenue: 0 });
    const bucket = dailyMap.get(key);
    bucket.orders += 1;
    if (String(row.payment_status || '').toLowerCase() === 'paid') {
      bucket.paid_revenue += Number(row.total || 0);
    }
  });
  const dailySeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const statusCounts = scopedOrders.reduce((acc, row) => {
    const key = normalizeText(row.status || 'pending', 40).toLowerCase() || 'pending';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const paymentCounts = scopedOrders.reduce((acc, row) => {
    const key = normalizeText(row.payment_status || 'pending', 40).toLowerCase() || 'pending';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const categoryCounts = products.reduce((acc, row) => {
    const key = normalizeText(row.category || 'unknown', 40).toLowerCase() || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const lowStockCount = products.filter((row) => {
    const threshold = Number(row.stock_threshold || 0);
    const quantity = Number(row.stock_quantity || 0);
    return Number.isFinite(threshold) && Number.isFinite(quantity) && quantity <= threshold;
  }).length;

  const paidRevenue = paidOrders.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const conversionRate = scopedOrders.length
    ? Math.round((paidOrders.length / scopedOrders.length) * 10000) / 100
    : 0;
  const pendingOrders = orders.filter((row) => String(row.status || '').toLowerCase() === 'pending').length;
  const outOfStockCount = products.filter((row) => Number(row.stock_quantity || 0) <= 0).length;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const nowIso = new Date().toISOString();
  const dailyRevenue = orders
    .filter((row) => String(row.payment_status || '').toLowerCase() === 'paid')
    .filter((row) => isWithinRange(row.created_at, startOfToday.toISOString(), nowIso))
    .reduce((sum, row) => sum + Number(row.total || 0), 0);

  const scopedTraffic = auditLogs
    .filter((row) => String(row.action || '').startsWith('traffic.'))
    .filter((row) => isWithinRange(row.created_at, range.startIso, range.endIso));

  const sourceCounts = {};
  const pageCounts = {};
  const clickCounts = {};
  const countryCounts = {};
  const cityCounts = {};
  const productClickCounts = {};
  const abandonedBySession = {};
  const checkoutSessions = new Set();
  const recentVisitors = [];
  const visitorSet = new Set();
  let pageViewCount = 0;
  let clickCount = 0;

  const resolveSource = (metadata) => {
    const utmSource = normalizeText(metadata?.utm_source, 120).toLowerCase();
    if (utmSource) return utmSource;

    const referrer = normalizeText(metadata?.referrer, 500);
    if (!referrer) return 'direct';
    try {
      return new URL(referrer).hostname.replace(/^www\./, '') || 'direct';
    } catch {
      return referrer.slice(0, 80).toLowerCase();
    }
  };

  const detectDevice = (userAgent) => {
    const ua = String(userAgent || '').toLowerCase();
    const mobilePatterns = /android|iphone|ipad|mobile|touch|webos|blackberry|windows phone|opera mini/;
    return mobilePatterns.test(ua) ? 'mobile' : 'desktop';
  };

  const countryCache = {};

  const getCountryFromIP = (ip) => {
    if (!ip || ip === 'unknown') return 'unknown';
    if (countryCache[ip]) return countryCache[ip];
    // In production with X-Vercel-IP-Country header, country already in metadata
    countryCache[ip] = 'unknown';
    return 'unknown';
  };

  const getProductCodeFromHref = (value) => {
    const href = normalizeText(value, 1000);
    if (!href) return '';
    try {
      const parsed = new URL(href, 'https://blaene.com.tr');
      return normalizeText(parsed.searchParams.get('code'), 80).toUpperCase();
    } catch {
      const query = href.split('?')[1] || '';
      const params = new URLSearchParams(query);
      return normalizeText(params.get('code'), 80).toUpperCase();
    }
  };

  scopedTraffic.forEach((row) => {
    const metadata = row && typeof row.metadata === 'object' && row.metadata ? row.metadata : {};
    const action = normalizeText(row.action, 80).toLowerCase();
    const eventType = action.startsWith('traffic.') ? action.slice('traffic.'.length) : 'custom';
    const source = resolveSource(metadata);
    const pagePath = normalizeText(metadata.page_path || row.request_path || '/', 220) || '/';
    const visitorKey = normalizeText(metadata.session_id, 160) || normalizeText(row.ip_address, 160) || 'unknown';
    const device = detectDevice(row.user_agent);
    const country = normalizeText(metadata.country, 80) || getCountryFromIP(row.ip_address);
    visitorSet.add(visitorKey);

    if (eventType === 'page_view') {
      pageViewCount += 1;
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      pageCounts[pagePath] = (pageCounts[pagePath] || 0) + 1;
      if (String(pagePath || '').toLowerCase().includes('checkout')) {
        checkoutSessions.add(visitorKey);
      }
      const countryKey = country && country !== 'unknown' ? country : 'Bilinmeyen';
      countryCounts[countryKey] = (countryCounts[countryKey] || 0) + 1;
      const city = normalizeText(metadata.city, 80) || 'unknown';
      const cityKey = city && city !== 'unknown' ? city : 'Bilinmeyen';
      cityCounts[cityKey] = (cityCounts[cityKey] || 0) + 1;
      recentVisitors.push({
        at: row.created_at || null,
        source,
        page: pagePath,
        ip: normalizeText(row.ip_address, 160) || null,
        referrer: normalizeText(metadata.referrer, 500) || null,
        device,
        country: country && country !== 'unknown' ? country : null,
        city: city && city !== 'unknown' ? city : null,
      });
      return;
    }

    if (eventType === 'click') {
      clickCount += 1;
      const trackKind = normalizeText(metadata.track_kind, 60).toLowerCase();
      const productCode =
        normalizeText(metadata.product_code, 80).toUpperCase() ||
        getProductCodeFromHref(metadata.element_href) ||
        getProductCodeFromHref(metadata.page_url);
      const productName = normalizeText(metadata.product_name, 160);
      const clickLabel =
        normalizeText(metadata.element_text, 140) ||
        normalizeText(metadata.element_href, 220) ||
        normalizeText(metadata.element_tag, 40) ||
        'unknown';
      clickCounts[clickLabel] = clickCounts[clickLabel] || { count: 0, product_id: null };
      if (!clickCounts[clickLabel].product_id && productCode) {
        clickCounts[clickLabel].product_id = productCode;
      }
      clickCounts[clickLabel].count += 1;

      if (productCode) {
        productClickCounts[productCode] = productClickCounts[productCode] || {
          count: 0,
          product_name: productName || null,
        };
        productClickCounts[productCode].count += 1;
        if (!productClickCounts[productCode].product_name && productName) {
          productClickCounts[productCode].product_name = productName;
        }
      }

      const addToCartSignal = trackKind === 'add_to_cart' || clickLabel.toLowerCase().includes('sepete ekle');
      if (addToCartSignal && productCode) {
        const existing = abandonedBySession[visitorKey] || { last_at: null, products: {} };
        existing.last_at = row.created_at || existing.last_at;
        existing.products[productCode] = existing.products[productCode] || {
          product_code: productCode,
          product_name: productName || productCode,
          count: 0,
        };
        existing.products[productCode].count += 1;
        if (!existing.products[productCode].product_name && productName) {
          existing.products[productCode].product_name = productName;
        }
        abandonedBySession[visitorKey] = existing;
      }
    }
  });

  const productCounts = {};
  Object.entries(productClickCounts).forEach(([productCode, value]) => {
    productCounts[productCode] = Number(value && value.count || 0);
  });

  const abandonedCustomers = Object.entries(abandonedBySession)
    .filter(([sessionId]) => !checkoutSessions.has(sessionId))
    .map(([sessionId, entry]) => {
      const productsBySession = Object.values(entry.products || {});
      productsBySession.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
      const topProduct = productsBySession[0] || null;
      return {
        session_id: sessionId,
        customer_name: `Ziyaretci ${String(sessionId || '').slice(-6) || 'Anonim'}`,
        customer_email: null,
        product_code: topProduct ? String(topProduct.product_code || '') : null,
        product_name: topProduct ? String(topProduct.product_name || topProduct.product_code || '') : null,
        count: topProduct ? Number(topProduct.count || 0) : 0,
        last_at: entry.last_at || null,
      };
    })
    .sort((a, b) => String(b.last_at || '').localeCompare(String(a.last_at || '')))
    .slice(0, 30);

  const sortObjectEntries = (obj, keyLabel, includeProductId = false, includeProductName = false) => {
    return Object.entries(obj)
      .map(([key, value]) => {
        const result = { [keyLabel]: key, count: Number(typeof value === 'number' ? value : value?.count || 0) };
        if (includeProductId && typeof value === 'object' && value?.product_id) {
          result.product_id = value.product_id;
        }
        if (includeProductName && typeof value === 'object' && value?.product_name) {
          result.product_name = value.product_name;
        }
        return result;
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  };

  return sendSuccess(res, {
    range,
    metrics: {
      paid_revenue: Math.round(paidRevenue * 100) / 100,
      daily_revenue: Math.round(dailyRevenue * 100) / 100,
      total_orders: scopedOrders.length,
      new_orders: scopedOrders.length,
      paid_orders: paidOrders.length,
      average_order_value: paidOrders.length ? Math.round((paidRevenue / paidOrders.length) * 100) / 100 : 0,
      pending_orders: pendingOrders,
      active_users: users.filter((item) => item.is_active !== false).length,
      scoped_new_users: scopedUsers.length,
      conversion_rate: conversionRate,
      low_stock_products: lowStockCount,
      out_of_stock_products: outOfStockCount,
      open_support_tickets: tickets.filter((item) => String(item.status || '').toLowerCase() !== 'closed').length,
      traffic_page_views: pageViewCount,
      traffic_clicks: clickCount,
      traffic_unique_visitors: visitorSet.size,
    },
    charts: {
      daily_sales: dailySeries,
      payment_distribution: paymentCounts,
      order_status_distribution: statusCounts,
      product_category_distribution: categoryCounts,
    },
    traffic: {
      total_views: pageViewCount,
      total_clicks: clickCount,
      unique_visitors: visitorSet.size,
      top_sources: sortObjectEntries(sourceCounts, 'source'),
      top_pages: sortObjectEntries(pageCounts, 'page'),
      top_products: sortObjectEntries(productCounts, 'product_id'),
      top_product_clicks: sortObjectEntries(productClickCounts, 'product_id', false, true),
      top_clicks: sortObjectEntries(clickCounts, 'label', true),
      abandoned_customers: abandonedCustomers,
      visitor_by_country: sortObjectEntries(countryCounts, 'country'),
      visitor_by_city: sortObjectEntries(cityCounts, 'city'),
      recent_visitors: recentVisitors
        .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
        .slice(0, 20),
    },
  });
}

function normalizePendingShipmentDays(input, fallback = 30) {
  const raw = normalizeText(input, 20).toLowerCase();
  if (!raw) return fallback;
  if (raw === 'all' || raw === '0') return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return fallback;
  return Math.min(parsed, 3650);
}

function normalizePendingShipmentLimit(input, fallback = 40) {
  return normalizePositiveInt(input, fallback, 200);
}

async function buildPendingShipmentCandidates(config, options = {}) {
  const days = normalizePendingShipmentDays(options.pending_days, 30);
  const limit = normalizePendingShipmentLimit(options.pending_limit, 40);
  const startIso = days > 0 ? toIsoDaysAgo(days) : null;

  const rows = await safeSelect(config, 'orders', {
    select: 'id,order_no,customer_name,email,status,payment_status,total,currency,paid_at,created_at,shipped_at',
    order: 'created_at.desc',
    limit: 5000,
  }, []);

  const nowTs = Date.now();
  const pendingRows = (rows || [])
    .filter((row) => {
      const paymentStatus = normalizeText(row?.payment_status, 40).toLowerCase();
      if (paymentStatus !== 'paid') return false;

      const status = normalizeText(row?.status, 40).toLowerCase();
      if (['shipped', 'delivered', 'cancelled'].includes(status)) return false;

      const shippedAt = normalizeText(row?.shipped_at, 80);
      if (shippedAt) return false;

      if (!startIso) return true;
      const compareDate = normalizeText(row?.paid_at, 80) || normalizeText(row?.created_at, 80);
      return compareDate ? isWithinRange(compareDate, startIso, null) : false;
    })
    .map((row) => {
      const paidAt = normalizeText(row?.paid_at, 80) || null;
      const createdAt = normalizeText(row?.created_at, 80) || null;
      const compareDate = paidAt || createdAt || null;
      let ageDays = null;
      if (compareDate) {
        const ts = Date.parse(compareDate);
        if (!Number.isNaN(ts)) ageDays = Math.max(0, Math.floor((nowTs - ts) / (24 * 60 * 60 * 1000)));
      }
      return {
        order_id: normalizeText(row?.id, 120) || null,
        order_no: normalizeText(row?.order_no, 120) || null,
        customer_name: normalizeText(row?.customer_name, 180) || null,
        email: normalizeEmail(row?.email) || null,
        status: normalizeText(row?.status, 40).toLowerCase() || null,
        payment_status: normalizeText(row?.payment_status, 40).toLowerCase() || null,
        total: Number(row?.total || 0),
        currency: normalizeText(row?.currency, 12) || 'TRY',
        paid_at: paidAt,
        created_at: createdAt,
        age_days: ageDays,
      };
    })
    .sort((a, b) => String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || '')));

  return {
    days_filter: days === 0 ? 'all' : String(days),
    available_day_filters: ['all', '7', '14', '30', '90'],
    total: pendingRows.length,
    limit,
    items: pendingRows.slice(0, limit),
  };
}

async function buildMarketingEmailStatus(config, presetEnvStatus = null, options = {}) {
  const baseEnvStatus = presetEnvStatus || (
    typeof marketingCronHandler.getEnvStatus === 'function'
      ? marketingCronHandler.getEnvStatus()
      : {
        resend_configured: Boolean(process.env.RESEND_API_KEY),
        cron_secret_configured: Boolean(normalizeText(process.env.MARKETING_CRON_SECRET, 300) || normalizeText(process.env.CRON_SECRET, 300)),
      }
  );
  const automationSettings = await loadEmailAutomationSettings(config).catch(() => null);
  const envStatus = {
    ...baseEnvStatus,
    automation: automationSettings || null,
  };

  const logs = await safeSelect(config, 'audit_logs', {
    select: 'action,created_at',
    order: 'created_at.desc',
    limit: 5000,
  }, []);

  const actionKeys = {
    abandoned_cart: 'email.cart_abandoned.sent',
    product_intro: 'email.product_intro.sent',
    shipped_manual: 'email.shipped.manual.sent',
    review_request: 'email.review_request.sent',
    delivered_manual: ['email.delivered.manual.sent', 'email.delivered.auto.sent'],
    order_confirmation_manual: ['email.order_confirmation.manual.sent', 'email.order_confirmation.auto.sent'],
    coupon_broadcast: 'email.coupon_broadcast.sent',
    stock_back_in: 'email.stock_back_in.sent',
    price_drop: 'email.price_drop.sent',
    invoice_ready: 'email.invoice_ready.sent',
    support_update: 'email.support_ticket_update.sent',
  };

  const since7Days = toIsoDaysAgo(7);
  const summary = {
    last_7_days: {
      abandoned_cart: 0,
      product_intro: 0,
      shipped_manual: 0,
      review_request: 0,
      delivered_manual: 0,
      order_confirmation_manual: 0,
      coupon_broadcast: 0,
      stock_back_in: 0,
      price_drop: 0,
      invoice_ready: 0,
      support_update: 0,
    },
    all_time: {
      abandoned_cart: 0,
      product_intro: 0,
      shipped_manual: 0,
      review_request: 0,
      delivered_manual: 0,
      order_confirmation_manual: 0,
      coupon_broadcast: 0,
      stock_back_in: 0,
      price_drop: 0,
      invoice_ready: 0,
      support_update: 0,
    },
    latest: {
      abandoned_cart: null,
      product_intro: null,
      shipped_manual: null,
      review_request: null,
      delivered_manual: null,
      order_confirmation_manual: null,
      coupon_broadcast: null,
      stock_back_in: null,
      price_drop: null,
      invoice_ready: null,
      support_update: null,
    },
  };

  (logs || []).forEach((row) => {
    const action = normalizeText(row?.action, 120);
    const createdAt = normalizeText(row?.created_at, 80) || null;
    const inLast7Days = createdAt ? isWithinRange(createdAt, since7Days, null) : false;

    Object.entries(actionKeys).forEach(([key, actionValue]) => {
      const actions = Array.isArray(actionValue) ? actionValue : [actionValue];
      if (!actions.includes(action)) return;
      summary.all_time[key] += 1;
      if (inLast7Days) summary.last_7_days[key] += 1;
      if (!summary.latest[key] && createdAt) {
        summary.latest[key] = createdAt;
      }
    });
  });

  const pendingShipment = await buildPendingShipmentCandidates(config, options);
  return { env: envStatus, summary, pending_shipment: pendingShipment };
}

async function selectOrderForMarketingEmail(config, orderId, orderNo) {
  const rows = await restSelect(config, 'orders', {
    select: 'id,order_no,customer_name,email,status,payment_status,total,tracking_code,shipping_provider',
    ...(orderId ? { id: `eq.${orderId}` } : { order_no: `eq.${orderNo}` }),
    limit: 1,
  });
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
}

async function sendOrderMailByAction(action, order) {
  if (action === 'send_shipped') {
    return sendOrderShippedEmailIfPossible(order);
  }
  if (action === 'send_order_confirmation') {
    return sendOrderConfirmationEmailIfPossible(order);
  }
  if (action === 'send_delivered') {
    return sendOrderDeliveredEmailIfPossible(order);
  }
  if (action === 'send_review_request') {
    return sendOrderReviewRequestEmailIfPossible(order);
  }
  return false;
}

async function handleMarketingEmails(req, res, ctx) {
  const { config, auth } = ctx;
  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const envStatus = typeof marketingCronHandler.getEnvStatus === 'function'
    ? marketingCronHandler.getEnvStatus()
    : {
      resend_configured: Boolean(process.env.RESEND_API_KEY),
      cron_secret_configured: Boolean(normalizeText(process.env.MARKETING_CRON_SECRET, 300) || normalizeText(process.env.CRON_SECRET, 300)),
    };
  const query = getUrl(req).searchParams;
  const buildStatusOptions = (input = {}) => ({
    pending_days: input?.pending_days ?? query.get('pending_days'),
    pending_limit: input?.pending_limit ?? query.get('pending_limit'),
  });

  if (req.method === 'GET') {
    const status = await buildMarketingEmailStatus(config, envStatus, buildStatusOptions());
    return sendSuccess(res, status);
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const action = normalizeText(body.action, 60).toLowerCase();
  if (!action) {
    return sendError(res, 400, 'action is required', 'VALIDATION_REQUIRED_ACTION');
  }

  const runner = typeof marketingCronHandler.runByMode === 'function'
    ? marketingCronHandler.runByMode
    : null;

  if (action === 'send_abandoned' || action === 'send_product_intro' || action === 'send_all' || action === 'send_review_flow') {
    if (!envStatus.resend_configured) {
      return sendError(res, 400, 'RESEND_API_KEY is not configured', 'EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    if (!runner) {
      return sendError(res, 500, 'Marketing runner unavailable', 'MARKETING_RUNNER_UNAVAILABLE');
    }
    const mode = action === 'send_abandoned'
      ? 'abandoned'
      : (action === 'send_product_intro' ? 'product-intro' : (action === 'send_review_flow' ? 'review-request' : 'all'));
    const result = await runner(config, mode);
    await writeAuditLog(config, req, auth, 'marketing.email.trigger', {
      action,
      mode,
      result,
    }, { entityType: 'marketing_email' });

    const status = await buildMarketingEmailStatus(config, envStatus, buildStatusOptions(body));
    return sendSuccess(res, {
      action,
      mode,
      executed_at: new Date().toISOString(),
      result,
      status,
    });
  }

  if (action === 'send_coupon_broadcast') {
    if (!envStatus.resend_configured) {
      return sendError(res, 400, 'RESEND_API_KEY is not configured', 'EMAIL_PROVIDER_NOT_CONFIGURED');
    }

    const couponCode = normalizeText(body.coupon_code, 80).toUpperCase();
    if (!couponCode) {
      return sendError(res, 400, 'coupon_code is required', 'VALIDATION_REQUIRED_COUPON_CODE');
    }

    const couponTitle = normalizeText(body.coupon_title, 180) || 'Size ozel indirim';
    const discountText = normalizeText(body.discount_text, 240) || null;
    const batchLimit = normalizePositiveInt(body.batch_limit, 300, 2000);

    const recipients = await safeSelect(config, 'customer_profiles', {
      select: 'email,full_name,consent_marketing_email',
      consent_marketing_email: 'eq.true',
      email: 'not.is.null',
      limit: 5000,
    }, []);

    const recentLogs = await safeSelect(config, 'audit_logs', {
      select: 'actor_email,metadata,action,created_at',
      action: 'eq.email.coupon_broadcast.sent',
      created_at: `gte.${toIsoDaysAgo(7)}`,
      limit: 5000,
    }, []);

    const recentlySent = new Set();
    (recentLogs || []).forEach((row) => {
      const email = normalizeEmail(row?.actor_email);
      const logCoupon = normalizeText(row?.metadata?.coupon_code, 80).toUpperCase();
      if (!email || !logCoupon) return;
      recentlySent.add(`${email}|${logCoupon}`);
    });

    const queue = (recipients || [])
      .map((row) => ({
        email: normalizeEmail(row?.email),
        full_name: normalizeText(row?.full_name, 180) || '',
      }))
      .filter((row) => row.email && !recentlySent.has(`${row.email}|${couponCode}`))
      .slice(0, batchLimit);

    let sent = 0;
    for (const row of queue) {
      try {
        await sendEmail({
          to: row.email,
          subject: `Size ozel indirim kodu: ${couponCode}`,
          html: couponBroadcastTemplate({
            customerName: row.full_name,
            couponCode,
            couponTitle,
            discountText,
          }),
        });
        sent += 1;

        await restInsert(config, 'audit_logs', {
          actor_user_id: auth.user?.id || null,
          actor_email: row.email,
          actor_role: normalizeText(auth.profile?.role, 60) || 'admin',
          action: 'email.coupon_broadcast.sent',
          entity_type: 'marketing_email',
          entity_id: row.email,
          metadata: {
            coupon_code: couponCode,
            coupon_title: couponTitle,
          },
          request_path: req.url,
          request_method: req.method,
        }, { prefer: 'return=minimal' }).catch(() => null);
      } catch (error) {
        console.error('[marketing] coupon broadcast email failed:', error?.message || error);
      }
    }

    await writeAuditLog(config, req, auth, 'marketing.email.trigger', {
      action,
      coupon_code: couponCode,
      queued: queue.length,
      sent,
    }, { entityType: 'marketing_email' });

    const status = await buildMarketingEmailStatus(config, envStatus, buildStatusOptions(body));
    return sendSuccess(res, {
      action,
      executed_at: new Date().toISOString(),
      coupon: {
        code: couponCode,
        title: couponTitle,
        sent,
        queued: queue.length,
      },
      status,
    });
  }

  if (
    action === 'send_shipped' ||
    action === 'send_order_confirmation' ||
    action === 'send_delivered' ||
    action === 'send_review_request'
  ) {
    if (!envStatus.resend_configured) {
      return sendError(res, 400, 'RESEND_API_KEY is not configured', 'EMAIL_PROVIDER_NOT_CONFIGURED');
    }

    const orderId = normalizeText(body.order_id, 120);
    const orderNo = normalizeText(body.order_no, 120);
    if (!orderId && !orderNo) {
      return sendError(res, 400, 'order_id or order_no is required', 'VALIDATION_REQUIRED_ORDER_REF');
    }

    const order = await selectOrderForMarketingEmail(config, orderId, orderNo);
    if (!order) {
      return sendError(res, 404, 'Order not found', 'ORDER_NOT_FOUND');
    }

    const targetEmail = normalizeEmail(order?.email);
    if (!targetEmail) {
      return sendError(res, 400, 'Order has no customer email', 'ORDER_EMAIL_MISSING');
    }

    const sent = await sendOrderMailByAction(action, order);
    if (!sent) {
      return sendError(res, 500, 'Order email could not be sent', 'ORDER_EMAIL_SEND_FAILED');
    }

    const manualAuditAction = action === 'send_shipped'
      ? 'email.shipped.manual.sent'
      : action === 'send_order_confirmation'
        ? 'email.order_confirmation.manual.sent'
        : action === 'send_delivered'
          ? 'email.delivered.manual.sent'
          : 'email.review_request.sent';

    await restInsert(config, 'audit_logs', {
      actor_user_id: auth.user?.id || null,
      actor_email: normalizeText(auth.user?.email, 180) || null,
      actor_role: normalizeText(auth.profile?.role, 60) || 'admin',
      action: manualAuditAction,
      entity_type: 'order',
      entity_id: normalizeText(order?.id, 120) || null,
      metadata: {
        trigger_action: action,
        order_no: normalizeText(order?.order_no, 120) || null,
        email: targetEmail,
      },
      request_path: req.url,
      request_method: req.method,
    }, { prefer: 'return=minimal' }).catch(() => null);

    await writeAuditLog(config, req, auth, 'marketing.email.trigger', {
      action,
      order_id: order.id,
      order_no: order.order_no,
      sent: true,
    }, { entityType: 'order', entityId: order.id });

    const status = await buildMarketingEmailStatus(config, envStatus, buildStatusOptions(body));
    return sendSuccess(res, {
      action,
      executed_at: new Date().toISOString(),
      order_mail: {
        sent: true,
        order_id: order.id,
        order_no: order.order_no,
        email: targetEmail,
      },
      status,
    });
  }

  return sendError(res, 400, 'Invalid action', 'VALIDATION_INVALID_ACTION');
}

async function handleUsers(req, res, ctx) {
  const { config, auth } = ctx;
  if (!hasRole(auth.profile.role, ADMIN_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }
  if (!isAdminOwner(auth)) {
    return sendError(
      res,
      403,
      'Only owner can access and manage admin users',
      'AUTH_FORBIDDEN_OWNER_ONLY'
    );
  }
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'user_profiles', {
      select: 'id,email,full_name,role,subscription_tier,is_active,last_seen_at,created_at,updated_at',
      order: 'created_at.desc',
      limit: 5000,
    });
    const search = normalizeText(query.get('search'), 120).toLowerCase();
    const role = normalizeText(query.get('role'), 40).toLowerCase();
    const active = normalizeText(query.get('active'), 10).toLowerCase();

    if (role && role !== 'all') rows = rows.filter((row) => String(row.role || '').toLowerCase() === role);
    if (active === 'true') rows = rows.filter((row) => row.is_active !== false);
    if (active === 'false') rows = rows.filter((row) => row.is_active === false);
    if (search) {
      rows = rows.filter((row) =>
        String(row.email || '').toLowerCase().includes(search) ||
        String(row.full_name || '').toLowerCase().includes(search)
      );
    }
    rows = rows.map((row) => ({
      ...row,
      is_protected_owner: isProtectedOwnerEmail(row.email),
    }));

    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const email = normalizeEmail(body.email);
    const fullName = normalizeText(body.full_name, 180) || null;
    const role = normalizeRole(body.role, ROLE_VIEWER);
    const subscriptionTier = normalizeTier(body.subscription_tier, 'free');
    const isActive = body.is_active === undefined ? true : toBool(body.is_active, true);
    const password = normalizeText(body.password, 120);

    if (!email || !email.includes('@')) return sendError(res, 400, 'Valid email is required', 'VALIDATION_EMAIL');
    if (!isAdminOwner(auth) && !canManageRole(auth.profile.role, role)) {
      return sendError(res, 403, 'Ayni veya daha yuksek gorev atanamaz', 'AUTH_ROLE_ESCALATION_BLOCKED');
    }

    const existingByEmail = await restSelect(config, 'user_profiles', {
      select: 'id,email,full_name,role,is_active',
      email: `eq.${email}`,
      limit: 1,
    });
    if (existingByEmail.length) {
      const existing = existingByEmail[0];
      return sendError(
        res,
        409,
        `Bu e-posta zaten kayitli. Mevcut rol: ${existing.role || 'viewer'}. Lutfen liste uzerinden guncelleyin veya sifre yenileyin.`,
        'USER_EMAIL_EXISTS'
      );
    }

    let created;
    try {
      created = await supabaseAdminCreateUser(config, {
        email,
        password: password || '',
        fullName,
      });
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('already been registered') || message.includes('already registered')) {
        return sendError(
          res,
          409,
          'Bu e-posta zaten kayitli. Lutfen mevcut kullaniciyi guncelleyin veya sifre yenileyin.',
          'USER_EMAIL_EXISTS'
        );
      }
      throw error;
    }

    const profilePayload = {
      id: created.userId,
      email,
      full_name: fullName,
      role,
      subscription_tier: subscriptionTier,
      is_active: isActive,
    };

    const existing = await restSelect(config, 'user_profiles', {
      select: 'id',
      id: `eq.${created.userId}`,
      limit: 1,
    });

    if (existing.length) {
      await restUpdate(config, 'user_profiles', { id: `eq.${created.userId}` }, profilePayload);
    } else {
      await restInsert(config, 'user_profiles', profilePayload, { prefer: 'return=minimal' });
    }

    await writeAuditLog(config, req, auth, 'user.create', {
      user_id: created.userId,
      role,
      subscription_tier: subscriptionTier,
    }, {
      entityType: 'user',
      entityId: created.userId,
    });

    return sendSuccess(res, {
      id: created.userId,
      email,
      full_name: fullName,
      role,
      subscription_tier: subscriptionTier,
      is_active: isActive,
      temporary_password: created.generatedPassword,
    }, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');

    const existingRows = await restSelect(config, 'user_profiles', {
      select: 'id,email,role,is_active,subscription_tier',
      id: `eq.${id}`,
      limit: 1,
    });
    if (!existingRows.length) return sendError(res, 404, 'User not found', 'USER_NOT_FOUND');

    const existing = existingRows[0];
    if (isProtectedOwnerEmail(existing.email)) {
      return sendError(res, 403, 'Ana hesap degistirilemez', 'AUTH_PROTECTED_OWNER');
    }
    const patch = {};
    if (body.full_name !== undefined) patch.full_name = normalizeText(body.full_name, 180) || null;
    if (body.role !== undefined) patch.role = normalizeRole(body.role, existing.role || ROLE_VIEWER);
    if (body.subscription_tier !== undefined) patch.subscription_tier = normalizeTier(body.subscription_tier, existing.subscription_tier || 'free');
    if (body.is_active !== undefined) patch.is_active = toBool(body.is_active, existing.is_active !== false);
    if (body.email !== undefined) patch.email = normalizeEmail(body.email);

    if (!Object.keys(patch).length && !body.password) {
      return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    }
    if (patch.role && !isAdminOwner(auth) && !canManageRole(auth.profile.role, patch.role)) {
      return sendError(res, 403, 'Ayni veya daha yuksek gorev atanamaz', 'AUTH_ROLE_ESCALATION_BLOCKED');
    }
    if (id === auth.user.id && patch.is_active === false) {
      return sendError(res, 400, 'Cannot deactivate current user', 'AUTH_SELF_DEACTIVATE_BLOCKED');
    }

    const shouldConfirmEmail = toBool(body.force_confirm_email, false) || patch.is_active === true;
    if (body.password || patch.email || shouldConfirmEmail) {
      const authPatch = {};
      if (patch.email) authPatch.email = patch.email;
      if (body.password) authPatch.password = normalizeText(body.password, 120);
      if (shouldConfirmEmail) authPatch.email_confirm = true;
      await supabaseAdminUpdateUser(config, id, authPatch);
    }

    if (Object.keys(patch).length) {
      await restUpdate(config, 'user_profiles', { id: `eq.${id}` }, patch);
    }

    await writeAuditLog(config, req, auth, 'user.update', { id, patch }, {
      entityType: 'user',
      entityId: id,
    });

    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    const hardDelete = toBool(body.hard_delete === undefined ? query.get('hard_delete') : body.hard_delete, false);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    if (id === auth.user.id) return sendError(res, 400, 'Cannot deactivate current user', 'AUTH_SELF_DEACTIVATE_BLOCKED');

    const existingRows = await restSelect(config, 'user_profiles', {
      select: 'id,email,role',
      id: `eq.${id}`,
      limit: 1,
    });
    if (!existingRows.length) return sendError(res, 404, 'User not found', 'USER_NOT_FOUND');
    if (isProtectedOwnerEmail(existingRows[0].email)) {
      return sendError(res, 403, 'Ana hesap silinemez', 'AUTH_PROTECTED_OWNER');
    }
    if (!isAdminOwner(auth) && !canManageRole(auth.profile.role, existingRows[0].role || ROLE_VIEWER)) {
      return sendError(res, 403, 'Bu gorev seviyesindeki kullanici yonetilemez', 'AUTH_ROLE_ESCALATION_BLOCKED');
    }

    if (hardDelete) {
      await supabaseAdminDeleteUser(config, id).catch((error) => {
        if (error?.code === 'AUTH_USER_NOT_FOUND') return null;
        throw error;
      });
      await restDelete(config, 'user_profiles', { id: `eq.${id}` }).catch(async () => {
        await restUpdate(config, 'user_profiles', { id: `eq.${id}` }, { is_active: false });
      });
      await writeAuditLog(config, req, auth, 'user.delete', { id, hard_delete: true }, {
        entityType: 'user',
        entityId: id,
      });
      return sendSuccess(res, { id, deleted: true });
    }

    await restUpdate(config, 'user_profiles', { id: `eq.${id}` }, { is_active: false });
    await writeAuditLog(config, req, auth, 'user.deactivate', { id }, {
      entityType: 'user',
      entityId: id,
    });
    return sendSuccess(res, { id, is_active: false, deleted: false });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleSubscriptions(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'subscriptions', {
      select: '*',
      order: 'created_at.desc',
      limit: 5000,
    });
    const userId = normalizeText(query.get('user_id'), 120);
    const status = normalizeText(query.get('status'), 40).toLowerCase();
    const tier = normalizeText(query.get('tier'), 40).toLowerCase();
    if (userId) rows = rows.filter((row) => String(row.user_id || '') === userId);
    if (status && status !== 'all') rows = rows.filter((row) => String(row.status || '').toLowerCase() === status);
    if (tier && tier !== 'all') rows = rows.filter((row) => String(row.subscription_tier || '').toLowerCase() === tier);
    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, ADMIN_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const payload = {
      user_id: normalizeText(body.user_id, 120),
      subscription_tier: normalizeTier(body.subscription_tier, 'free'),
      status: normalizeText(body.status, 40).toLowerCase() || 'active',
      source: normalizeText(body.source, 80) || 'admin_manual',
      period_start: parseIsoDate(body.period_start),
      period_end: parseIsoDate(body.period_end),
      note: normalizeText(body.note, 1000) || null,
    };
    if (!payload.user_id) return sendError(res, 400, 'user_id is required', 'VALIDATION_REQUIRED_USER_ID');
    if (!SUBSCRIPTION_STATUS_ALLOWED.includes(payload.status)) {
      return sendError(res, 400, 'Invalid subscription status', 'VALIDATION_SUBSCRIPTION_STATUS');
    }

    const inserted = await restInsert(config, 'subscriptions', payload);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await restUpdate(config, 'user_profiles', { id: `eq.${payload.user_id}` }, {
      subscription_tier: payload.subscription_tier,
    }).catch(() => null);

    await writeAuditLog(config, req, auth, 'subscription.create', {
      user_id: payload.user_id,
      subscription_tier: payload.subscription_tier,
      status: payload.status,
    }, {
      entityType: 'subscription',
      entityId: row?.id || null,
    });
    return sendSuccess(res, row, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    const patch = {};
    if (body.subscription_tier !== undefined) patch.subscription_tier = normalizeTier(body.subscription_tier, 'free');
    if (body.status !== undefined) patch.status = normalizeText(body.status, 40).toLowerCase();
    if (body.source !== undefined) patch.source = normalizeText(body.source, 80) || 'admin_manual';
    if (body.period_start !== undefined) patch.period_start = parseIsoDate(body.period_start);
    if (body.period_end !== undefined) patch.period_end = parseIsoDate(body.period_end);
    if (body.note !== undefined) patch.note = normalizeText(body.note, 1000) || null;

    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    if (patch.status && !SUBSCRIPTION_STATUS_ALLOWED.includes(patch.status)) {
      return sendError(res, 400, 'Invalid subscription status', 'VALIDATION_SUBSCRIPTION_STATUS');
    }

    await restUpdate(config, 'subscriptions', { id: `eq.${id}` }, patch);

    if (patch.subscription_tier) {
      let userId = normalizeText(body.user_id, 120);
      if (!userId) {
        const rows = await restSelect(config, 'subscriptions', {
          select: 'user_id',
          id: `eq.${id}`,
          limit: 1,
        });
        userId = normalizeText(rows[0]?.user_id, 120);
      }
      if (userId) {
        await restUpdate(config, 'user_profiles', { id: `eq.${userId}` }, {
          subscription_tier: patch.subscription_tier,
        }).catch(() => null);
      }
    }

    await writeAuditLog(config, req, auth, 'subscription.update', { id, patch }, {
      entityType: 'subscription',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    await restUpdate(config, 'subscriptions', { id: `eq.${id}` }, {
      status: 'canceled',
      period_end: new Date().toISOString(),
    });
    await writeAuditLog(config, req, auth, 'subscription.cancel', { id }, {
      entityType: 'subscription',
      entityId: id,
    });
    return sendSuccess(res, { id, status: 'canceled' });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handlePromotions(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'promotions', {
      select: '*',
      order: 'created_at.desc',
      limit: 5000,
    });
    const active = normalizeText(query.get('active'), 10).toLowerCase();
    const code = normalizeText(query.get('code'), 80).toLowerCase();
    if (active === 'true') rows = rows.filter((row) => row.is_active === true);
    if (active === 'false') rows = rows.filter((row) => row.is_active === false);
    if (code) rows = rows.filter((row) => String(row.code || '').toLowerCase().includes(code));
    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const payload = normalizePromotionPayload(body, {
      usage_count: 0,
      is_active: true,
      target_scope: 'all',
    });
    const required = validateRequiredFields(payload, ['code', 'title', 'discount_type', 'discount_value']);
    if (!required.valid) {
      return sendError(res, 400, `Missing fields: ${required.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }
    if (!PROMOTION_TYPE_ALLOWED.includes(payload.discount_type)) {
      return sendError(res, 400, 'Invalid discount type', 'VALIDATION_PROMOTION_TYPE');
    }
    const inserted = await restInsert(config, 'promotions', payload);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await writeAuditLog(config, req, auth, 'promotion.create', { code: payload.code }, {
      entityType: 'promotion',
      entityId: row?.id || null,
    });
    return sendSuccess(res, row, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    const patch = normalizePromotionPayload(body, {});
    delete patch.id;
    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    if (patch.discount_type && !PROMOTION_TYPE_ALLOWED.includes(patch.discount_type)) {
      return sendError(res, 400, 'Invalid discount type', 'VALIDATION_PROMOTION_TYPE');
    }
    await restUpdate(config, 'promotions', { id: `eq.${id}` }, patch);
    await writeAuditLog(config, req, auth, 'promotion.update', { id, patch }, {
      entityType: 'promotion',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    await restDelete(config, 'promotions', { id: `eq.${id}` });
    await writeAuditLog(config, req, auth, 'promotion.delete', { id }, {
      entityType: 'promotion',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleMarketplaceConnections(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'marketplace_connections', {
      select: '*',
      order: 'created_at.desc',
      limit: 2000,
    });
    const provider = normalizeText(query.get('provider'), 80).toLowerCase();
    const active = normalizeText(query.get('active'), 10).toLowerCase();
    if (provider && provider !== 'all') rows = rows.filter((row) => String(row.provider || '').toLowerCase() === provider);
    if (active === 'true') rows = rows.filter((row) => row.is_active === true);
    if (active === 'false') rows = rows.filter((row) => row.is_active === false);
    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows.map(redactConnection), pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const payload = normalizeConnectionPayload(body, {
      is_active: true,
      credentials_json: {},
    });
    const required = validateRequiredFields(payload, ['provider', 'display_name']);
    if (!required.valid) {
      return sendError(res, 400, `Missing fields: ${required.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }

    const credentials = body.credentials || body.credentials_json || {};
    const sanitizedCredentials = credentials && typeof credentials === 'object' ? credentials : {};
    const encrypted = encryptJsonPayload(sanitizedCredentials);
    payload.credentials_json = encrypted.stored;
    payload.api_key_hint = maskSecret(
      sanitizedCredentials.api_key ||
      sanitizedCredentials.apiKey ||
      sanitizedCredentials.key ||
      ''
    );

    const inserted = await restInsert(config, 'marketplace_connections', payload);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await writeAuditLog(config, req, auth, 'marketplace.connection.create', {
      provider: payload.provider,
      encrypted_credentials: encrypted.encrypted,
    }, {
      entityType: 'marketplace_connection',
      entityId: row?.id || null,
    });
    return sendSuccess(res, {
      ...redactConnection(row),
      credentials_encrypted: encrypted.encrypted,
    }, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');

    const existingRows = await restSelect(config, 'marketplace_connections', {
      select: '*',
      id: `eq.${id}`,
      limit: 1,
    });
    if (!existingRows.length) return sendError(res, 404, 'Connection not found', 'MARKETPLACE_CONNECTION_NOT_FOUND');

    const patch = normalizeConnectionPayload(body, {});
    if (body.credentials || body.credentials_json) {
      const credentials = body.credentials || body.credentials_json || {};
      const encrypted = encryptJsonPayload(credentials);
      patch.credentials_json = encrypted.stored;
      patch.api_key_hint = maskSecret(
        credentials.api_key ||
        credentials.apiKey ||
        credentials.key ||
        ''
      );
    }
    delete patch.id;
    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');

    await restUpdate(config, 'marketplace_connections', { id: `eq.${id}` }, patch);
    await writeAuditLog(config, req, auth, 'marketplace.connection.update', { id, patch: { ...patch, credentials_json: patch.credentials_json ? '[REDACTED]' : undefined } }, {
      entityType: 'marketplace_connection',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    await restDelete(config, 'marketplace_connections', { id: `eq.${id}` });
    await writeAuditLog(config, req, auth, 'marketplace.connection.delete', { id }, {
      entityType: 'marketplace_connection',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleMarketplaceSync(req, res, ctx) {
  const { config, auth } = ctx;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  if (!hasRole(auth.profile.role, WRITER_ROLES)) return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const action = normalizeText(body.action, 40).toLowerCase();
  const provider = normalizeText(body.provider, 80).toLowerCase();
  const connectionId = normalizeText(body.connection_id, 120);
  const allowedActions = ['push_stock', 'pull_orders', 'full_sync'];
  if (!allowedActions.includes(action)) {
    return sendError(res, 400, 'Invalid action', 'VALIDATION_SYNC_ACTION');
  }

  let connections = await restSelect(config, 'marketplace_connections', {
    select: 'id,provider,display_name,is_active',
    order: 'created_at.desc',
    limit: 500,
  });

  connections = connections.filter((row) => row.is_active !== false);
  if (provider && provider !== 'all') {
    connections = connections.filter((row) => String(row.provider || '').toLowerCase() === provider);
  }
  if (connectionId) {
    connections = connections.filter((row) => String(row.id || '') === connectionId);
  }
  if (!connections.length) {
    return sendError(res, 404, 'No active integration found', 'MARKETPLACE_CONNECTION_NOT_FOUND');
  }

  let activeProducts = [];
  let openOrders = [];
  if (action === 'push_stock' || action === 'full_sync') {
    activeProducts = await safeSelect(config, 'products', {
      select: 'id',
      active: 'eq.true',
      limit: 5000,
    }, []);
  }
  if (action === 'pull_orders' || action === 'full_sync') {
    openOrders = await safeSelect(config, 'orders', {
      select: 'id,status',
      order: 'created_at.desc',
      limit: 5000,
    }, []);
    openOrders = openOrders.filter((row) => {
      const status = String(row.status || '').toLowerCase();
      return ['pending', 'processing', 'shipped'].includes(status);
    });
  }

  const syncedAt = new Date().toISOString();
  const results = [];
  for (const row of connections) {
    const pushedStockCount = action === 'pull_orders' ? 0 : activeProducts.length;
    const pulledOrderCount = action === 'push_stock' ? 0 : openOrders.length;

    await restUpdate(config, 'marketplace_connections', { id: `eq.${row.id}` }, {
      last_sync_at: syncedAt,
      last_error: null,
    });

    results.push({
      connection_id: row.id,
      provider: row.provider,
      display_name: row.display_name || row.provider,
      pushed_stock_count: pushedStockCount,
      pulled_order_count: pulledOrderCount,
      synced_at: syncedAt,
      status: 'ok',
    });
  }

  await writeAuditLog(config, req, auth, 'marketplace.sync', {
    action,
    provider: provider || 'all',
    connection_count: results.length,
    pushed_stock_total: results.reduce((sum, item) => sum + Number(item.pushed_stock_count || 0), 0),
    pulled_order_total: results.reduce((sum, item) => sum + Number(item.pulled_order_count || 0), 0),
  }, { entityType: 'marketplace_connection' });

  return sendSuccess(res, {
    action,
    synced_at: syncedAt,
    results,
  });
}

async function handleSupportTickets(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'support_tickets', {
      select: '*',
      order: 'updated_at.desc',
      limit: 5000,
    });
    const status = normalizeText(query.get('status'), 40).toLowerCase();
    const priority = normalizeText(query.get('priority'), 40).toLowerCase();
    const search = normalizeText(query.get('search'), 120).toLowerCase();
    if (status && status !== 'all') rows = rows.filter((row) => String(row.status || '').toLowerCase() === status);
    if (priority && priority !== 'all') rows = rows.filter((row) => String(row.priority || '').toLowerCase() === priority);
    if (search) {
      rows = rows.filter((row) =>
        String(row.subject || '').toLowerCase().includes(search) ||
        String(row.customer_email || '').toLowerCase().includes(search) ||
        String(row.customer_name || '').toLowerCase().includes(search)
      );
    }
    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const payload = normalizeTicketPayload(body, {
      status: 'open',
      priority: 'medium',
      ai_suggested_tags: [],
      metadata: {},
    });
    const required = validateRequiredFields(payload, ['customer_email', 'subject']);
    if (!required.valid) {
      return sendError(res, 400, `Missing fields: ${required.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }
    const inserted = await restInsert(config, 'support_tickets', payload);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await writeAuditLog(config, req, auth, 'support.ticket.create', { subject: payload.subject }, {
      entityType: 'support_ticket',
      entityId: row?.id || null,
    });
    return sendSuccess(res, row, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    const patch = normalizeTicketPayload(body, {});
    delete patch.id;
    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    await restUpdate(config, 'support_tickets', { id: `eq.${id}` }, patch);
    await writeAuditLog(config, req, auth, 'support.ticket.update', { id, patch }, {
      entityType: 'support_ticket',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    await restDelete(config, 'support_tickets', { id: `eq.${id}` });
    await writeAuditLog(config, req, auth, 'support.ticket.delete', { id }, {
      entityType: 'support_ticket',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleSupportMessages(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    const ticketId = normalizeText(query.get('ticket_id'), 120);
    if (!ticketId) return sendError(res, 400, 'ticket_id is required', 'VALIDATION_REQUIRED_TICKET_ID');
    const rows = await restSelect(config, 'support_messages', {
      select: '*',
      ticket_id: `eq.${ticketId}`,
      order: 'created_at.asc',
      limit: 5000,
    });
    const pagination = parsePagination(query, { pageSize: 50, maxPageSize: 1000 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const payload = normalizeSupportMessagePayload(body, {
      sender_type: 'agent',
      ai_generated: false,
      metadata: {},
    });
    const required = validateRequiredFields(payload, ['ticket_id', 'message']);
    if (!required.valid) {
      return sendError(res, 400, `Missing fields: ${required.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }
    const inserted = await restInsert(config, 'support_messages', payload);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await writeAuditLog(config, req, auth, 'support.message.create', {
      ticket_id: payload.ticket_id,
      ai_generated: payload.ai_generated,
    }, {
      entityType: 'support_message',
      entityId: row?.id || null,
    });

    const senderType = normalizeText(payload.sender_type, 40).toLowerCase();
    if (senderType === 'agent') {
      const automation = await loadEmailAutomationSettings(config).catch(() => null);
      const supportAutoEnabled = automation ? automation.auto_support_updates !== false : true;
      if (supportAutoEnabled) {
        const ticketRows = await safeSelect(config, 'support_tickets', {
          select: 'id,subject,customer_name,customer_email',
          id: `eq.${payload.ticket_id}`,
          limit: 1,
        }, []);
        if (ticketRows.length) {
          const ticket = ticketRows[0];
          const sent = await sendSupportTicketUpdatedEmailIfPossible(ticket, payload.message);
          if (sent) {
            await restInsert(config, 'audit_logs', {
              actor_user_id: auth.user?.id || null,
              actor_email: normalizeText(auth.user?.email, 180) || null,
              actor_role: normalizeText(auth.profile?.role, 60) || 'admin',
              action: 'email.support_ticket_update.sent',
              entity_type: 'support_ticket',
              entity_id: normalizeText(ticket?.id, 120) || null,
              metadata: {
                ticket_id: normalizeText(ticket?.id, 120) || null,
                target_email: normalizeEmail(ticket?.customer_email) || null,
              },
              request_path: req.url,
              request_method: req.method,
            }, { prefer: 'return=minimal' }).catch(() => null);
          }
        }
      }
    }
    return sendSuccess(res, row, 201);
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    await restDelete(config, 'support_messages', { id: `eq.${id}` });
    await writeAuditLog(config, req, auth, 'support.message.delete', { id }, {
      entityType: 'support_message',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleFinancialSummary(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = await safeSelect(config, 'financial_transactions', {
      select: '*',
      order: 'transaction_date.desc',
      limit: 10000,
    });
    const transactionType = normalizeText(query.get('transaction_type'), 40).toLowerCase();
    const source = normalizeText(query.get('source'), 80).toLowerCase();
    const range = buildDateRange(query);
    if (transactionType && transactionType !== 'all') {
      rows = rows.filter((row) => String(row.transaction_type || '').toLowerCase() === transactionType);
    }
    if (source && source !== 'all') {
      rows = rows.filter((row) => String(row.source || '').toLowerCase() === source);
    }
    rows = rows.filter((row) => isWithinRange(row.transaction_date, range.startIso, range.endIso));

    const income = rows
      .filter((row) => String(row.transaction_type || '').toLowerCase() === 'income')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expense = rows
      .filter((row) => String(row.transaction_type || '').toLowerCase() === 'expense')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const commission = rows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);

    const paidOrders = await safeSelect(config, 'orders', {
      select: 'id,total,payment_status,created_at',
      payment_status: 'eq.paid',
      limit: 5000,
    });
    const paidRevenue = paidOrders
      .filter((row) => isWithinRange(row.created_at, range.startIso, range.endIso))
      .reduce((sum, row) => sum + Number(row.total || 0), 0);

    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);

    return sendSuccess(res, {
      range,
      summary: {
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        commission: Math.round(commission * 100) / 100,
        net_profit: Math.round((income - expense - commission) * 100) / 100,
        paid_revenue: Math.round(paidRevenue * 100) / 100,
      },
      transactions: paged.items,
    }, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, ADMIN_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const payload = normalizeFinancialPayload(body, {
      transaction_type: 'income',
      currency: 'TRY',
      source: 'manual',
      metadata: {},
    });
    const required = validateRequiredFields(payload, ['transaction_type', 'amount']);
    if (!required.valid) {
      return sendError(res, 400, `Missing fields: ${required.missing.join(', ')}`, 'VALIDATION_REQUIRED_FIELDS');
    }
    if (!FINANCIAL_TYPE_ALLOWED.includes(payload.transaction_type)) {
      return sendError(res, 400, 'Invalid transaction type', 'VALIDATION_FINANCIAL_TYPE');
    }
    const inserted = await restInsert(config, 'financial_transactions', payload);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    await writeAuditLog(config, req, auth, 'financial.transaction.create', {
      transaction_type: payload.transaction_type,
      amount: payload.amount,
    }, {
      entityType: 'financial_transaction',
      entityId: row?.id || null,
    });
    return sendSuccess(res, row, 201);
  }

  if (req.method === 'PUT') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    const patch = normalizeFinancialPayload(body, {});
    delete patch.id;
    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    if (patch.transaction_type && !FINANCIAL_TYPE_ALLOWED.includes(patch.transaction_type)) {
      return sendError(res, 400, 'Invalid transaction type', 'VALIDATION_FINANCIAL_TYPE');
    }
    await restUpdate(config, 'financial_transactions', { id: `eq.${id}` }, patch);
    await writeAuditLog(config, req, auth, 'financial.transaction.update', { id, patch }, {
      entityType: 'financial_transaction',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  if (req.method === 'DELETE') {
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');
    await restDelete(config, 'financial_transactions', { id: `eq.${id}` });
    await writeAuditLog(config, req, auth, 'financial.transaction.delete', { id }, {
      entityType: 'financial_transaction',
      entityId: id,
    });
    return sendSuccess(res, { id });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleAiProductParse(req, res, ctx) {
  const { config, auth } = ctx;
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }
  const aiKey = getAIApiKey();
  if (req.method === 'GET') {
    return sendSuccess(res, {
      enabled: Boolean(aiKey),
      provider: aiKey ? 'anthropic' : null,
      mode: aiKey ? 'live_or_fallback' : 'fallback_only',
    });
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const prompt = normalizeText(body.prompt || body.text || body.input, 2000);
  if (!prompt) return sendError(res, 400, 'prompt is required', 'VALIDATION_REQUIRED_PROMPT');

  const records = parseProductPromptFallback(prompt);
  await writeAuditLog(config, req, auth, 'ai.product.parse.request', {
    has_api_key: Boolean(aiKey),
    record_count: records.length,
  }, { entityType: 'ai' });

  if (!aiKey) {
    return sendSuccess(res, {
      enabled: false,
      fallback: true,
      message: 'AI anahtari tanimli degil. Yerel parse fallback sonucu donduruldu.',
      records,
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': aiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'Verilen metin icindeki urun bilgilerini JSON dizisi olarak cikar. Her urun: code (uniq kod), name (urun adi), category (bath/forge/industrial), price (fiyat), material (malzeme), description (aciklama) alanlarini icersin. Hata durumunda bos dizi dondur.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(String(error?.error?.message || 'Claude API request failed'));
    }

    const data = await response.json();
    const aiText = data?.content?.[0]?.text || '';

    let aiRecords = [];
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiRecords = JSON.parse(jsonMatch[0]);
      }
    } catch (_) {
      // Fallback to regex if JSON parse fails
      aiRecords = parseProductPromptFallback(aiText);
    }

    return sendSuccess(res, {
      enabled: true,
      fallback: false,
      message: 'Claude AI kullanilarak urunler ayristi.',
      records: Array.isArray(aiRecords) ? aiRecords : [],
    });
  } catch (error) {
    // Fallback to regex parser on any error
    return sendSuccess(res, {
      enabled: true,
      fallback: true,
      message: `Claude AI hatasi: ${String(error?.message || 'Unknown error')}. Fallback parser kullanildi.`,
      records,
    });
  }
}

async function handleAiSupportReply(req, res, ctx) {
  const { config, auth } = ctx;
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }
  const aiKey = getAIApiKey();
  if (req.method === 'GET') {
    return sendSuccess(res, {
      enabled: Boolean(aiKey),
      provider: aiKey ? 'anthropic' : null,
      mode: aiKey ? 'live_or_fallback' : 'fallback_only',
    });
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const message = normalizeText(body.message, 4000);
  const ticketId = normalizeText(body.ticket_id, 120) || null;
  if (!message) return sendError(res, 400, 'message is required', 'VALIDATION_REQUIRED_MESSAGE');

  const suggestion = buildSupportReplyFallback(message, ticketId);
  await writeAuditLog(config, req, auth, 'ai.support.reply.request', {
    has_api_key: Boolean(aiKey),
    ticket_id: ticketId,
  }, { entityType: 'ai' });

  if (!aiKey) {
    return sendSuccess(res, {
      enabled: false,
      fallback: true,
      message: 'AI anahtari tanimli degil. Fallback destek yaniti olusturuldu.',
      suggestion,
    });
  }

  try {
    const systemPrompt = ticketId
      ? 'Sen Blaene musteri destek temsilcisisin. Kisa, profesyonel ve yaradimsever Turkce destek yanitlari yaz. Tasinan tickets icin problem cozumune odaklan.'
      : 'Sen Blaene musteri destek temsilcisisin. Kisa, profesyonel ve yardimci Turkce destek yanitlari yaz.';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': aiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(String(error?.error?.message || 'Claude API request failed'));
    }

    const data = await response.json();
    const aiSuggestion = data?.content?.[0]?.text || suggestion;

    return sendSuccess(res, {
      enabled: true,
      fallback: false,
      message: 'Claude AI kullanilarak destek yaniti olusturuldu.',
      suggestion: aiSuggestion,
    });
  } catch (error) {
    // Fallback to regex suggestion on any error
    return sendSuccess(res, {
      enabled: true,
      fallback: true,
      message: `Claude AI hatasi: ${String(error?.message || 'Unknown error')}. Fallback yaniti kullanildi.`,
      suggestion,
    });
  }
}

async function handleAuditLogs(req, res, ctx) {
  const { config, auth } = ctx;
  if (!hasRole(auth.profile.role, ADMIN_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

  const query = getUrl(req).searchParams;
  let rows = await restSelect(config, 'audit_logs', {
    select: '*',
    order: 'created_at.desc',
    limit: 10000,
  });
  const action = normalizeText(query.get('action'), 120).toLowerCase();
  const actorEmail = normalizeText(query.get('actor_email'), 120).toLowerCase();
  const entityType = normalizeText(query.get('entity_type'), 80).toLowerCase();
  const search = normalizeText(query.get('search'), 120).toLowerCase();
  if (action) rows = rows.filter((row) => String(row.action || '').toLowerCase().includes(action));
  if (actorEmail) rows = rows.filter((row) => String(row.actor_email || '').toLowerCase().includes(actorEmail));
  if (entityType) rows = rows.filter((row) => String(row.entity_type || '').toLowerCase() === entityType);
  if (search) {
    rows = rows.filter((row) =>
      String(row.action || '').toLowerCase().includes(search) ||
      String(row.request_path || '').toLowerCase().includes(search) ||
      String(row.actor_email || '').toLowerCase().includes(search)
    );
  }
  const pagination = parsePagination(query, { pageSize: 50, maxPageSize: 500 });
  const paged = paginateRows(rows, pagination);
  return sendSuccess(res, paged.items, 200, paged.meta);
}

async function handleShipping(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;
  const availableProviders = await getShippingProvidersFromSettings(config);
  const providerCodes = availableProviders.map((item) => item.provider);
  const providerLabelByCode = availableProviders.reduce((acc, item) => {
    acc[item.provider] = item.label || item.provider;
    return acc;
  }, {});

  if (req.method === 'GET') {
    let rows = await restSelect(config, 'orders', {
      select: 'id,order_no,customer_name,payment_status,status,shipping_provider,tracking_code,shipped_at,created_at,total,currency',
      order: 'created_at.desc',
      limit: 3000,
    });
    const workflowStatus = normalizeText(query.get('status'), 40).toLowerCase();
    const provider = normalizeText(query.get('provider'), 40).toLowerCase();
    if (workflowStatus && workflowStatus !== 'all') {
      rows = rows.filter((row) => String(row.status || '').toLowerCase() === workflowStatus);
    }
    if (provider && provider !== 'all') {
      rows = rows.filter((row) => String(row.shipping_provider || '').toLowerCase() === provider);
    }
    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, {
      providers: providerCodes.map((item) => ({
        provider: item,
        label: providerLabelByCode[item] || item,
        configured: isProviderConfigured(item),
      })),
      orders: paged.items,
    }, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

  if (req.method === 'POST') {
    const orderId = normalizeText(body.order_id, 120);
    const provider = normalizeText(body.provider, 40).toLowerCase();
    if (!orderId) return sendError(res, 400, 'order_id is required', 'VALIDATION_REQUIRED_ORDER_ID');
    if (!providerCodes.includes(provider)) {
      return sendError(res, 400, 'Invalid shipping provider', 'VALIDATION_SHIPPING_PROVIDER');
    }

    const rows = await restSelect(config, 'orders', {
      select: '*',
      id: `eq.${orderId}`,
      limit: 1,
    });
    if (!rows.length) return sendError(res, 404, 'Order not found', 'ORDER_NOT_FOUND');

    const order = rows[0];
    if (!isOrderPaymentApproved(order)) {
      return sendError(
        res,
        400,
        'Payment approval required before shipping actions',
        'ORDER_PAYMENT_REQUIRED_FOR_SHIPPING'
      );
    }
    const shipment = await createShipment({ provider, order });
    if (!shipment.success) {
      return sendError(res, 400, shipment.error || 'Shipment create failed', shipment.code || 'SHIPPING_CREATE_FAILED');
    }

    const patch = {
      shipping_provider: provider,
      tracking_code: shipment.data.tracking_code || null,
      shipped_at: new Date().toISOString(),
      status: 'shipped',
    };

    await restUpdate(config, 'orders', { id: `eq.${orderId}` }, patch);
    await writeAuditLog(config, req, auth, 'shipping.create', {
      order_id: orderId,
      provider,
      tracking_code: patch.tracking_code,
    }, {
      entityType: 'order',
      entityId: orderId,
    });

    return sendSuccess(res, {
      order_id: orderId,
      ...shipment.data,
    });
  }

  if (req.method === 'PUT') {
    const orderId = normalizeText(body.order_id || query.get('order_id'), 120);
    if (!orderId) return sendError(res, 400, 'order_id is required', 'VALIDATION_REQUIRED_ORDER_ID');
    const orderRows = await safeSelect(config, 'orders', {
      select: 'id,order_no,customer_name,email,payment_status,status,tracking_code,shipping_provider',
      id: `eq.${orderId}`,
      limit: 1,
    }, []);
    if (!orderRows.length) return sendError(res, 404, 'Order not found', 'ORDER_NOT_FOUND');
    const currentOrder = orderRows[0];
    if (!isOrderPaymentApproved(currentOrder)) {
      return sendError(
        res,
        400,
        'Payment approval required before shipping actions',
        'ORDER_PAYMENT_REQUIRED_FOR_SHIPPING'
      );
    }

    const patch = {};
    if (body.tracking_code !== undefined) patch.tracking_code = normalizeText(body.tracking_code, 120) || null;
    if (body.provider !== undefined) {
      const provider = normalizeText(body.provider, 40).toLowerCase() || null;
      if (provider && !providerCodes.includes(provider)) {
        return sendError(res, 400, 'Invalid shipping provider', 'VALIDATION_SHIPPING_PROVIDER');
      }
      patch.shipping_provider = provider;
    }
    if (body.status !== undefined) {
      const workflowStatus = normalizeText(body.status, 40).toLowerCase();
      if (!ORDER_STATUS_ALLOWED.includes(workflowStatus)) {
        return sendError(res, 400, 'Invalid workflow status', 'VALIDATION_WORKFLOW_STATUS');
      }
      patch.status = workflowStatus;
      if (workflowStatus === 'shipped') patch.shipped_at = new Date().toISOString();
    }
    if (!Object.keys(patch).length) return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');

    await restUpdate(config, 'orders', { id: `eq.${orderId}` }, patch);
    await writeAuditLog(config, req, auth, 'shipping.update', { order_id: orderId, patch }, {
      entityType: 'order',
      entityId: orderId,
    });

    return sendSuccess(res, { order_id: orderId, patch });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleCustomers(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    let rows = [];
    try {
      rows = await restSelect(config, 'customer_profiles', {
        select: 'id,email,username,full_name,phone,default_address,default_city,customer_type,consent_kvkk,consent_terms,consent_marketing_email,consent_marketing_sms,consent_marketing_call,created_at,updated_at',
        order: 'created_at.desc',
        limit: 5000,
      });
    } catch {
      rows = await safeSelect(config, 'customer_profiles', {
        select: 'id,email,full_name,phone,default_address,default_city,created_at,updated_at',
        order: 'created_at.desc',
        limit: 5000,
      }, []);
    }

    try {
      const authUsers = await supabaseAdminListUsers(config, { page: 1, perPage: 1000 });
      if (Array.isArray(authUsers) && authUsers.length) {
        const indexById = new Map();
        rows.forEach((row, index) => {
          const id = normalizeText(row.id, 120);
          if (id) indexById.set(id, index);
        });

        authUsers.forEach((user) => {
          const id = normalizeText(user?.id, 120);
          if (!id) return;

          const metadata = user?.user_metadata && typeof user.user_metadata === 'object'
            ? user.user_metadata
            : {};
          const email = normalizeEmail(user?.email) || null;
          const fullName = normalizeText(metadata.full_name || metadata.name, 180) || null;
          const username = normalizeText(metadata.username, 120) || null;
          const phone = normalizeText(user?.phone || metadata.phone, 60) || null;
          const address = normalizeText(metadata.default_address, 300) || null;
          const city = normalizeText(metadata.default_city, 120) || null;
          const createdAt = normalizeText(user?.created_at, 80) || new Date().toISOString();
          const updatedAt = normalizeText(user?.updated_at, 80) || createdAt;

          const existingIndex = indexById.get(id);
          if (existingIndex !== undefined) {
            const current = rows[existingIndex] || {};
            rows[existingIndex] = {
              ...current,
              id,
              email: current.email || email,
              full_name: current.full_name || fullName,
              username: current.username || username,
              phone: current.phone || phone,
              default_address: current.default_address || address,
              default_city: current.default_city || city,
              created_at: current.created_at || createdAt,
              updated_at: current.updated_at || updatedAt,
            };
            return;
          }

          rows.push({
            id,
            email,
            username,
            full_name: fullName,
            phone,
            default_address: address,
            default_city: city,
            consent_kvkk: null,
            consent_terms: null,
            consent_marketing_email: null,
            consent_marketing_sms: null,
            consent_marketing_call: null,
            created_at: createdAt,
            updated_at: updatedAt,
          });
        });
      }
    } catch {
      // customer_profiles is still the primary source; auth fallback is best-effort
    }

    rows = rows
      .slice()
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const search = normalizeText(query.get('search'), 120).toLowerCase();
    if (search) {
      rows = rows.filter((row) =>
        String(row.email || '').toLowerCase().includes(search) ||
        String(row.full_name || '').toLowerCase().includes(search) ||
        String(row.username || '').toLowerCase().includes(search) ||
        String(row.phone || '').toLowerCase().includes(search)
      );
    }

    const pagination = parsePagination(query, { pageSize: 25, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (req.method === 'DELETE') {
    if (!hasRole(auth.profile.role, ADMIN_ROLES)) {
      return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
    }

    const parsed = await parseBodySafe(req);
    const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
    const id = normalizeText(body.id || query.get('id'), 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');

    let profileDeleted = false;
    let authDeleted = false;

    const existingRows = await safeSelect(config, 'customer_profiles', {
      select: 'id,email,full_name',
      id: `eq.${id}`,
      limit: 1,
    }, []);

    if (Array.isArray(existingRows) && existingRows.length) {
      await restDelete(config, 'customer_profiles', { id: `eq.${id}` });
      profileDeleted = true;
    }

    try {
      await supabaseAdminDeleteUser(config, id);
      authDeleted = true;
    } catch (error) {
      const errorCode = normalizeText(error?.code, 80);
      const errorMessage = normalizeText(error?.message, 300).toLowerCase();
      const isNotFound = errorCode === 'AUTH_USER_NOT_FOUND' || errorMessage.includes('not found');
      if (!isNotFound) throw error;
    }

    if (!profileDeleted && !authDeleted) {
      return sendError(res, 404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    await writeAuditLog(config, req, auth, 'customer.delete', {
      id,
      profile_deleted: profileDeleted,
      auth_deleted: authDeleted,
    }, {
      entityType: 'customer',
      entityId: id,
    });

    return sendSuccess(res, {
      id,
      profile_deleted: profileDeleted,
      auth_deleted: authDeleted,
    });
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleSiteSettings(req, res, ctx) {
  const { config, auth } = ctx;
  const query = getUrl(req).searchParams;

  if (req.method === 'GET') {
    const key = normalizeStorageToken(query.get('key'), '');
    if (key) {
      const rows = await safeSelect(config, 'site_settings', {
        select: '*',
        key: `eq.${key}`,
        limit: 1,
      }, []);
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      return sendSuccess(res, row);
    }

    const rows = await safeSelect(config, 'site_settings', {
      select: '*',
      order: 'key.asc',
      limit: 5000,
    }, []);
    const pagination = parsePagination(query, { pageSize: 50, maxPageSize: 500 });
    const paged = paginateRows(rows, pagination);
    return sendSuccess(res, paged.items, 200, paged.meta);
  }

  if (!hasRole(auth.profile.role, WRITER_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const key = normalizeStorageToken(body.key || query.get('key'), '');
  if (!key) return sendError(res, 400, 'key is required', 'VALIDATION_REQUIRED_KEY');

  if (req.method === 'DELETE') {
    await restDelete(config, 'site_settings', { key: `eq.${key}` });
    await writeAuditLog(config, req, auth, 'site_settings.delete', { key }, { entityType: 'site_settings', entityId: key });
    return sendSuccess(res, { key });
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const payload = {
      key,
      value_json: body.value_json !== undefined ? body.value_json : (body.value !== undefined ? body.value : {}),
      description: normalizeText(body.description, 500) || null,
      is_public: toBool(body.is_public, false),
      updated_by: normalizeText(auth.user?.email, 180) || null,
    };

    const existing = await safeSelect(config, 'site_settings', {
      select: 'key',
      key: `eq.${key}`,
      limit: 1,
    }, []);

    if (Array.isArray(existing) && existing.length) {
      await restUpdate(config, 'site_settings', { key: `eq.${key}` }, payload);
    } else {
      await restInsert(config, 'site_settings', payload, { prefer: 'return=minimal' });
    }

    await writeAuditLog(config, req, auth, 'site_settings.upsert', { key }, { entityType: 'site_settings', entityId: key });
    return sendSuccess(res, payload);
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

async function handleMigrations(req, res, ctx) {
  const { config } = ctx || {};

  if (req.method === 'POST') {
    const { body: bodyData } = await readJsonBody(req);
    const { type } = bodyData || {};

    if (type === 'add-archived-column') {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.SUPABASE_URL;
      if (!serviceRoleKey || !supabaseUrl) {
        return sendError(res, 500, 'Service role key not configured', 'CONFIG_ERROR');
      }

      try {
        const sqlQuery = `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;`;
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: sqlQuery }),
        });

        const responseData = await response.json();
        if (!response.ok) {
          console.error('Migration response error:', responseData, response.status);
          return sendError(res, 500, `Migration failed: ${responseData.message || 'Unknown error'}`, 'MIGRATION_ERROR');
        }

        console.log('Migration executed successfully:', responseData);
        return sendSuccess(res, { ok: true, message: 'Migration executed - archived column added or already exists' });
      } catch (err) {
        console.error('Migration error:', err);
        return sendError(res, 500, `Migration failed: ${err.message}`, 'MIGRATION_ERROR');
      }
    }

    return sendError(res, 400, 'Unknown migration type', 'UNKNOWN_MIGRATION_TYPE');
  }

  return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

function notImplemented(res, routeKey) {
  return sendError(
    res,
    501,
    `Route not fully implemented yet: ${routeKey}`,
    'ROUTE_NOT_IMPLEMENTED'
  );
}

async function authPasswordGrant(config, email, password) {
  const safeEmail = normalizeEmail(email);
  const safePassword = normalizeText(password, 256);
  if (!safeEmail || !safePassword) {
    return { ok: false, status: 400, error: 'Email and password required', code: 'VALIDATION_ERROR' };
  }

  const authApiKey = config.anonKey || config.serviceRoleKey;
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: authApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: safeEmail, password: safePassword }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token || !payload?.user?.id) {
    return { ok: false, status: 401, error: 'Invalid credentials', code: 'AUTH_INVALID' };
  }

  return {
    ok: true,
    token: payload.access_token,
    user: payload.user,
  };
}

function hasAllowedLoginRole(roleValue) {
  const validRoles = ['super_admin', 'admin', 'editor', 'viewer'];
  return validRoles.includes(String(roleValue || '').toLowerCase());
}

async function handleVerifyLogout(req, res, ctx) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  const parsed = await readJsonBody(req);
  const body = parsed?.body || {};
  const { password } = body;
  const { auth } = ctx;

  if (!password || typeof password !== 'string') {
    return sendError(res, 400, 'Password required', 'VALIDATION_ERROR');
  }

  try {
    const config = assertSupabaseConfig();
    const authResult = await authPasswordGrant(config, auth.user.email, password);
    if (!authResult.ok) {
      return sendError(res, 401, 'Invalid password', 'AUTH_INVALID_PASSWORD');
    }
    return sendSuccess(res, { ok: true });
  } catch (err) {
    console.error('Verify logout error:', err);
    return sendError(res, 500, 'Verification failed', 'AUTH_ERROR');
  }
}

async function handleCouponBroadcast(req, res, ctx) {
  const { config, auth } = ctx;
  if (!hasRole(auth.profile.role, ADMIN_ROLES)) {
    return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
  }
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (!hasResend) {
    return sendError(res, 503, 'Email service not configured', 'EMAIL_NOT_CONFIGURED');
  }

  const parsed = await parseBodySafe(req);
  const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
  const promotionId = normalizeText(body.promotion_id, 120);
  if (!promotionId) {
    return sendError(res, 400, 'promotion_id is required', 'VALIDATION_REQUIRED_FIELDS');
  }

  const promotions = await restSelect(config, 'promotions', {
    select: '*',
    id: `eq.${promotionId}`,
    limit: 1,
  });
  const promotion = Array.isArray(promotions) ? promotions[0] : null;
  if (!promotion) {
    return sendError(res, 404, 'Promotion not found', 'NOT_FOUND');
  }

  const selectedIds = Array.isArray(body.customer_ids) ? body.customer_ids : [];

  let customers = [];
  try {
    customers = await restSelect(config, 'customer_profiles', {
      select: 'id,email,full_name',
      order: 'created_at.asc',
      limit: 5000,
    });
  } catch {
    customers = [];
  }

  if (selectedIds.length) {
    const idSet = new Set(selectedIds.map(String));
    customers = customers.filter((c) => idSet.has(String(c.id || '')));
  }

  const validCustomers = (Array.isArray(customers) ? customers : []).filter(
    (item) => normalizeEmail(item?.email)
  );

  if (!validCustomers.length) {
    return sendError(res, 404, 'No customers with email found', 'NO_CUSTOMERS');
  }

  const discountText =
    promotion.discount_type === 'percent'
      ? `%${promotion.discount_value} indirim`
      : `${promotion.discount_value} TL indirim`;

  let sent = 0;
  let failed = 0;
  const BATCH = 10;

  for (let i = 0; i < validCustomers.length; i += BATCH) {
    const batch = validCustomers.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (customer) => {
        const to = normalizeEmail(customer.email);
        const customerName = normalizeText(customer.full_name, 180) || '';
        try {
          await sendEmail({
            to,
            subject: `Özel İndirim Kodunuz: ${promotion.code}`,
            html: couponBroadcastTemplate({
              customerName,
              couponCode: promotion.code,
              couponTitle: promotion.title,
              discountText,
            }),
          });
          sent++;
        } catch (err) {
          console.error('[coupon-broadcast] email failed:', to, err?.message || err);
          failed++;
        }
      })
    );
  }

  await writeAuditLog(config, req, auth, 'coupon.broadcast', {
    promotion_id: promotionId,
    code: promotion.code,
    sent,
    failed,
    total: validCustomers.length,
  }, { entityType: 'promotion', entityId: promotionId });

  return sendSuccess(res, { sent, failed, total: validCustomers.length }, 200);
}

const migrationHandler = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 2,
  },
  handleMigrations
);

const authenticatedHandler = createApiHandler(
  {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    requireAuth: true,
    rateLimit: 240,
    roles: STAFF_ROLES,
  },
  async (req, res, ctx) => {
    const routeKey = getRouteKey(req);
    if (routeKey === 'me') return handleMe(req, res, ctx);
    if (routeKey === 'products') return handleProducts(req, res, ctx);
    if (routeKey === 'product-variants') return handleProductVariants(req, res, ctx);
    if (routeKey === 'products-bulk') return handleProductsBulk(req, res, ctx);
    if (routeKey === 'products-price-bulk') return handleProductsPriceBulk(req, res, ctx);
    if (routeKey === 'orders') return handleOrders(req, res, ctx);
    if (routeKey === 'order-status') return handleOrderStatus(req, res, ctx);
    if (routeKey === 'analytics') return handleAnalytics(req, res, ctx);
    if (routeKey === 'users') return handleUsers(req, res, ctx);
    if (routeKey === 'customers') return handleCustomers(req, res, ctx);
    if (routeKey === 'site-settings') return handleSiteSettings(req, res, ctx);
    if (routeKey === 'subscriptions') return handleSubscriptions(req, res, ctx);
    if (routeKey === 'promotions') return handlePromotions(req, res, ctx);
    if (routeKey === 'marketing-emails') return handleMarketingEmails(req, res, ctx);
    if (routeKey === 'marketplace-connections') return handleMarketplaceConnections(req, res, ctx);
    if (routeKey === 'marketplace-sync') return handleMarketplaceSync(req, res, ctx);
    if (routeKey === 'support-tickets') return handleSupportTickets(req, res, ctx);
    if (routeKey === 'support-messages') return handleSupportMessages(req, res, ctx);
    if (routeKey === 'financial-summary') return handleFinancialSummary(req, res, ctx);
    if (routeKey === 'ai-product-parse') return handleAiProductParse(req, res, ctx);
    if (routeKey === 'ai-support-reply') return handleAiSupportReply(req, res, ctx);
    if (routeKey === 'audit-logs') return handleAuditLogs(req, res, ctx);
    if (routeKey === 'shipping') return handleShipping(req, res, ctx);
    if (routeKey === 'verify-logout') return handleVerifyLogout(req, res, ctx);
    if (routeKey === 'upload-image') return handleUploadImage(req, res, ctx);
    if (routeKey === 'returns') return require('../../lib/handlers/admin-returns')(req, res);
    if (routeKey === 'refunds') return require('../../lib/handlers/admin-refunds')(req, res);
    if (routeKey === 'coupon-broadcast') return handleCouponBroadcast(req, res, ctx);

    if (routeKey === 'rbac' || routeKey === 'payments' || routeKey === 'feature-flags') {
      return notImplemented(res, routeKey);
    }

    return sendError(res, 404, `Unknown admin route: ${routeKey || '(root)'}`, 'ADMIN_ROUTE_NOT_FOUND');
  }
);

const loginHandler = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 10,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }

    const parsed = await readJsonBody(req);
    const body = parsed?.body || {};
    const email = normalizeEmail(body.email);
    const password = normalizeText(body.password, 256);

    if (!email || !password) {
      return sendError(res, 400, 'Email and password required', 'VALIDATION_ERROR');
    }

    try {
      const config = assertSupabaseConfig();
      const authResult = await authPasswordGrant(config, email, password);
      if (!authResult.ok) {
        return sendError(res, authResult.status, authResult.error, authResult.code);
      }

      const appRole = String(authResult.user?.app_metadata?.role || authResult.user?.user_metadata?.role || '').toLowerCase();
      if (hasAllowedLoginRole(appRole)) {
        return sendSuccess(res, {
          token: authResult.token,
          user: { id: authResult.user.id, email: authResult.user.email },
        });
      }

      const rows = await restSelect(config, 'user_profiles', {
        select: 'id,role,is_active',
        id: `eq.${authResult.user.id}`,
        limit: 1,
      }).catch(() => []);
      const profile = Array.isArray(rows) ? rows[0] : null;
      if (!profile || !hasAllowedLoginRole(profile.role) || profile.is_active === false) {
        return sendError(res, 403, 'Not authorized', 'AUTH_FORBIDDEN');
      }

      return sendSuccess(res, {
        token: authResult.token,
        user: { id: authResult.user.id, email: authResult.user.email },
      });
    } catch (err) {
      console.error('Login error:', err);
      return sendError(res, 500, 'Login failed', 'AUTH_ERROR');
    }
  }
);

module.exports = async function adminRouteHandler(req, res) {
  const routeKey = getRouteKey(req);
  if (routeKey === 'login') return loginHandler(req, res);
  if (routeKey === 'migrations') return migrationHandler(req, res);
  return authenticatedHandler(req, res);
};

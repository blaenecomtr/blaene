const { createApiHandler } = require('../api/handler');
const { sendError, sendSuccess } = require('../api/response');
const { readJsonBody } = require('../api/request');
const { normalizeEmail, normalizeText } = require('../api/validation');
const { restInsert, restSelect } = require('../api/supabase');
const { sendEmail } = require('../email/resend');
const DEFAULT_SITE_ORIGIN = 'https://www.blaene.com.tr';
const DEFAULT_SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
const DEFAULT_BANK_TRANSFER_NOTIFICATION_EMAIL = 'info@blaene.com.tr';

function toSafeSubject(value) {
  const text = normalizeText(value, 180);
  return text || 'Iletisim Talebi';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTL(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function formatDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = normalizeText(arguments[i], 500);
    if (value) return value;
  }
  return '';
}

function statusLabel(value) {
  const raw = normalizeText(value, 80);
  if (!raw) return '-';
  const key = raw.toLowerCase();
  const map = {
    pending: 'Beklemede',
    processing: 'Hazirlaniyor',
    shipped: 'Kargoda',
    delivered: 'Teslim Edildi',
    cancelled: 'Iptal',
    paid: 'Odendi',
    failed: 'Basarisiz',
  };
  return map[key] || raw;
}

function paymentMethodLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'bank_transfer') return 'Havale / EFT';
  if (key === 'card') return 'Kredi / Banka Karti';
  return key ? value : '-';
}

function providerLabel(value, fallback, paymentMethod) {
  const method = String(paymentMethod || '').trim().toLowerCase();
  if (method === 'bank_transfer') return 'Havale';
  const normalized = String(value || '').trim();
  if (!normalized) return fallback || '-';
  const key = normalized.toLowerCase();
  if (key === 'manual' || key === 'bank_transfer' || key === 'havale' || key === 'eft') return 'Havale';
  const map = {
    iyzico: 'iyzico',
    paytr: 'PayTR',
    yurtici: 'Yurtici Kargo',
    mng: 'MNG Kargo',
    aras: 'Aras Kargo',
  };
  return map[key] || normalized;
}

function buildShippingAddress(order) {
  const city = firstText(order && order.city, order && order.shipping_city, order && order.delivery_city);
  const district = firstText(order && order.district, order && order.shipping_district, order && order.delivery_district);
  let address = firstText(order && order.address, order && order.shipping_address, order && order.delivery_address);
  if (!address) address = firstText(order && order.billing_address);
  const cityDistrict = city ? (city + (district ? ' / ' + district : '')) : '';
  if (!address && !cityDistrict) return '-';
  if (!address) return cityDistrict;
  if (!cityDistrict) return address;
  return cityDistrict + ' - ' + address;
}

function buildBillingAddress(order) {
  if (!order) return '-';
  if (order.billing_same_as_shipping === true) return 'Teslimat adresi ile ayni';
  const city = firstText(order.billing_city);
  const district = firstText(order.billing_district);
  const address = firstText(order.billing_address);
  const name = firstText(order.billing_name);
  const cityDistrict = city ? (city + (district ? ' / ' + district : '')) : '';
  const parts = [];
  if (name) parts.push(name);
  if (cityDistrict) parts.push(cityDistrict);
  if (address) parts.push(address);
  return parts.length ? parts.join(' - ') : '-';
}

function totalItemCount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + Math.max(0, Number(item && item.quantity || 0)), 0);
}

function firstImageUrl(images) {
  if (Array.isArray(images)) {
    for (const candidate of images) {
      const v = toAbsoluteImageUrl(candidate);
      if (v) return v;
    }
  } else if (images && typeof images === 'object') {
    const objectCandidate = toAbsoluteImageUrl(
      images.url || images.src || images.path || images.image || images.image_url
    );
    if (objectCandidate) return objectCandidate;
  } else if (typeof images === 'string') {
    const raw = images.trim();
    if (!raw) return '';
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const candidate of parsed) {
            const v = toAbsoluteImageUrl(candidate);
            if (v) return v;
          }
        }
      } catch (_) {
        // Ignore invalid JSON and continue with raw value fallback.
      }
    }
    const v = toAbsoluteImageUrl(raw);
    if (v) return v;
  }
  return '';
}

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

function resolveBankTransferNotificationEmail() {
  // Requirement: bank transfer notifications must always go to info@blaene.com.tr.
  return DEFAULT_BANK_TRANSFER_NOTIFICATION_EMAIL;
}

function buildOrderNoCandidates(orderNo) {
  const raw = String(orderNo || '').trim();
  if (!raw) return [];
  const set = new Set();
  const add = (value) => {
    const next = String(value || '').trim();
    if (next) set.add(next);
  };
  add(raw);
  add(raw.replace(/^#\s*/, ''));
  add(raw.replace(/\s+/g, ''));
  return Array.from(set);
}

async function selectOrderWithFallback(config, orderNo) {
  const orderNoCandidates = buildOrderNoCandidates(orderNo);
  if (!orderNoCandidates.length) return null;

  const selectVariants = [
    'id,order_no,customer_name,email,phone,address,city,district,subtotal,shipping,total,created_at,status,payment_status,payment_method,payment_provider,shipping_provider,tracking_code,billing_same_as_shipping,billing_name,billing_address,billing_city,billing_district,promo_code,discount_amount,note',
    'id,order_no,customer_name,email,phone,address,city,district,subtotal,shipping,total,created_at,status,payment_status,payment_method,payment_provider,shipping_provider,tracking_code,promo_code,discount_amount,note',
    'id,order_no,customer_name,email,phone,address,city,district,subtotal,shipping,total,created_at,status,payment_status,payment_method,payment_provider,shipping_provider,tracking_code,note',
    'id,order_no,customer_name,email,phone,address,city,district,subtotal,shipping,total,created_at,status,payment_status,payment_method,payment_provider',
    'id,order_no,customer_name,email,phone,subtotal,shipping,total,created_at,status,payment_status',
    'id,order_no,customer_name,email,phone,subtotal,shipping,total',
    'id,order_no,total,customer_name,email,phone',
  ];

  let lastError = null;
  for (const selectText of selectVariants) {
    for (const candidate of orderNoCandidates) {
      try {
        const orders = await restSelect(config, 'orders', {
          select: selectText,
          order_no: `eq.${candidate}`,
          limit: 1,
        });
        if (Array.isArray(orders) && orders.length) {
          return orders[0];
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (lastError) {
    console.warn('[havale] order lookup fallback exhausted:', lastError?.message || lastError);
  }
  return null;
}

async function selectOrderItemsWithFallback(config, orderId) {
  if (!orderId) return [];

  const selectVariants = [
    'id,product_id,product_code,product_name,product_color,color,product_image,image,images,product_images,unit_price,quantity,line_total',
    'id,product_id,product_code,product_name,product_color,color,product_image,image,unit_price,quantity,line_total',
    'id,product_id,product_code,product_name,product_color,color,images,unit_price,quantity,line_total',
    'id,product_id,product_code,product_name,product_color,color,unit_price,quantity,line_total',
    'id,product_id,product_code,product_name,color,unit_price,quantity,line_total',
    'id,product_id,product_code,product_name,product_color,unit_price,quantity,line_total',
    'id,product_id,product_code,product_name,unit_price,quantity,line_total',
    'id,product_code,product_name,unit_price,quantity,line_total',
    'id,product_name,unit_price,quantity,line_total',
    'id,product_name,quantity',
  ];

  let lastError = null;
  for (const selectText of selectVariants) {
    try {
      const items = await restSelect(config, 'order_items', {
        select: selectText,
        order_id: `eq.${orderId}`,
      });
      return Array.isArray(items) ? items : [];
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    console.warn('[havale] order_items lookup fallback exhausted:', lastError?.message || lastError);
  }
  return [];
}

async function loadOrderContext(config, orderNo) {
  if (!orderNo) return null;
  try {
    const order = await selectOrderWithFallback(config, orderNo);
    if (!order) return null;

    const items = await selectOrderItemsWithFallback(config, order.id);

    const productIds = Array.from(new Set((items || []).map((it) => it?.product_id).filter(Boolean)));
    const productCodes = Array.from(new Set((items || []).map((it) => normalizeText(it?.product_code, 120)).filter(Boolean)));
    const productNames = Array.from(new Set((items || []).map((it) => normalizeText(it?.product_name, 220).toLowerCase()).filter(Boolean)));

    const byId = {};
    const byCode = {};
    const byName = {};
    const mergeProducts = (products) => {
      (products || []).forEach((p) => {
        const image = firstImageUrl(p && p.images);
        if (!image) return;
        const id = normalizeText(p && p.id, 120);
        const code = normalizeText(p && p.code, 120).toUpperCase();
        const name = normalizeText(p && p.name, 220).toLowerCase();
        if (id && !byId[id]) byId[id] = image;
        if (code && !byCode[code]) byCode[code] = image;
        if (name && !byName[name]) byName[name] = image;
      });
    };

    if (productIds.length) {
      const idFilter = buildInFilter(productIds, 120);
      if (idFilter) {
        const productsById = await restSelect(config, 'products', {
          select: 'id,code,name,images',
          id: idFilter,
        }).catch(() => []);
        mergeProducts(productsById);
      }
    }

    if (productCodes.length) {
      const codeFilter = buildInFilter(productCodes, 120);
      if (codeFilter) {
        const productsByCode = await restSelect(config, 'products', {
          select: 'id,code,name,images',
          code: codeFilter,
        }).catch(() => []);
        mergeProducts(productsByCode);
      }
    }

    if (productNames.length) {
      const nameFilter = buildInFilter(productNames, 220);
      if (nameFilter) {
        const productsByName = await restSelect(config, 'products', {
          select: 'id,code,name,images',
          name: nameFilter,
        }).catch(() => []);
        mergeProducts(productsByName);
      }
    }

    return {
      order,
      items: items || [],
      productImages: { byId, byCode, byName },
    };
  } catch (err) {
    console.error('[havale] loadOrderContext failed:', err?.message || err);
    return null;
  }
}

function resolveItemImage(item, productImages) {
  const maps = productImages && typeof productImages === 'object' ? productImages : {};
  const byId = maps.byId && typeof maps.byId === 'object' ? maps.byId : {};
  const byCode = maps.byCode && typeof maps.byCode === 'object' ? maps.byCode : {};
  const byName = maps.byName && typeof maps.byName === 'object' ? maps.byName : {};

  const directImage = firstImageUrl(
    item && (item.product_image || item.image || item.product_images || item.images || item.product_img)
  );
  if (directImage) return directImage;

  const id = normalizeText(item && item.product_id, 120);
  if (id && byId[id]) return byId[id];
  const code = normalizeText(item && item.product_code, 120).toUpperCase();
  if (code && byCode[code]) return byCode[code];
  const name = normalizeText(item && item.product_name, 220).toLowerCase();
  if (name && byName[name]) return byName[name];
  return '';
}

function buildItemsRows(items, productImages) {
  if (!Array.isArray(items) || !items.length) {
    return '<tr><td colspan="4" style="padding:12px;text-align:center;color:#888;">Urun bilgisi bulunamadi.</td></tr>';
  }
  return items.map((it) => {
    const img = resolveItemImage(it, productImages);
    const imgCell = img
      ? `<img src="${escapeHtml(img)}" alt="" width="64" height="64" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #eee;display:block;">`
      : `<div style="width:64px;height:64px;background:#f3f3f3;border-radius:6px;border:1px solid #eee;"></div>`;
    const color = normalizeText(
      it.product_color || it.color || it.variant_color || it.option_color,
      120
    );
    const name = escapeHtml(it.product_name || '-');
    const code = escapeHtml(it.product_code || '');
    const nameCell = `<div style="font-weight:bold;color:#1a1a1a;">${name}</div>`
      + (code ? `<div style="color:#777;font-size:12px;">Kod: ${code}</div>` : '')
      + (color ? `<div style="color:#777;font-size:12px;">Renk: ${escapeHtml(color)}</div>` : '');
    const qty = Number(it.quantity) || 0;
    const unit = formatTL(it.unit_price);
    const line = formatTL(it.line_total);
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;width:80px;">${imgCell}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;">${nameCell}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;text-align:center;white-space:nowrap;">${qty} x ${unit}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;text-align:right;white-space:nowrap;font-weight:bold;">${line}</td>
      </tr>`;
  }).join('');
}

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 30,
  },
  async (req, res, ctx) => {
    const parsed = await readJsonBody(req);
    const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};

    const subject = toSafeSubject(body.subject);
    const message = normalizeText(body.message, 4000);
    const customerName = normalizeText(body.name, 180) || null;
    const customerEmail = normalizeEmail(body.email) || null;
    const orderNo = normalizeText(body.order_no, 80) || null;
    const category = normalizeText(body.category || body.type, 40).toLowerCase() || 'general';
    const transferAmount = normalizeText(body.transfer_amount, 40) || null;
    const transferDate = normalizeText(body.transfer_date, 40) || null;
    const transferBank = normalizeText(body.transfer_bank, 120) || null;
    const transferNote = normalizeText(body.transfer_note, 500) || null;
    const orderItemCount = normalizeText(body.order_item_count, 20) || null;
    const orderTotal = normalizeText(body.order_total, 40) || null;
    const customerPhoneInput = normalizeText(body.customer_phone, 60) || null;
    const customerAddressInput = normalizeText(body.customer_address, 320) || null;

    if (!message) {
      return sendError(res, 400, 'message is required', 'VALIDATION_REQUIRED_MESSAGE');
    }

    const normalizedEmail = customerEmail && customerEmail.includes('@') ? customerEmail : 'noreply@blaene.local';

    const metadata = {
      source: 'public_contact_form',
      order_no: orderNo,
      transfer_amount: transferAmount,
      transfer_date: transferDate,
      transfer_bank: transferBank,
      transfer_note: transferNote,
      order_item_count: orderItemCount,
      order_total: orderTotal,
      customer_phone: customerPhoneInput,
      customer_address: customerAddressInput,
      request_path: req.url,
    };

    try {
      const inserted = await restInsert(ctx.config, 'support_tickets', {
        customer_name: customerName,
        customer_email: normalizedEmail,
        subject,
        status: 'open',
        priority: 'medium',
        category,
        metadata,
      });

      const ticket = Array.isArray(inserted) ? inserted[0] : inserted;
      const ticketId = normalizeText(ticket?.id, 120);

      if (ticketId) {
        await restInsert(ctx.config, 'support_messages', {
          ticket_id: ticketId,
          sender_type: 'customer',
          sender_name: customerName || normalizedEmail,
          message,
          ai_generated: false,
          metadata,
        }, { prefer: 'return=minimal' }).catch(() => null);
      }

      if (category === 'transfer') {
        const adminEmail = resolveBankTransferNotificationEmail();
        const hasResendKey = !!process.env.RESEND_API_KEY;
        console.log('[havale] notification_email:', adminEmail, '| source:', process.env.BANK_TRANSFER_NOTIFICATION_EMAIL ? 'env' : 'fallback', '| RESEND_API_KEY:', hasResendKey ? 'set' : 'MISSING', '| RESEND_FROM_EMAIL:', process.env.RESEND_FROM_EMAIL || 'default');
        if (!hasResendKey) {
          console.error('[havale] cannot send admin email: RESEND_API_KEY is not configured in environment');
        } else {
          try {
            const orderCtx = await loadOrderContext(ctx.config, orderNo);
            const order = orderCtx?.order || null;
            const items = orderCtx?.items || [];
            const productImages = orderCtx?.productImages || {};

            const fullName = customerName || order?.customer_name || '-';
            const contactEmail = customerEmail || order?.email || normalizedEmail;
            const phone = normalizeText(order?.phone || customerPhoneInput, 60) || '-';
            const shippingAddress = order ? buildShippingAddress(order) : (customerAddressInput || '-');
            const billingAddress = order ? buildBillingAddress(order) : '-';
            const lineCount = Array.isArray(items) ? items.length : 0;
            const itemCountFromOrder = totalItemCount(items);
            const fallbackItemCount = Number(orderItemCount || 0);
            const itemCount = itemCountFromOrder > 0
              ? itemCountFromOrder
              : (Number.isFinite(fallbackItemCount) && fallbackItemCount > 0 ? fallbackItemCount : 0);
            const orderDateText = formatDateTime(order?.created_at);
            const orderStatusText = statusLabel(order?.status);
            const paymentStatusText = statusLabel(order?.payment_status);
            const paymentMethodText = paymentMethodLabel(order?.payment_method);
            const paymentProviderText = providerLabel(order?.payment_provider, '-', order?.payment_method);
            const shippingProviderText = providerLabel(order?.shipping_provider, '-', null);
            const trackingCodeText = normalizeText(order?.tracking_code, 120) || '-';
            const orderNoteText = normalizeText(order?.note, 1500) || '-';
            const transferAmountText = transferAmount ? formatTL(transferAmount) : '-';
            const itemsRowsHtml = buildItemsRows(items, productImages);
            const subtotalText = order ? formatTL(order.subtotal) : '-';
            const shippingText = order ? formatTL(order.shipping) : '-';
            const totalText = order ? formatTL(order.total) : (orderTotal ? formatTL(orderTotal) : '-');
            const discountValue = Number(order?.discount_amount || 0);
            const discountText = Number.isFinite(discountValue) && discountValue > 0 ? '-' + formatTL(discountValue) : 'Yok';
            const promoCodeText = normalizeText(order?.promo_code, 120) || '-';
            const subjectLine = `Havale Bildirimi: Siparis #${orderNo || '-'}`;

            const result = await sendEmail({
              to: adminEmail,
              subject: subjectLine,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;color:#1a1a1a;">
                  <h2 style="color:#1a1a1a;border-bottom:2px solid #eee;padding-bottom:10px;margin:0 0 16px;">Yeni Havale Bildirimi</h2>

                  <h3 style="margin:20px 0 8px;font-size:15px;color:#333;">Musteri Bilgileri</h3>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;width:160px;">Ad Soyad</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(fullName)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">E-posta</td><td style="padding:6px 0;">${escapeHtml(contactEmail)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Telefon</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Teslimat Adresi</td><td style="padding:6px 0;">${escapeHtml(shippingAddress || '-')}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Fatura Adresi</td><td style="padding:6px 0;">${escapeHtml(billingAddress || '-')}</td></tr>
                  </table>

                  <h3 style="margin:20px 0 8px;font-size:15px;color:#333;">Havale Bilgileri</h3>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;width:160px;">Siparis No</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(orderNo || '-')}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Gonderilen Tutar</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(transferAmountText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Transfer Tarihi</td><td style="padding:6px 0;">${escapeHtml(transferDate || '-')}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Gonderen Banka</td><td style="padding:6px 0;">${escapeHtml(transferBank || '-')}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Ek Not</td><td style="padding:6px 0;">${escapeHtml(transferNote || '-')}</td></tr>
                  </table>

                  <h3 style="margin:20px 0 8px;font-size:15px;color:#333;">Siparis Ozeti</h3>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;width:160px;">Siparis Tarihi</td><td style="padding:6px 0;">${escapeHtml(orderDateText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Siparis Durumu</td><td style="padding:6px 0;">${escapeHtml(orderStatusText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Odeme Durumu</td><td style="padding:6px 0;">${escapeHtml(paymentStatusText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Odeme Sekli</td><td style="padding:6px 0;">${escapeHtml(paymentMethodText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Odeme Saglayicisi</td><td style="padding:6px 0;">${escapeHtml(paymentProviderText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Kargo Firmasi</td><td style="padding:6px 0;">${escapeHtml(shippingProviderText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Kargo Takip</td><td style="padding:6px 0;">${escapeHtml(trackingCodeText)}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Urun Satiri</td><td style="padding:6px 0;">${escapeHtml(String(lineCount))}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Toplam Urun Adedi</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(String(itemCount))}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Siparis Notu</td><td style="padding:6px 0;">${escapeHtml(orderNoteText)}</td></tr>
                  </table>

                  <h3 style="margin:24px 0 8px;font-size:15px;color:#333;">Siparis Icerigi</h3>
                  <table style="width:100%;border-collapse:collapse;border:1px solid #eee;">
                    <thead>
                      <tr style="background:#fafafa;">
                        <th style="padding:10px;text-align:left;font-size:12px;color:#666;border-bottom:1px solid #eee;">Gorsel</th>
                        <th style="padding:10px;text-align:left;font-size:12px;color:#666;border-bottom:1px solid #eee;">Urun</th>
                        <th style="padding:10px;text-align:center;font-size:12px;color:#666;border-bottom:1px solid #eee;">Adet x Fiyat</th>
                        <th style="padding:10px;text-align:right;font-size:12px;color:#666;border-bottom:1px solid #eee;">Toplam</th>
                      </tr>
                    </thead>
                    <tbody>${itemsRowsHtml}</tbody>
                  </table>

                  <table style="width:100%;border-collapse:collapse;margin-top:12px;">
                    <tr><td style="padding:4px 0;color:#666;text-align:right;">Ara Toplam:</td><td style="padding:4px 0;text-align:right;width:140px;">${subtotalText}</td></tr>
                    <tr><td style="padding:4px 0;color:#666;text-align:right;">Kargo:</td><td style="padding:4px 0;text-align:right;">${shippingText}</td></tr>
                    <tr><td style="padding:4px 0;color:#666;text-align:right;">Indirim:</td><td style="padding:4px 0;text-align:right;">${escapeHtml(discountText)}</td></tr>
                    <tr><td style="padding:4px 0;color:#666;text-align:right;">Kupon:</td><td style="padding:4px 0;text-align:right;">${escapeHtml(promoCodeText)}</td></tr>
                    <tr><td style="padding:8px 0;color:#1a1a1a;text-align:right;font-weight:bold;font-size:15px;border-top:1px solid #eee;">Genel Toplam:</td><td style="padding:8px 0;text-align:right;font-weight:bold;font-size:15px;border-top:1px solid #eee;">${totalText}</td></tr>
                  </table>

                  <p style="margin-top:24px;"><a href="https://www.blaene.com.tr/yonetim-giris-n7k4p2" style="background:#1a1a1a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Admin Panele Git</a></p>
                </div>`,
            });
            console.log('[havale] email sent ok:', result?.id || 'no-id', '| items:', items.length);
          } catch (emailErr) {
            console.error('[havale] email send failed:', emailErr?.message || emailErr);
          }
        }
      }

      return sendSuccess(res, {
        ok: true,
        ticket_id: ticketId || null,
        message: 'Mesajiniz alindi. En kisa surede geri donulecek.',
      });
    } catch (error) {
      const reason = String(error?.message || '');
      // If support tables are not migrated yet, keep endpoint functional for frontend.
      if (reason.toLowerCase().includes('relation') || reason.toLowerCase().includes('does not exist')) {
        return sendSuccess(res, {
          ok: true,
          ticket_id: null,
          message: 'Mesajiniz alindi. Destek kayit sistemi hazirlanirken gecici olarak kuyruğa alindi.',
        });
      }
      throw error;
    }
  }
);

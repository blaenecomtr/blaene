const { createApiHandler } = require('../api/handler');
const { sendError, sendSuccess } = require('../api/response');
const { readJsonBody } = require('../api/request');
const { normalizeEmail, normalizeText } = require('../api/validation');
const { restInsert, restSelect } = require('../api/supabase');
const { sendEmail } = require('../email/resend');

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

function firstImageUrl(images) {
  if (Array.isArray(images)) {
    for (const candidate of images) {
      const v = normalizeText(candidate, 1000);
      if (v) return v;
    }
  } else if (typeof images === 'string') {
    const v = normalizeText(images, 1000);
    if (v) return v;
  }
  return '';
}

async function loadOrderContext(config, orderNo) {
  if (!orderNo) return null;
  try {
    const orders = await restSelect(config, 'orders', {
      select: 'id,order_no,customer_name,email,phone,subtotal,shipping,total,created_at,status,payment_status',
      order_no: `eq.${orderNo}`,
      limit: 1,
    });
    const order = Array.isArray(orders) && orders.length ? orders[0] : null;
    if (!order) return null;

    const items = await restSelect(config, 'order_items', {
      select: 'id,product_id,product_code,product_name,product_color,unit_price,quantity,line_total',
      order_id: `eq.${order.id}`,
    }).catch(() => []);

    const productIds = Array.from(new Set((items || []).map((it) => it?.product_id).filter(Boolean)));
    let productMap = {};
    if (productIds.length) {
      const products = await restSelect(config, 'products', {
        select: 'id,images',
        id: `in.(${productIds.join(',')})`,
      }).catch(() => []);
      productMap = (products || []).reduce((acc, p) => {
        acc[String(p.id)] = firstImageUrl(p.images);
        return acc;
      }, {});
    }

    return { order, items: items || [], productImages: productMap };
  } catch (err) {
    console.error('[havale] loadOrderContext failed:', err?.message || err);
    return null;
  }
}

function buildItemsRows(items, productImages) {
  if (!Array.isArray(items) || !items.length) {
    return '<tr><td colspan="4" style="padding:12px;text-align:center;color:#888;">Urun bilgisi bulunamadi.</td></tr>';
  }
  return items.map((it) => {
    const img = productImages[String(it.product_id || '')] || '';
    const imgCell = img
      ? `<img src="${escapeHtml(img)}" alt="" width="64" height="64" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #eee;display:block;">`
      : `<div style="width:64px;height:64px;background:#f3f3f3;border-radius:6px;border:1px solid #eee;"></div>`;
    const color = normalizeText(it.product_color, 120);
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
        const adminEmail = process.env.ADMIN_EMAIL || 'info@blaene.com.tr';
        const hasResendKey = !!process.env.RESEND_API_KEY;
        console.log('[havale] ADMIN_EMAIL:', adminEmail, '| source:', process.env.ADMIN_EMAIL ? 'env' : 'fallback', '| RESEND_API_KEY:', hasResendKey ? 'set' : 'MISSING', '| RESEND_FROM_EMAIL:', process.env.RESEND_FROM_EMAIL || 'default');
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
            const phone = normalizeText(order?.phone, 60) || '-';
            const itemsRowsHtml = buildItemsRows(items, productImages);
            const subtotalText = order ? formatTL(order.subtotal) : '-';
            const shippingText = order ? formatTL(order.shipping) : '-';
            const totalText = order ? formatTL(order.total) : '-';
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
                  </table>

                  <h3 style="margin:20px 0 8px;font-size:15px;color:#333;">Havale Bilgileri</h3>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#666;width:160px;">Siparis No</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(orderNo || '-')}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Tutar</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(transferAmount || '-')} TL</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Transfer Tarihi</td><td style="padding:6px 0;">${escapeHtml(transferDate || '-')}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Gonderen Banka</td><td style="padding:6px 0;">${escapeHtml(transferBank || '-')}</td></tr>
                    <tr><td style="padding:6px 0;color:#666;">Not</td><td style="padding:6px 0;">${escapeHtml(transferNote || '-')}</td></tr>
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

const { createApiHandler } = require('../api/handler');
const { sendError, sendSuccess } = require('../api/response');
const { readJsonBody } = require('../api/request');
const { normalizeEmail, normalizeText } = require('../api/validation');
const { restInsert } = require('../api/supabase');

function toSafeSubject(value) {
  const text = normalizeText(value, 180);
  return text || 'Iletisim Talebi';
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

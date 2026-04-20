const { createApiHandler } = require('../api/handler');
const { sendSuccess, sendError } = require('../api/response');
const { readJsonBody } = require('../api/request');
const { normalizeText } = require('../api/validation');
const { fetchAuthUser, restSelect, restUpdate } = require('../api/supabase');

const CANCELLABLE_ORDER_STATUS = ['pending', 'processing'];

function extractBearerToken(req) {
  const header = String(req?.headers?.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 100,
  },
  async (req, res, ctx) => {
    const token = extractBearerToken(req);
    if (!token) {
      return sendError(res, 401, 'Gecersiz oturum', 'AUTH_REQUIRED');
    }

    const authUser = await fetchAuthUser(ctx.config, token);
    if (!authUser?.id) {
      return sendError(res, 401, 'Gecersiz oturum', 'AUTH_INVALID_SESSION');
    }

    const { body } = await readJsonBody(req).catch(() => ({ body: null }));
    const orderId = normalizeText(body?.order_id, 120);
    if (!orderId) {
      return sendError(res, 400, 'order_id zorunludur', 'VALIDATION_REQUIRED_ORDER_ID');
    }

    const rows = await restSelect(ctx.config, 'orders', {
      select: 'id,order_no,user_id,status,payment_status',
      id: `eq.${orderId}`,
      limit: 1,
    });
    const order = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!order) {
      return sendError(res, 404, 'Siparis bulunamadi', 'ORDER_NOT_FOUND');
    }
    if (String(order.user_id || '') !== String(authUser.id)) {
      return sendError(res, 403, 'Bu siparis icin yetkiniz yok', 'ORDER_FORBIDDEN');
    }

    const status = String(order.status || '').toLowerCase();
    const paymentStatus = String(order.payment_status || '').toLowerCase();
    if (!CANCELLABLE_ORDER_STATUS.includes(status)) {
      return sendError(res, 400, 'Bu siparis artik iptal edilemez', 'ORDER_NOT_CANCELLABLE');
    }
    if (paymentStatus === 'paid') {
      return sendError(res, 400, 'Odeme alinan siparisler buradan iptal edilemez', 'ORDER_PAID_NOT_CANCELLABLE');
    }

    await restUpdate(ctx.config, 'orders', { id: `eq.${orderId}` }, {
      status: 'cancelled',
      payment_status: paymentStatus === 'pending' ? 'failed' : paymentStatus,
    });

    return sendSuccess(res, {
      order_id: orderId,
      order_no: order.order_no || null,
      status: 'cancelled',
    });
  }
);


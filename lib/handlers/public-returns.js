const { createApiHandler } = require('../api/handler');
const { sendError, sendSuccess } = require('../api/response');
const { readJsonBody } = require('../api/request');
const { normalizeText } = require('../api/validation');
const { restInsert, restSelect } = require('../api/supabase');
const { writeAuditLog } = require('../api/audit');

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const productCode = normalizeText(item.product_code || item.productCode, 80);
      const productName = normalizeText(item.product_name || item.productName, 180);
      const quantity = Math.max(1, Number(item.quantity || 1));
      const reason = normalizeText(item.reason, 300);
      if (!productCode && !productName) return null;
      return {
        product_code: productCode || null,
        product_name: productName || null,
        quantity,
        reason: reason || null,
      };
    })
    .filter(Boolean);
}

module.exports = createApiHandler(
  {
    methods: ['GET', 'POST'],
    requireAuth: true,
    rateLimit: 60,
  },
  async (req, res, ctx) => {
    const { config, auth } = ctx;
    const userId = normalizeText(auth?.user?.id, 120);
    if (!userId) {
      return sendError(res, 401, 'Unauthorized', 'AUTH_REQUIRED');
    }

    if (req.method === 'GET') {
      const query = new URL(req.url, 'http://localhost').searchParams;
      const status = normalizeText(query.get('status'), 40).toLowerCase();

      let rows = [];
      try {
        rows = await restSelect(config, 'return_requests', {
          select: '*',
          user_id: `eq.${userId}`,
          order: 'created_at.desc',
          limit: 500,
        });
      } catch (error) {
        const message = String(error?.message || '');
        if (message.toLowerCase().includes('relation')) {
          return sendSuccess(res, []);
        }
        throw error;
      }

      if (status && status !== 'all') {
        rows = rows.filter((row) => String(row.status || '').toLowerCase() === status);
      }

      return sendSuccess(res, rows);
    }

    const parsed = await readJsonBody(req);
    const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
    const orderId = normalizeText(body.order_id, 120);
    const reason = normalizeText(body.reason, 600);
    const details = normalizeText(body.details, 2000) || null;
    const refundAmount = Number.isFinite(Number(body.refund_amount))
      ? Math.max(0, Math.round(Number(body.refund_amount) * 100) / 100)
      : 0;
    const requestedItems = sanitizeItems(body.requested_items);

    if (!orderId) {
      return sendError(res, 400, 'order_id is required', 'VALIDATION_REQUIRED_ORDER_ID');
    }
    if (!reason) {
      return sendError(res, 400, 'reason is required', 'VALIDATION_REQUIRED_REASON');
    }

    const orderRows = await restSelect(config, 'orders', {
      select: 'id,order_no,user_id,customer_name,email,phone,payment_status,status,total',
      id: `eq.${orderId}`,
      user_id: `eq.${userId}`,
      limit: 1,
    });
    if (!orderRows.length) {
      return sendError(res, 404, 'Order not found', 'ORDER_NOT_FOUND');
    }
    const order = orderRows[0];
    const orderStatus = String(order.status || '').toLowerCase();
    if (orderStatus && orderStatus !== 'delivered') {
      return sendError(
        res,
        409,
        'Iade talebi yalnizca teslim edilen siparisler icin olusturulabilir.',
        'RETURN_ORDER_NOT_DELIVERED'
      );
    }

    const existing = await restSelect(config, 'return_requests', {
      select: 'id,status',
      order_id: `eq.${orderId}`,
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
      limit: 1,
    }).catch(() => []);
    if (Array.isArray(existing) && existing.length) {
      const latest = existing[0];
      const status = String(latest?.status || '').toLowerCase();
      if (['pending', 'approved', 'in_transit', 'received'].includes(status)) {
        return sendError(
          res,
          409,
          'Bu siparis icin acik bir iade talebiniz zaten bulunuyor.',
          'RETURN_ALREADY_EXISTS'
        );
      }
    }

    const insertPayload = {
      order_id: order.id,
      order_no: order.order_no,
      user_id: userId,
      customer_name: normalizeText(order.customer_name, 180) || null,
      customer_email: normalizeText(order.email, 220) || null,
      customer_phone: normalizeText(order.phone, 80) || null,
      reason,
      details,
      requested_items: requestedItems,
      status: 'pending',
      refund_amount: refundAmount,
    };

    try {
      const inserted = await restInsert(config, 'return_requests', insertPayload);
      const row = Array.isArray(inserted) ? inserted[0] : inserted;

      await writeAuditLog(config, req, auth, 'returns.request.create', {
        order_id: order.id,
        return_request_id: row?.id || null,
      }, {
        entityType: 'return_request',
        entityId: row?.id || null,
      });

      return sendSuccess(res, row, 201);
    } catch (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('relation')) {
        return sendError(
          res,
          500,
          'Iade tablolari henuz olusturulmamis. SQL migration calistirilmali.',
          'RETURN_SCHEMA_MISSING'
        );
      }
      throw error;
    }
  }
);

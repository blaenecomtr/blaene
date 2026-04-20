const { createApiHandler } = require('../api/handler');
const { sendError, sendSuccess } = require('../api/response');
const { readJsonBody } = require('../api/request');
const { restInsert, restSelect, restUpdate } = require('../api/supabase');
const { normalizeText } = require('../api/validation');
const { hasRole } = require('../api/auth');
const { writeAuditLog } = require('../api/audit');
const {
  ROLE_SUPER_ADMIN,
  ROLE_ADMIN,
  ROLE_EDITOR,
  ROLE_VIEWER,
} = require('../api/constants');
const { resolveIyzicoConfig, isIyzicoConfigured, refundPayment } = require('../payments/iyzico');

const STAFF_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER];
const WRITER_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR];

function isMissingRelationError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('relation') && text.includes('does not exist');
}

function safeAmount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 100) / 100;
}

function firstPaymentTransactionIdFromEvents(events) {
  const rows = Array.isArray(events) ? events : [];
  for (const row of rows) {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const direct = Array.isArray(payload.payment_transaction_ids) ? payload.payment_transaction_ids : [];
    const nested = Array.isArray(payload?.retrieve?.itemTransactions) ? payload.retrieve.itemTransactions : [];

    for (const value of direct) {
      const id = normalizeText(value, 120);
      if (id) return id;
    }
    for (const item of nested) {
      const id = normalizeText(item?.paymentTransactionId, 120);
      if (id) return id;
    }
  }
  return '';
}

async function safeUpdateOrderRefundData(config, orderId, amount, fullRefund) {
  const rows = await restSelect(config, 'orders', {
    select: 'id,total,refunded_total,refund_status',
    id: `eq.${orderId}`,
    limit: 1,
  }).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return;

  const order = rows[0];
  const currentRefunded = safeAmount(order.refunded_total, 0);
  const total = safeAmount(order.total, 0);
  const nextRefunded = Math.min(total, Math.round((currentRefunded + amount) * 100) / 100);
  const isFull = fullRefund || nextRefunded >= total;

  await restUpdate(config, 'orders', { id: `eq.${orderId}` }, {
    refunded_total: nextRefunded,
    refund_status: isFull ? 'full' : 'partial',
    refunded_at: new Date().toISOString(),
    status: isFull ? 'cancelled' : order.status || 'processing',
  }).catch(() => null);
}

module.exports = createApiHandler(
  {
    methods: ['GET', 'POST'],
    requireAuth: true,
    rateLimit: 120,
  },
  async (req, res, ctx) => {
    const { config, auth } = ctx;
    if (!hasRole(auth.profile.role, STAFF_ROLES)) {
      return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
    }

    if (req.method === 'GET') {
      const query = new URL(req.url, 'http://localhost').searchParams;
      const orderId = normalizeText(query.get('order_id'), 120);
      const returnRequestId = normalizeText(query.get('return_request_id'), 120);

      try {
        const filters = {
          select: '*',
          order: 'created_at.desc',
          limit: 5000,
        };
        if (orderId) filters.order_id = `eq.${orderId}`;
        if (returnRequestId) filters.return_request_id = `eq.${returnRequestId}`;
        const rows = await restSelect(config, 'refund_transactions', filters);
        return sendSuccess(res, rows);
      } catch (error) {
        if (isMissingRelationError(error?.message)) {
          return sendSuccess(res, []);
        }
        throw error;
      }
    }

    if (!hasRole(auth.profile.role, WRITER_ROLES)) {
      return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
    }

    const parsed = await readJsonBody(req);
    const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
    const orderId = normalizeText(body.order_id, 120);
    const returnRequestId = normalizeText(body.return_request_id, 120) || null;
    const reason = normalizeText(body.reason, 500) || null;
    const requestedProvider = normalizeText(body.payment_provider, 40).toLowerCase();
    const requestedTransactionId = normalizeText(body.payment_transaction_id, 120);

    if (!orderId) return sendError(res, 400, 'order_id is required', 'VALIDATION_REQUIRED_ORDER_ID');

    const orderRows = await restSelect(config, 'orders', {
      select: 'id,order_no,total,payment_provider,payment_status',
      id: `eq.${orderId}`,
      limit: 1,
    });
    if (!orderRows.length) return sendError(res, 404, 'Order not found', 'ORDER_NOT_FOUND');
    const order = orderRows[0];

    const amount = safeAmount(body.amount, safeAmount(order.total, 0));
    if (!amount || amount <= 0) {
      return sendError(res, 400, 'amount must be greater than 0', 'VALIDATION_REFUND_AMOUNT');
    }

    const paymentProvider = requestedProvider || normalizeText(order.payment_provider, 40).toLowerCase() || 'manual';
    let status = 'pending';
    let providerRef = null;
    let payload = {};

    let paymentTransactionId = requestedTransactionId;
    if (!paymentTransactionId && paymentProvider === 'iyzico') {
      const events = await restSelect(config, 'payment_events', {
        select: 'payload,created_at',
        order_id: `eq.${orderId}`,
        order: 'created_at.desc',
        limit: 10,
      }).catch(() => []);
      paymentTransactionId = firstPaymentTransactionIdFromEvents(events);
    }

    if (paymentProvider === 'iyzico') {
      const iyzicoConfig = resolveIyzicoConfig(process.env);
      if (isIyzicoConfigured(iyzicoConfig) && paymentTransactionId) {
        try {
          const refundResult = await refundPayment({
            config: iyzicoConfig,
            paymentTransactionId,
            amount,
            reason: reason || 'OTHER',
            conversationId: order.order_no || order.id,
            ipAddress: '127.0.0.1',
          });
          status = 'succeeded';
          providerRef = normalizeText(
            refundResult?.paymentId ||
              refundResult?.paymentTransactionId ||
              refundResult?.conversationId,
            120
          ) || null;
          payload = refundResult || {};
        } catch (error) {
          status = 'failed';
          payload = {
            error: String(error?.message || 'Iyzico refund failed'),
            details: error?.details || null,
          };
        }
      } else {
        status = 'pending';
        payload = {
          warning: 'Iyzico refund icin payment_transaction_id veya Iyzico ayarlari eksik.',
        };
      }
    } else {
      // Non-integrated provider: keep as manual success so operations can continue.
      status = 'succeeded';
      payload = { source: 'manual_refund' };
    }

    const insertPayload = {
      return_request_id: returnRequestId,
      order_id: orderId,
      payment_provider: paymentProvider,
      provider_ref: providerRef,
      amount,
      currency: 'TRY',
      status,
      reason,
      payload,
      created_by: auth.user?.id || null,
    };

    try {
      const inserted = await restInsert(config, 'refund_transactions', insertPayload);
      const row = Array.isArray(inserted) ? inserted[0] : inserted;

      if (status === 'succeeded') {
        const fullRefund = amount >= safeAmount(order.total, 0);
        await safeUpdateOrderRefundData(config, orderId, amount, fullRefund);

        if (returnRequestId) {
          await restUpdate(config, 'return_requests', { id: `eq.${returnRequestId}` }, {
            status: 'refunded',
            reviewed_at: new Date().toISOString(),
            reviewed_by: auth.user?.id || null,
            review_note: reason || null,
            refund_amount: amount,
          }).catch(() => null);
        }
      } else if (returnRequestId && status === 'failed') {
        await restUpdate(config, 'return_requests', { id: `eq.${returnRequestId}` }, {
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: auth.user?.id || null,
          review_note: `Refund failed: ${normalizeText(payload?.error, 500) || 'unknown error'}`,
        }).catch(() => null);
      }

      await writeAuditLog(config, req, auth, 'returns.refund.create', {
        order_id: orderId,
        return_request_id: returnRequestId,
        amount,
        status,
        payment_provider: paymentProvider,
      }, {
        entityType: 'refund_transaction',
        entityId: row?.id || null,
      });

      return sendSuccess(res, row, 201);
    } catch (error) {
      if (isMissingRelationError(error?.message)) {
        return sendError(
          res,
          500,
          'Refund tablolari henuz olusturulmamis. SQL migration calistirilmali.',
          'REFUND_SCHEMA_MISSING'
        );
      }
      throw error;
    }
  }
);


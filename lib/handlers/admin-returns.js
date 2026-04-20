const { createApiHandler } = require('../api/handler');
const { sendError, sendSuccess } = require('../api/response');
const { readJsonBody } = require('../api/request');
const { restSelect, restUpdate } = require('../api/supabase');
const { normalizeText } = require('../api/validation');
const { hasRole } = require('../api/auth');
const { writeAuditLog } = require('../api/audit');
const {
  ROLE_SUPER_ADMIN,
  ROLE_ADMIN,
  ROLE_EDITOR,
  ROLE_VIEWER,
} = require('../api/constants');

const STAFF_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER];
const WRITER_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR];
const STATUS_ALLOWED = ['pending', 'approved', 'rejected', 'in_transit', 'received', 'refunded', 'cancelled'];

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.get('page') || '1', 10) || 1);
  const pageSize = Math.min(500, Math.max(1, Number.parseInt(query.get('page_size') || '25', 10) || 25));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function paginateRows(rows, pagination) {
  const items = rows.slice(pagination.offset, pagination.offset + pagination.pageSize);
  return {
    items,
    meta: {
      pagination: {
        page: pagination.page,
        page_size: pagination.pageSize,
        total: rows.length,
      },
    },
  };
}

function isMissingRelationError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('relation') && text.includes('does not exist');
}

module.exports = createApiHandler(
  {
    methods: ['GET', 'PUT'],
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
      const status = normalizeText(query.get('status'), 40).toLowerCase();
      const search = normalizeText(query.get('search'), 140).toLowerCase();
      const includeRefunds = normalizeText(query.get('include_refunds'), 20).toLowerCase() !== 'false';

      let rows = [];
      try {
        rows = await restSelect(config, 'return_requests', {
          select: '*',
          order: 'created_at.desc',
          limit: 5000,
        });
      } catch (error) {
        if (isMissingRelationError(error?.message)) {
          return sendSuccess(res, []);
        }
        throw error;
      }

      if (status && status !== 'all') {
        rows = rows.filter((row) => String(row.status || '').toLowerCase() === status);
      }
      if (search) {
        rows = rows.filter((row) =>
          String(row.order_no || '').toLowerCase().includes(search) ||
          String(row.customer_email || '').toLowerCase().includes(search) ||
          String(row.customer_name || '').toLowerCase().includes(search) ||
          String(row.reason || '').toLowerCase().includes(search)
        );
      }

      if (includeRefunds && rows.length) {
        const ids = rows.map((item) => normalizeText(item.id, 120)).filter(Boolean);
        if (ids.length) {
          const inFilter = `in.(${ids.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(',')})`;
          const refundRows = await restSelect(config, 'refund_transactions', {
            select: 'id,return_request_id,order_id,status,amount,currency,payment_provider,provider_ref,created_at',
            return_request_id: inFilter,
            order: 'created_at.desc',
            limit: 5000,
          }).catch(() => []);

          const refundMap = new Map();
          (Array.isArray(refundRows) ? refundRows : []).forEach((refund) => {
            const key = normalizeText(refund.return_request_id, 120);
            if (!key) return;
            if (!refundMap.has(key)) refundMap.set(key, []);
            refundMap.get(key).push(refund);
          });

          rows = rows.map((row) => ({
            ...row,
            refunds: refundMap.get(normalizeText(row.id, 120)) || [],
          }));
        }
      }

      const pagination = parsePagination(query);
      const paged = paginateRows(rows, pagination);
      return sendSuccess(res, paged.items, 200, paged.meta);
    }

    if (!hasRole(auth.profile.role, WRITER_ROLES)) {
      return sendError(res, 403, 'Forbidden', 'AUTH_FORBIDDEN_ROLE');
    }

    const parsed = await readJsonBody(req);
    const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
    const id = normalizeText(body.id, 120);
    if (!id) return sendError(res, 400, 'id is required', 'VALIDATION_REQUIRED_ID');

    const patch = {};
    if (body.status !== undefined) {
      const status = normalizeText(body.status, 40).toLowerCase();
      if (!STATUS_ALLOWED.includes(status)) {
        return sendError(res, 400, 'Invalid return status', 'VALIDATION_RETURN_STATUS');
      }
      patch.status = status;
      patch.reviewed_at = new Date().toISOString();
      patch.reviewed_by = auth.user?.id || null;
    }
    if (body.review_note !== undefined) {
      patch.review_note = normalizeText(body.review_note, 2000) || null;
    }
    if (body.refund_amount !== undefined) {
      const amount = Number(body.refund_amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return sendError(res, 400, 'Invalid refund_amount', 'VALIDATION_RETURN_REFUND_AMOUNT');
      }
      patch.refund_amount = Math.round(amount * 100) / 100;
    }

    if (!Object.keys(patch).length) {
      return sendError(res, 400, 'No fields to update', 'VALIDATION_EMPTY_PATCH');
    }

    await restUpdate(config, 'return_requests', { id: `eq.${id}` }, patch);
    await writeAuditLog(config, req, auth, 'returns.request.update', { id, patch }, {
      entityType: 'return_request',
      entityId: id,
    });
    return sendSuccess(res, { id, patch });
  }
);


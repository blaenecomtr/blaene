const { restInsert } = require('./supabase');
const { getClientIp, getRequestPath } = require('./request');
const { normalizeText } = require('./validation');

async function writeAuditLog(config, req, actor, action, details = {}, options = {}) {
  try {
    const payload = {
      actor_user_id: actor?.user?.id || null,
      actor_email: actor?.user?.email || null,
      actor_role: actor?.profile?.role || null,
      action: normalizeText(action, 120),
      entity_type: normalizeText(options.entityType || '', 80) || null,
      entity_id: normalizeText(options.entityId || '', 120) || null,
      metadata: details && typeof details === 'object' ? details : {},
      request_path: getRequestPath(req),
      request_method: normalizeText(req.method, 12),
      ip_address: getClientIp(req),
      user_agent: normalizeText(req.headers['user-agent'] || '', 500),
    };
    await restInsert(config, 'audit_logs', payload, { prefer: 'return=minimal' });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Audit log write failed:', error?.message || error);
    }
  }
}

module.exports = {
  writeAuditLog,
};

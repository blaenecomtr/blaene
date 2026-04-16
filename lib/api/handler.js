const { applyCors, isOriginAllowed, handlePreflight } = require('./cors');
const { applyRateLimit } = require('./rate-limit');
const { sendError } = require('./response');
const { getClientIp, getRequestPath } = require('./request');
const { assertSupabaseConfig } = require('./supabase');
const { requireUser, assertPermissions } = require('./auth');

const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_WINDOW_MS = 60 * 1000;

function setRateLimitHeaders(res, info) {
  res.setHeader('X-RateLimit-Limit', String(info.limit));
  res.setHeader('X-RateLimit-Remaining', String(info.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(info.resetAt / 1000)));
}

function resolveMethodList(methods) {
  return Array.isArray(methods) && methods.length ? methods : [];
}

function createApiHandler(options, fn) {
  const settings = options || {};
  const allowedMethods = resolveMethodList(settings.methods);

  return async function apiHandler(req, res) {
    try {
      applyCors(req, res);
      if (handlePreflight(req, res)) return;

      if (!isOriginAllowed(req)) {
        return sendError(res, 403, 'Origin is not allowed', 'CORS_ORIGIN_DENIED');
      }

      if (allowedMethods.length && !allowedMethods.includes(req.method)) {
        res.setHeader('Allow', allowedMethods.join(','));
        return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
      }

      const path = getRequestPath(req);
      const ip = getClientIp(req);
      const rateKey = `${path}:${ip}`;

      const rateInfo = await applyRateLimit({
        key: rateKey,
        limit: settings.rateLimit || DEFAULT_RATE_LIMIT,
        windowMs: settings.rateWindowMs || DEFAULT_RATE_WINDOW_MS,
      });
      setRateLimitHeaders(res, rateInfo);
      if (!rateInfo.allowed) {
        res.setHeader('Retry-After', String(rateInfo.retryAfterSec));
        return sendError(
          res,
          429,
          'Too many requests. Please try again shortly.',
          'RATE_LIMITED'
        );
      }

      const config = assertSupabaseConfig();

      let auth = null;
      if (settings.requireAuth) {
        auth = await requireUser(req, config);
        assertPermissions(auth.profile, {
          roles: settings.roles || [],
          requiredTier: settings.requiredTier || '',
        });
      }

      await fn(req, res, {
        config,
        auth,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[api:error]', error);
      }
      return sendError(
        res,
        Number(error?.httpStatus || 500),
        error?.message || 'Internal server error',
        error?.code || 'INTERNAL_ERROR'
      );
    }
  };
}

module.exports = {
  createApiHandler,
};

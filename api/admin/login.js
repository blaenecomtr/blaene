const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess, sendError } = require('../../lib/api/response');
const { readJsonBody } = require('../../lib/api/request');
const { assertSupabaseConfig, restSelect } = require('../../lib/api/supabase');
const { normalizeEmail, normalizeText } = require('../../lib/api/validation');

const VALID_ROLES = ['super_admin', 'admin', 'editor', 'viewer'];

async function signInWithPassword(config, email, password) {
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
    body: JSON.stringify({
      email: safeEmail,
      password: safePassword,
    }),
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

async function isAuthorizedStaff(config, userId) {
  const rows = await restSelect(config, 'user_profiles', {
    select: 'id,role,is_active',
    id: `eq.${userId}`,
    limit: 1,
  }).catch(() => []);

  const profile = Array.isArray(rows) ? rows[0] : null;
  const role = String(profile?.role || '').toLowerCase();
  if (!profile || !VALID_ROLES.includes(role)) return false;
  if (profile.is_active === false) return false;
  return true;
}

module.exports = createApiHandler(
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
    const { email, password } = body;

    try {
      const config = assertSupabaseConfig();
      const authResult = await signInWithPassword(config, email, password);
      if (!authResult.ok) {
        return sendError(res, authResult.status, authResult.error, authResult.code);
      }

      const allowed = await isAuthorizedStaff(config, authResult.user.id);
      if (!allowed) {
        return sendError(res, 403, 'Not authorized', 'AUTH_FORBIDDEN');
      }

      return sendSuccess(res, {
        token: authResult.token,
        user: {
          id: authResult.user.id,
          email: authResult.user.email,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return sendError(res, 500, 'Login failed', 'AUTH_ERROR');
    }
  }
);

const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess, sendError } = require('../../lib/api/response');
const { readJsonBody } = require('../../lib/api/request');
const { assertSupabaseConfig } = require('../../lib/api/supabase');
const { normalizeEmail, normalizeText } = require('../../lib/api/validation');

async function signInWithPassword(config, email, password) {
  const safeEmail = normalizeEmail(email);
  const safePassword = normalizeText(password, 256);
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
  if (!response.ok || !payload?.access_token) {
    return false;
  }
  return true;
}

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: true,
    rateLimit: 20,
  },
  async (req, res, ctx) => {
    if (req.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }

    const parsed = await readJsonBody(req);
    const body = parsed?.body || {};
    const { password } = body;
    const { auth } = ctx;

    if (!password || typeof password !== 'string') {
      return sendError(res, 400, 'Password required', 'VALIDATION_ERROR');
    }

    try {
      const config = assertSupabaseConfig();
      const valid = await signInWithPassword(config, auth.user.email, password);
      if (!valid) {
        return sendError(res, 401, 'Invalid password', 'AUTH_INVALID_PASSWORD');
      }

      return sendSuccess(res, { ok: true });
    } catch (err) {
      console.error('Verify logout error:', err);
      return sendError(res, 500, 'Verification failed', 'AUTH_ERROR');
    }
  }
);

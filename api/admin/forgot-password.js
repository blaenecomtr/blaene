const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess, sendError } = require('../../lib/api/response');
const { readJsonBody } = require('../../lib/api/request');
const { assertSupabaseConfig } = require('../../lib/api/supabase');
const { normalizeEmail, normalizeText } = require('../../lib/api/validation');

function getRequestOrigin(req) {
  const forwardedProto = normalizeText(req.headers['x-forwarded-proto'], 20).toLowerCase();
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  const host =
    normalizeText(req.headers['x-forwarded-host'], 255) ||
    normalizeText(req.headers.host, 255) ||
    'www.blaene.com.tr';
  return `${protocol}://${host}`;
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
    const email = normalizeEmail(body.email);

    if (!email) {
      return sendError(res, 400, 'Email required', 'VALIDATION_ERROR');
    }

    try {
      const config = assertSupabaseConfig();
      const authApiKey = config.anonKey || config.serviceRoleKey;
      const redirectTo =
        normalizeText(process.env.ADMIN_RESET_REDIRECT_URL, 500) || `${getRequestOrigin(req)}/admin`;

      const response = await fetch(`${config.url}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          apikey: authApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          redirect_to: redirectTo,
        }),
      });

      // Always return a generic success response to avoid user enumeration.
      if (!response.ok) {
        await response.text().catch(() => '');
      }

      return sendSuccess(res, {
        ok: true,
        message: 'Eger hesap varsa sifre sifirlama e-postasi gonderildi.',
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      return sendError(res, 500, 'Reset request failed', 'AUTH_ERROR');
    }
  }
);

const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess, sendError } = require('../../lib/api/response');
const { readJsonBody } = require('../../lib/api/request');
const { fetchAuthUser } = require('../../lib/api/supabase');

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
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      // Re-authenticate with password
      const { data, error } = await supabase.auth.signInWithPassword({
        email: auth.user.email,
        password,
      });

      if (error || !data?.session) {
        return sendError(res, 401, 'Invalid password', 'AUTH_INVALID_PASSWORD');
      }

      return sendSuccess(res, { ok: true });
    } catch (err) {
      console.error('Verify logout error:', err);
      return sendError(res, 500, 'Verification failed', 'AUTH_ERROR');
    }
  }
);

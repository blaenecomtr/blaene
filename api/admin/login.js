const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess, sendError } = require('../../lib/api/response');
const { readJsonBody } = require('../../lib/api/request');

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

    if (!email || !password) {
      return sendError(res, 400, 'Email and password required', 'VALIDATION_ERROR');
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      // Attempt login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data?.session) {
        return sendError(res, 401, 'Invalid credentials', 'AUTH_INVALID');
      }

      // Verify user is admin
      const adminSupabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: profile } = await adminSupabase
        .from('user_profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      const validRoles = ['super_admin', 'admin', 'editor', 'viewer'];
      if (!profile || !validRoles.includes(profile.role)) {
        return sendError(res, 403, 'Not authorized', 'AUTH_FORBIDDEN');
      }

      // Return token
      return sendSuccess(res, {
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return sendError(res, 500, 'Login failed', 'AUTH_ERROR');
    }
  }
);

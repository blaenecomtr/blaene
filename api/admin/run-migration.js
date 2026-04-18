const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess, sendError } = require('../../lib/api/response');
const { assertSupabaseConfig } = require('../../lib/api/supabase');

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: true,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }

    try {
      const config = assertSupabaseConfig();
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!serviceRoleKey) {
        return sendError(res, 500, 'Service role key not configured', 'CONFIG_ERROR');
      }

      // Run migration SQL
      const sqlQuery = `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;`;

      // Call Supabase SQL endpoint
      const response = await fetch(`${config.url}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: sqlQuery,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.log('Migration response:', text);
      }

      return sendSuccess(res, {
        ok: true,
        message: 'Migration executed - archived column added or already exists',
      });
    } catch (err) {
      console.error('Migration error:', err);
      return sendError(res, 500, 'Migration failed', 'MIGRATION_ERROR');
    }
  }
);

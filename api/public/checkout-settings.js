const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess } = require('../../lib/api/response');
const { loadCheckoutSettings } = require('../../lib/payments/checkout-settings');

module.exports = createApiHandler(
  {
    methods: ['GET'],
    requireAuth: false,
    rateLimit: 240,
  },
  async (req, res, ctx) => {
    const settings = await loadCheckoutSettings({
      supabaseUrl: ctx.config.url,
      serviceRoleKey: ctx.config.serviceRoleKey,
    });

    return sendSuccess(res, settings);
  }
);

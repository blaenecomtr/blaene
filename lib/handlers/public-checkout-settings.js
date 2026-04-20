const { createApiHandler } = require('../api/handler');
const { sendSuccess } = require('../api/response');
const { loadCheckoutSettings } = require('../payments/checkout-settings');

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

    const payment = settings && settings.payment ? settings.payment : {};
    const shipping = settings && settings.shipping ? settings.shipping : {};
    const publicPayment = {
      paytr_enabled: payment.paytr_enabled !== false,
      iyzico_enabled: payment.iyzico_enabled === true,
      provider_preference: String(payment.provider_preference || '').toLowerCase() || 'iyzico',
      bank_transfer_company_name: String(payment.bank_transfer_company_name || '').trim(),
      bank_transfer_accounts: Array.isArray(payment.bank_transfer_accounts)
        ? payment.bank_transfer_accounts
        : [],
    };

    return sendSuccess(res, {
      shipping,
      payment: publicPayment,
    });
  }
);


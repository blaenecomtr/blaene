const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess } = require('../../lib/api/response');
const { loadCheckoutSettings } = require('../../lib/payments/checkout-settings');
const { resolveIyzicoConfig, isIyzicoConfigured } = require('../../lib/payments/iyzico');

function normalizeString(value, fallback = '') {
  return String(value || fallback).trim();
}

function getPaytrConfigFromSettingsOrEnv(paymentSettings = {}, env = process.env) {
  return {
    merchantId: normalizeString(paymentSettings.paytr_merchant_id || env.PAYTR_MERCHANT_ID),
    merchantKey: normalizeString(paymentSettings.paytr_merchant_key || env.PAYTR_MERCHANT_KEY),
    merchantSalt: normalizeString(paymentSettings.paytr_merchant_salt || env.PAYTR_MERCHANT_SALT),
  };
}

module.exports = createApiHandler(
  {
    methods: ['GET'],
    requireAuth: true,
    rateLimit: 80,
    requiredTier: 'pro',
  },
  async (req, res, ctx) => {
    const settings = await loadCheckoutSettings({
      supabaseUrl: ctx.config.url,
      serviceRoleKey: ctx.config.serviceRoleKey,
    }).catch(() => null);

    const paymentSettings = settings && settings.payment ? settings.payment : {};
    const providerPreference = normalizeString(paymentSettings.provider_preference, 'iyzico').toLowerCase();

    const paytrConfig = getPaytrConfigFromSettingsOrEnv(paymentSettings);
    const paytrConfigured = Boolean(paytrConfig.merchantId && paytrConfig.merchantKey && paytrConfig.merchantSalt);
    const paytrEnabled = paymentSettings.paytr_enabled !== false;

    const iyzicoConfig = resolveIyzicoConfig({
      ...process.env,
      IYZICO_API_KEY: paymentSettings.iyzico_api_key || process.env.IYZICO_API_KEY,
      IYZICO_SECRET_KEY: paymentSettings.iyzico_secret_key || process.env.IYZICO_SECRET_KEY,
      IYZICO_BASE_URL: paymentSettings.iyzico_base_url || process.env.IYZICO_BASE_URL,
    });
    const iyzicoConfigured = isIyzicoConfigured(iyzicoConfig);
    const iyzicoEnabled = paymentSettings.iyzico_enabled === true;

    let activeProvider = 'mock';
    if (providerPreference === 'iyzico' && iyzicoEnabled && iyzicoConfigured) activeProvider = 'iyzico';
    else if (providerPreference === 'paytr' && paytrEnabled && paytrConfigured) activeProvider = 'paytr';
    else if (iyzicoEnabled && iyzicoConfigured) activeProvider = 'iyzico';
    else if (paytrEnabled && paytrConfigured) activeProvider = 'paytr';

    return sendSuccess(res, {
      active_provider: activeProvider,
      provider_preference: providerPreference,
      providers: {
        iyzico: {
          enabled: iyzicoEnabled,
          configured: iyzicoConfigured,
          base_url: iyzicoConfig.baseUrl || '',
        },
        paytr: {
          enabled: paytrEnabled,
          configured: paytrConfigured,
        },
      },
      checkout_mode: normalizeString(process.env.CHECKOUT_MODE, 'auto').toLowerCase(),
      mock_checkout_mode: normalizeString(process.env.MOCK_CHECKOUT_MODE, 'false').toLowerCase() === 'true',
    });
  }
);

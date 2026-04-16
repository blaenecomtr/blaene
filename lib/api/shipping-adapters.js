const { normalizeText } = require('./validation');

const PROVIDERS = ['yurtici', 'mng', 'aras'];

function getProviderConfig(provider) {
  const normalized = normalizeText(provider, 40).toLowerCase();
  if (!PROVIDERS.includes(normalized)) {
    return null;
  }
  return {
    provider: normalized,
    apiKey: process.env[`SHIPPING_${normalized.toUpperCase()}_API_KEY`] || '',
    apiSecret: process.env[`SHIPPING_${normalized.toUpperCase()}_API_SECRET`] || '',
  };
}

function isProviderConfigured(provider) {
  const config = getProviderConfig(provider);
  if (!config) return false;
  return Boolean(config.apiKey && config.apiSecret);
}

async function createShipment({ provider, order }) {
  const config = getProviderConfig(provider);
  if (!config) {
    return {
      success: false,
      error: 'Unsupported shipping provider',
      code: 'SHIPPING_PROVIDER_UNSUPPORTED',
    };
  }

  if (!isProviderConfigured(provider)) {
    return {
      success: false,
      error: `${provider} shipping adapter is not configured yet`,
      code: 'SHIPPING_PROVIDER_NOT_CONFIGURED',
    };
  }

  const prefix = provider.toUpperCase().slice(0, 3);
  const trackingCode = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  return {
    success: true,
    data: {
      tracking_code: trackingCode,
      provider: provider.toLowerCase(),
      status: 'created',
      external_reference: order?.order_no || null,
    },
  };
}

module.exports = {
  PROVIDERS,
  getProviderConfig,
  isProviderConfigured,
  createShipment,
};

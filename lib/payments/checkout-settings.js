const { normalizeText } = require('../api/validation');

const DEFAULT_SHIPPING_SETTINGS = Object.freeze({
  free_shipping_threshold: 2000,
  base_shipping_fee: 120,
  tiers: [],
});

const DEFAULT_PAYMENT_SETTINGS = Object.freeze({
  paytr_enabled: true,
});

function buildSupabaseHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toNonNegative(value, fallback = 0) {
  return Math.max(0, toNumber(value, fallback));
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function normalizeShippingTier(item, index = 0) {
  const min = toNonNegative(item?.min, 0);
  const fee = toNonNegative(item?.fee, 0);
  const label = normalizeText(item?.label, 120) || `tier-${index + 1}`;
  return {
    min,
    fee: roundMoney(fee),
    label,
  };
}

function normalizeShippingSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const tiers = Array.isArray(source.tiers)
    ? source.tiers.map((item, index) => normalizeShippingTier(item, index))
    : [];

  tiers.sort((a, b) => b.min - a.min);

  return {
    free_shipping_threshold: roundMoney(
      toNonNegative(source.free_shipping_threshold, DEFAULT_SHIPPING_SETTINGS.free_shipping_threshold)
    ),
    base_shipping_fee: roundMoney(
      toNonNegative(source.base_shipping_fee, DEFAULT_SHIPPING_SETTINGS.base_shipping_fee)
    ),
    tiers,
  };
}

function normalizePaymentSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    paytr_enabled: source.paytr_enabled !== false,
  };
}

async function fetchSiteSettingValue({ supabaseUrl, serviceRoleKey, key }) {
  const normalizedKey = normalizeText(key, 120);
  if (!normalizedKey) return null;

  const params = new URLSearchParams();
  params.set('select', 'value_json');
  params.set('key', `eq.${normalizedKey}`);
  params.set('limit', '1');

  const response = await fetch(`${supabaseUrl}/rest/v1/site_settings?${params.toString()}`, {
    method: 'GET',
    headers: buildSupabaseHeaders(serviceRoleKey),
  }).catch(() => null);

  if (!response || !response.ok) return null;

  const data = await response.json().catch(() => null);
  if (!Array.isArray(data) || !data.length) return null;
  if (!data[0] || typeof data[0] !== 'object') return null;
  return data[0].value_json || null;
}

async function loadCheckoutSettings({ supabaseUrl, serviceRoleKey }) {
  const [shippingRaw, paymentRaw] = await Promise.all([
    fetchSiteSettingValue({ supabaseUrl, serviceRoleKey, key: 'shipping_settings' }),
    fetchSiteSettingValue({ supabaseUrl, serviceRoleKey, key: 'payment_settings' }),
  ]);

  return {
    shipping: normalizeShippingSettings(shippingRaw || DEFAULT_SHIPPING_SETTINGS),
    payment: normalizePaymentSettings(paymentRaw || DEFAULT_PAYMENT_SETTINGS),
  };
}

function computeShippingFee(subtotal, shippingSettings) {
  const settings = normalizeShippingSettings(shippingSettings || DEFAULT_SHIPPING_SETTINGS);
  const total = roundMoney(toNonNegative(subtotal, 0));
  if (total <= 0) return 0;

  if (settings.free_shipping_threshold > 0 && total >= settings.free_shipping_threshold) {
    return 0;
  }

  const matchedTier = settings.tiers.find((tier) => total >= tier.min);
  if (matchedTier) return roundMoney(matchedTier.fee);

  return roundMoney(settings.base_shipping_fee);
}

module.exports = {
  DEFAULT_SHIPPING_SETTINGS,
  DEFAULT_PAYMENT_SETTINGS,
  normalizeShippingSettings,
  normalizePaymentSettings,
  loadCheckoutSettings,
  computeShippingFee,
};

const { normalizeText } = require('../api/validation');

const DEFAULT_SHIPPING_SETTINGS = Object.freeze({
  free_shipping_threshold: 3000,
  base_shipping_fee: 300,
  tiers: [],
  providers: [
    { provider: 'yurtici', label: 'Yurtici Kargo', enabled: true },
    { provider: 'mng', label: 'MNG Kargo', enabled: true },
    { provider: 'aras', label: 'Aras Kargo', enabled: true },
  ],
});

const DEFAULT_PAYMENT_SETTINGS = Object.freeze({
  paytr_enabled: false,
  iyzico_enabled: true,
  provider_preference: 'iyzico',
  paytr_merchant_id: '',
  paytr_merchant_key: '',
  paytr_merchant_salt: '',
  iyzico_api_key: '',
  iyzico_secret_key: '',
  iyzico_base_url: '',
  bank_transfer_company_name: 'Blaene',
  bank_transfer_accounts: [
    {
      bank_name: 'Ziraat Bankasi',
      account_name: 'Blaene Metal Urunleri',
      iban: 'TR00 0000 0000 0000 0000 0000 00',
      branch: '',
      account_no: '',
      currency: 'TRY',
      enabled: true,
    },
  ],
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

function normalizeShippingProvider(item, index = 0) {
  const rawProvider = typeof item === 'string' ? item : item?.provider;
  const provider = normalizeText(rawProvider, 40)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .trim();
  if (!provider) return null;
  const fallback = `provider-${index + 1}`;
  const label = normalizeText(typeof item === 'string' ? '' : item?.label, 120) || provider || fallback;
  return {
    provider: provider || fallback,
    label,
    enabled: typeof item === 'object' && item ? item.enabled !== false : true,
  };
}

function normalizeShippingSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const tiers = Array.isArray(source.tiers)
    ? source.tiers.map((item, index) => normalizeShippingTier(item, index))
    : [];
  const sourceProviders = Array.isArray(source.providers)
    ? source.providers
    : DEFAULT_SHIPPING_SETTINGS.providers;
  const providers = sourceProviders
    .map((item, index) => normalizeShippingProvider(item, index))
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((row) => row.provider === item.provider) === index);

  tiers.sort((a, b) => b.min - a.min);

  return {
    free_shipping_threshold: roundMoney(
      toNonNegative(source.free_shipping_threshold, DEFAULT_SHIPPING_SETTINGS.free_shipping_threshold)
    ),
    base_shipping_fee: roundMoney(
      toNonNegative(source.base_shipping_fee, DEFAULT_SHIPPING_SETTINGS.base_shipping_fee)
    ),
    tiers,
    providers: providers.length ? providers : DEFAULT_SHIPPING_SETTINGS.providers,
  };
}

function normalizeBankTransferAccount(item, index = 0) {
  const source = item && typeof item === 'object' ? item : {};
  const bankName = normalizeText(source.bank_name, 160);
  const accountName = normalizeText(source.account_name, 180);
  const iban = normalizeText(source.iban, 80)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  const branch = normalizeText(source.branch, 120) || '';
  const accountNo = normalizeText(source.account_no, 120) || '';
  const currency = normalizeText(source.currency, 12).toUpperCase() || 'TRY';

  if (!bankName && !accountName && !iban) return null;

  return {
    bank_name: bankName || `Banka ${index + 1}`,
    account_name: accountName || '',
    iban: iban || '',
    branch,
    account_no: accountNo,
    currency,
    enabled: source.enabled !== false,
  };
}

function normalizeBankTransferAccounts(raw, fallbackRaw) {
  const sourceList = Array.isArray(raw) ? raw : [];
  const normalized = sourceList
    .map((item, index) => normalizeBankTransferAccount(item, index))
    .filter(Boolean)
    .filter((item) => item.enabled !== false);

  if (normalized.length) return normalized;

  const fallbackList = Array.isArray(fallbackRaw) ? fallbackRaw : [];
  const fallback = fallbackList
    .map((item, index) => normalizeBankTransferAccount(item, index))
    .filter(Boolean)
    .filter((item) => item.enabled !== false);
  return fallback;
}

function normalizePaymentSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const providerPreference = normalizeText(source.provider_preference, 20).toLowerCase();
  const normalizedPreference =
    providerPreference === 'iyzico' || providerPreference === 'paytr'
      ? providerPreference
      : DEFAULT_PAYMENT_SETTINGS.provider_preference;

  const legacyFallbackAccount = {
    bank_name: normalizeText(
      source.bank_transfer_bank_name || process.env.BANK_TRANSFER_BANK_NAME,
      160
    ),
    account_name: normalizeText(
      source.bank_transfer_account_name || process.env.BANK_TRANSFER_ACCOUNT_NAME,
      180
    ),
    iban: normalizeText(source.bank_transfer_iban || process.env.BANK_TRANSFER_IBAN, 80),
  };
  const sourceAccounts = normalizeBankTransferAccounts(
    source.bank_transfer_accounts,
    [legacyFallbackAccount].concat(DEFAULT_PAYMENT_SETTINGS.bank_transfer_accounts)
  );
  const fallbackAccounts = normalizeBankTransferAccounts(
    DEFAULT_PAYMENT_SETTINGS.bank_transfer_accounts,
    []
  );
  const bankTransferAccounts = sourceAccounts.length ? sourceAccounts : fallbackAccounts;
  const firstAccount = bankTransferAccounts[0] || null;
  const bankTransferCompanyName =
    normalizeText(source.bank_transfer_company_name, 180) ||
    normalizeText(process.env.BANK_TRANSFER_COMPANY_NAME, 180) ||
    normalizeText(firstAccount?.account_name, 180) ||
    DEFAULT_PAYMENT_SETTINGS.bank_transfer_company_name;

  return {
    paytr_enabled: source.paytr_enabled !== false,
    iyzico_enabled: source.iyzico_enabled === true,
    provider_preference: normalizedPreference,
    paytr_merchant_id: normalizeText(source.paytr_merchant_id, 200) || '',
    paytr_merchant_key: normalizeText(source.paytr_merchant_key, 200) || '',
    paytr_merchant_salt: normalizeText(source.paytr_merchant_salt, 200) || '',
    iyzico_api_key: normalizeText(source.iyzico_api_key, 240) || '',
    iyzico_secret_key: normalizeText(source.iyzico_secret_key, 240) || '',
    iyzico_base_url: normalizeText(source.iyzico_base_url, 500) || '',
    bank_transfer_company_name: bankTransferCompanyName,
    bank_transfer_accounts: bankTransferAccounts,
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

  const matchedTier = settings.tiers.find((tier) => tier.fee > 0 && total >= tier.min);
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

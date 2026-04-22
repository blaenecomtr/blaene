const { restInsert, restSelect, restUpdate } = require('../api/supabase');
const { normalizePositiveInt, normalizeText } = require('../api/validation');

const EMAIL_AUTOMATION_SETTINGS_KEY = 'email_automation_settings';
const EMAIL_AUTOMATION_SETTINGS_DESCRIPTION = 'Mail otomasyon ac/kapa ayarlari';

const DEFAULT_EMAIL_AUTOMATION_SETTINGS = {
  auto_abandoned_cart: true,
  auto_product_intro: true,
  auto_stock_back_in: true,
  auto_price_drop: true,
  auto_support_updates: true,
  auto_invoice_ready: true,
  auto_order_confirmation: true,
  auto_delivered: true,
  auto_review_request: true,
  review_request_delay_days: 5,
  review_request_batch_limit: 200,
};

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = normalizeText(value, 10).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeEmailAutomationSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    auto_abandoned_cart: toBool(source.auto_abandoned_cart, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_abandoned_cart),
    auto_product_intro: toBool(source.auto_product_intro, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_product_intro),
    auto_stock_back_in: toBool(source.auto_stock_back_in, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_stock_back_in),
    auto_price_drop: toBool(source.auto_price_drop, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_price_drop),
    auto_support_updates: toBool(source.auto_support_updates, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_support_updates),
    auto_invoice_ready: toBool(source.auto_invoice_ready, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_invoice_ready),
    auto_order_confirmation: toBool(source.auto_order_confirmation, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_order_confirmation),
    auto_delivered: toBool(source.auto_delivered, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_delivered),
    auto_review_request: toBool(source.auto_review_request, DEFAULT_EMAIL_AUTOMATION_SETTINGS.auto_review_request),
    review_request_delay_days: normalizePositiveInt(
      source.review_request_delay_days,
      DEFAULT_EMAIL_AUTOMATION_SETTINGS.review_request_delay_days,
      90
    ),
    review_request_batch_limit: normalizePositiveInt(
      source.review_request_batch_limit,
      DEFAULT_EMAIL_AUTOMATION_SETTINGS.review_request_batch_limit,
      2000
    ),
  };
}

async function loadEmailAutomationSettings(config) {
  const rows = await restSelect(config, 'site_settings', {
    select: 'key,value_json',
    key: `eq.${EMAIL_AUTOMATION_SETTINGS_KEY}`,
    limit: 1,
  }).catch(() => []);
  const raw = Array.isArray(rows) && rows.length ? rows[0]?.value_json : null;
  return normalizeEmailAutomationSettings(raw || {});
}

async function saveEmailAutomationSettings(config, nextSettings, updatedBy = null) {
  const normalized = normalizeEmailAutomationSettings(nextSettings || {});
  const payload = {
    key: EMAIL_AUTOMATION_SETTINGS_KEY,
    value_json: normalized,
    description: EMAIL_AUTOMATION_SETTINGS_DESCRIPTION,
    is_public: false,
    updated_by: normalizeText(updatedBy, 180) || null,
  };

  const existing = await restSelect(config, 'site_settings', {
    select: 'key',
    key: `eq.${EMAIL_AUTOMATION_SETTINGS_KEY}`,
    limit: 1,
  }).catch(() => []);

  if (Array.isArray(existing) && existing.length) {
    await restUpdate(config, 'site_settings', { key: `eq.${EMAIL_AUTOMATION_SETTINGS_KEY}` }, payload);
  } else {
    await restInsert(config, 'site_settings', payload, { prefer: 'return=minimal' });
  }
  return normalized;
}

module.exports = {
  EMAIL_AUTOMATION_SETTINGS_KEY,
  DEFAULT_EMAIL_AUTOMATION_SETTINGS,
  normalizeEmailAutomationSettings,
  loadEmailAutomationSettings,
  saveEmailAutomationSettings,
};

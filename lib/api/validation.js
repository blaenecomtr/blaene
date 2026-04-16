const { ROLES, SUBSCRIPTION_TIERS } = require('./constants');

function normalizeText(value, maxLength = 5000) {
  const input = value === null || value === undefined ? '' : String(value);
  const compact = input.replace(/\u0000/g, '').trim();
  return compact.slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeText(value, 320).toLowerCase();
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = normalizeText(value, 80).toLowerCase();
  if (allowed.includes(normalized)) return normalized;
  return fallback;
}

function normalizeRole(value, fallback = 'viewer') {
  return normalizeEnum(value, ROLES, fallback);
}

function normalizeTier(value, fallback = 'free') {
  return normalizeEnum(value, SUBSCRIPTION_TIERS, fallback);
}

function normalizePrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function normalizePositiveInt(value, fallback = 1, maxValue = 999999) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, maxValue);
}

function isTruthy(value) {
  const normalized = normalizeText(value, 10).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function sanitizeString(value, maxLength = 5000) {
  return normalizeText(value, maxLength)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/g, '');
}

function sanitizeObjectShallow(input, maxLengthPerField = 5000) {
  const out = {};
  const source = input && typeof input === 'object' ? input : {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      out[key] = sanitizeString(value, maxLengthPerField);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function validateRequiredFields(source, requiredKeys) {
  const missing = [];
  const payload = source && typeof source === 'object' ? source : {};

  requiredKeys.forEach((key) => {
    const value = payload[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      missing.push(key);
    }
  });
  return {
    valid: missing.length === 0,
    missing,
  };
}

module.exports = {
  normalizeText,
  normalizeEmail,
  normalizeEnum,
  normalizeRole,
  normalizeTier,
  normalizePrice,
  normalizePositiveInt,
  isTruthy,
  sanitizeString,
  sanitizeObjectShallow,
  validateRequiredFields,
};

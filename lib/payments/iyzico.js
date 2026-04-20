const crypto = require('crypto');

function normalizeString(value, fallback = '') {
  return String(value || fallback).trim();
}

function normalizeAbsoluteHttpUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function resolveIyzicoConfig(env = process.env) {
  const baseUrl =
    normalizeAbsoluteHttpUrl(env.IYZICO_BASE_URL) ||
    normalizeAbsoluteHttpUrl(env.IYZICO_SANDBOX_URL) ||
    'https://sandbox-api.iyzipay.com';

  return {
    apiKey: normalizeString(env.IYZICO_API_KEY),
    secretKey: normalizeString(env.IYZICO_SECRET_KEY),
    baseUrl,
  };
}

function isIyzicoConfigured(config) {
  return Boolean(config && config.apiKey && config.secretKey && config.baseUrl);
}

function createIyzicoAuthorization({ apiKey, secretKey, uriPath, body, randomKey }) {
  const payload = `${randomKey}${uriPath}${body}`;
  const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
  const authString = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return `IYZWSv2 ${Buffer.from(authString, 'utf8').toString('base64')}`;
}

async function iyzicoRequest({ config, uriPath, payload }) {
  const body = JSON.stringify(payload || {});
  const randomKey = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  const authorization = createIyzicoAuthorization({
    apiKey: config.apiKey,
    secretKey: config.secretKey,
    uriPath,
    body,
    randomKey,
  });

  const response = await fetch(`${config.baseUrl}${uriPath}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'x-iyzi-rnd': randomKey,
      'x-iyzi-client-version': 'blaene-node-1.0.0',
      'Content-Type': 'application/json',
    },
    body,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = data?.errorMessage || data?.errorCode || 'Iyzico request failed';
    const error = new Error(message);
    error.details = data;
    throw error;
  }

  if (String(data.status || '').toLowerCase() !== 'success') {
    const message = data.errorMessage || data.errorCode || 'Iyzico returned failed status';
    const error = new Error(message);
    error.details = data;
    throw error;
  }

  return data;
}

function splitFullName(fullName) {
  const normalized = normalizeString(fullName, 'Musteri');
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (!parts.length) return { name: 'Musteri', surname: 'Blaene' };
  if (parts.length === 1) return { name: parts[0], surname: 'Musteri' };
  return { name: parts[0], surname: parts.slice(1).join(' ') };
}

function safePrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00';
  return (Math.round(number * 100) / 100).toFixed(2);
}

function normalizePhone(value) {
  const digits = normalizeString(value).replace(/\D/g, '');
  if (!digits) return '+900000000000';
  if (digits.startsWith('90')) return `+${digits}`;
  if (digits.startsWith('0')) return `+90${digits.slice(1)}`;
  return `+90${digits}`;
}

function mapBasketItems(orderItems) {
  return (Array.isArray(orderItems) ? orderItems : []).map((item, index) => ({
    id: normalizeString(item.productCode || item.productId || `item-${index + 1}`).slice(0, 64),
    name: normalizeString(item.productName || 'Urun').slice(0, 120),
    category1: normalizeString(item.category || 'Genel').slice(0, 64),
    itemType: 'PHYSICAL',
    price: safePrice(item.lineTotal || 0),
  }));
}

async function initializeCheckoutForm({
  config,
  merchantOid,
  customer,
  orderItems,
  total,
  callbackUrl,
  userIp,
}) {
  const { name, surname } = splitFullName(customer?.name);
  const basketItems = mapBasketItems(orderItems);
  if (!basketItems.length) {
    throw new Error('Iyzico basket is empty');
  }

  const payload = {
    locale: 'tr',
    conversationId: merchantOid,
    price: safePrice(total),
    paidPrice: safePrice(total),
    currency: 'TRY',
    basketId: merchantOid,
    paymentGroup: 'PRODUCT',
    callbackUrl,
    enabledInstallments: [1, 2, 3, 6, 9],
    buyer: {
      id: normalizeString(customer?.userId || customer?.email || merchantOid).slice(0, 64),
      name: name.slice(0, 100),
      surname: surname.slice(0, 120),
      gsmNumber: normalizePhone(customer?.phone),
      email: normalizeString(customer?.email).slice(0, 200),
      identityNumber: normalizeString(customer?.identityNumber, '11111111111').slice(0, 32),
      registrationAddress: normalizeString(customer?.address).slice(0, 300),
      ip: normalizeString(userIp, '127.0.0.1').slice(0, 64),
      city: normalizeString(customer?.city, 'Istanbul').slice(0, 120),
      country: 'Turkey',
      zipCode: normalizeString(customer?.zipCode, '34000').slice(0, 20),
    },
    shippingAddress: {
      contactName: normalizeString(customer?.name, `${name} ${surname}`).slice(0, 200),
      city: normalizeString(customer?.city, 'Istanbul').slice(0, 120),
      country: 'Turkey',
      address: normalizeString(customer?.address).slice(0, 400),
      zipCode: normalizeString(customer?.zipCode, '34000').slice(0, 20),
    },
    billingAddress: {
      contactName: normalizeString(customer?.name, `${name} ${surname}`).slice(0, 200),
      city: normalizeString(customer?.city, 'Istanbul').slice(0, 120),
      country: 'Turkey',
      address: normalizeString(customer?.address).slice(0, 400),
      zipCode: normalizeString(customer?.zipCode, '34000').slice(0, 20),
    },
    basketItems,
  };

  return iyzicoRequest({
    config,
    uriPath: '/payment/iyzipos/checkoutform/initialize/auth/ecom',
    payload,
  });
}

async function retrieveCheckoutResult({ config, token, conversationId }) {
  const payload = {
    locale: 'tr',
    conversationId: normalizeString(conversationId),
    token: normalizeString(token),
  };

  return iyzicoRequest({
    config,
    uriPath: '/payment/iyzipos/checkoutform/auth/ecom/detail',
    payload,
  });
}

async function refundPayment({
  config,
  paymentTransactionId,
  amount,
  reason,
  conversationId,
  ipAddress,
}) {
  const payload = {
    locale: 'tr',
    conversationId: normalizeString(conversationId),
    paymentTransactionId: normalizeString(paymentTransactionId),
    price: safePrice(amount),
    ip: normalizeString(ipAddress, '127.0.0.1'),
    currency: 'TRY',
    reason: normalizeString(reason, 'OTHER'),
  };

  return iyzicoRequest({
    config,
    uriPath: '/payment/refund',
    payload,
  });
}

module.exports = {
  normalizeString,
  normalizeAbsoluteHttpUrl,
  resolveIyzicoConfig,
  isIyzicoConfigured,
  initializeCheckoutForm,
  retrieveCheckoutResult,
  refundPayment,
};


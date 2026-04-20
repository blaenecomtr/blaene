const { resolveIyzicoConfig, isIyzicoConfigured, retrieveCheckoutResult } = require('./iyzico');
const { sendEmail } = require('../email/resend');
const { orderConfirmationTemplate } = require('../email/templates');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(raw) {
  const text = String(raw || '').trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (_) {
    // no-op
  }

  const params = new URLSearchParams(text);
  const out = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

function buildSupabaseHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function selectOrderByMerchantOid({ supabaseUrl, serviceRoleKey, merchantOid }) {
  const params = new URLSearchParams();
  params.set('select', 'id,merchant_oid,payment_status,paid_at,status,payment_provider,customer_email,customer_name,total');
  params.set('merchant_oid', `eq.${merchantOid}`);
  params.set('limit', '1');

  const response = await fetch(`${supabaseUrl}/rest/v1/orders?${params.toString()}`, {
    method: 'GET',
    headers: buildSupabaseHeaders(serviceRoleKey),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error || 'Siparis sorgusu basarisiz.';
    throw new Error(message);
  }

  if (!Array.isArray(data) || !data.length) return null;
  return data[0];
}

async function updateOrderStatus({ supabaseUrl, serviceRoleKey, orderId, payload }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.message || data?.error || 'Siparis guncellemesi basarisiz.';
    throw new Error(message);
  }
}

async function insertPaymentEvent({ supabaseUrl, serviceRoleKey, payload }) {
  await fetch(`${supabaseUrl}/rest/v1/payment_events`, {
    method: 'POST',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
}

async function selectOrderItemsByOrderId({ supabaseUrl, serviceRoleKey, orderId }) {
  const params = new URLSearchParams();
  params.set('select', 'product_id,quantity');
  params.set('order_id', `eq.${orderId}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/order_items?${params.toString()}`, {
    method: 'GET',
    headers: buildSupabaseHeaders(serviceRoleKey),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) return [];
  return data;
}

async function selectProductStockByProductId({ supabaseUrl, serviceRoleKey, productId }) {
  const params = new URLSearchParams();
  params.set('select', 'id,stock_quantity');
  params.set('id', `eq.${productId}`);
  params.set('limit', '1');

  const response = await fetch(`${supabaseUrl}/rest/v1/products?${params.toString()}`, {
    method: 'GET',
    headers: buildSupabaseHeaders(serviceRoleKey),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data) || !data.length) return null;
  return data[0];
}

async function decrementProductStock({ supabaseUrl, serviceRoleKey, productId, quantity }) {
  const product = await selectProductStockByProductId({ supabaseUrl, serviceRoleKey, productId });
  if (!product) return;

  const currentStock = Number(product.stock_quantity || 0);
  const newStock = Math.max(0, currentStock - (quantity || 1));

  await fetch(`${supabaseUrl}/rest/v1/products?id=eq.${productId}`, {
    method: 'PATCH',
    headers: {
      ...buildSupabaseHeaders(serviceRoleKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ stock_quantity: newStock }),
  }).catch(() => null);
}

function extractPaymentTransactionIds(retrieveResult) {
  const list = Array.isArray(retrieveResult?.itemTransactions) ? retrieveResult.itemTransactions : [];
  return list
    .map((item) => String(item?.paymentTransactionId || '').trim())
    .filter(Boolean);
}

function normalizeAbsoluteHttpUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function resolveReturnUrl(success) {
  const explicitSuccess = normalizeAbsoluteHttpUrl(process.env.IYZICO_SUCCESS_URL);
  const explicitFail = normalizeAbsoluteHttpUrl(process.env.IYZICO_FAIL_URL);
  const paytrOk = normalizeAbsoluteHttpUrl(process.env.PAYTR_OK_URL);
  const paytrFail = normalizeAbsoluteHttpUrl(process.env.PAYTR_FAIL_URL);
  const siteUrl = normalizeAbsoluteHttpUrl(process.env.SITE_URL);
  const siteBase = siteUrl ? siteUrl.replace(/\/$/, '') : '';

  if (success) {
    return explicitSuccess || paytrOk || (siteBase ? `${siteBase}/checkout.html?pay=ok` : '');
  }
  return explicitFail || paytrFail || (siteBase ? `${siteBase}/checkout.html?pay=fail` : '');
}

function finishCallbackResponse(res, success) {
  const redirectUrl = resolveReturnUrl(success);
  if (redirectUrl) {
    res.statusCode = 303;
    res.setHeader('Location', redirectUrl);
    res.end('');
    return;
  }

  res.statusCode = success ? 200 : 500;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(success ? 'OK' : 'FAIL');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method Not Allowed');
    return;
  }

  const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'IYZICO_API_KEY', 'IYZICO_SECRET_KEY'];
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Missing env');
    return;
  }

  const iyzicoConfig = resolveIyzicoConfig(process.env);
  if (!isIyzicoConfigured(iyzicoConfig)) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Iyzico not configured');
    return;
  }

  let payload = {};
  try {
    payload = parseBody(await getRawBody(req));
  } catch {
    payload = {};
  }

  const requestUrl = new URL(req.url, 'http://localhost');
  const merchantOid = String(
    payload.merchant_oid || payload.conversationId || requestUrl.searchParams.get('merchant_oid') || ''
  ).trim();
  const token = String(payload.token || requestUrl.searchParams.get('token') || '').trim();

  if (!merchantOid || !token) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const retrieve = await retrieveCheckoutResult({
      config: iyzicoConfig,
      token,
      conversationId: merchantOid,
    });

    const paymentStatus = String(
      retrieve?.paymentStatus || retrieve?.status || retrieve?.iyziEventType || ''
    ).toLowerCase();
    const success = paymentStatus === 'success';

    const order = await selectOrderByMerchantOid({
      supabaseUrl,
      serviceRoleKey,
      merchantOid,
    });

    if (!order) {
      await insertPaymentEvent({
        supabaseUrl,
        serviceRoleKey,
        payload: {
          order_id: null,
          merchant_oid: merchantOid,
          status: success ? 'success' : 'failed',
          payload: {
            source: 'iyzico',
            callback: payload,
            retrieve,
          },
        },
      });
      finishCallbackResponse(res, success);
      return;
    }

    const wasPaid = String(order.payment_status || '').toLowerCase() === 'paid';

    // Idempotency: already paid order should not re-run stock update.
    if (success && wasPaid) {
      await insertPaymentEvent({
        supabaseUrl,
        serviceRoleKey,
        payload: {
          order_id: order.id,
          merchant_oid: merchantOid,
          status: 'success_duplicate',
          payload: {
            source: 'iyzico',
            callback: payload,
            retrieve,
          },
        },
      });
      finishCallbackResponse(res, true);
      return;
    }

    const updatePayload = {
      payment_status: success ? 'paid' : 'failed',
      paytr_status: success ? 'iyzico_success' : 'iyzico_failed',
      failed_reason_code: success ? null : String(retrieve?.errorCode || payload?.errorCode || '').slice(0, 120) || null,
      failed_reason_msg: success ? null : String(retrieve?.errorMessage || payload?.errorMessage || '').slice(0, 500) || null,
    };

    if (success && !order.paid_at) {
      updatePayload.paid_at = new Date().toISOString();
    }
    if (success && String(order.status || '').toLowerCase() === 'pending') {
      updatePayload.status = 'processing';
    }

    await updateOrderStatus({
      supabaseUrl,
      serviceRoleKey,
      orderId: order.id,
      payload: updatePayload,
    });

    await insertPaymentEvent({
      supabaseUrl,
      serviceRoleKey,
      payload: {
        order_id: order.id,
        merchant_oid: merchantOid,
        status: success ? 'success' : 'failed',
        payload: {
          source: 'iyzico',
          callback: payload,
          retrieve,
          payment_transaction_ids: extractPaymentTransactionIds(retrieve),
        },
      },
    });

    if (success && !wasPaid) {
      try {
        const orderItems = await selectOrderItemsByOrderId({
          supabaseUrl,
          serviceRoleKey,
          orderId: order.id,
        });
        for (const item of orderItems) {
          await decrementProductStock({
            supabaseUrl,
            serviceRoleKey,
            productId: item.product_id,
            quantity: item.quantity,
          });
        }
      } catch (_) {
        // Ignore stock failures on callback response path.
      }

      try {
        if (order.customer_email) {
          await sendEmail({
            to: order.customer_email,
            subject: `Siparişiniz Alındı #${merchantOid}`,
            html: orderConfirmationTemplate({
              orderNo: merchantOid,
              customerName: order.customer_name || null,
              total: order.total ? `${order.total}` : null,
            }),
          });
        }
      } catch (_) {
        // Mail hatası siparişi engellemesin.
      }
    }

    finishCallbackResponse(res, success);
  } catch (error) {
    await insertPaymentEvent({
      supabaseUrl,
      serviceRoleKey,
      payload: {
        order_id: null,
        merchant_oid: merchantOid,
        status: 'callback_error',
        payload: {
          source: 'iyzico',
          callback: payload,
          error: String(error?.message || 'Callback error').slice(0, 500),
        },
      },
    });
    finishCallbackResponse(res, false);
  }
};

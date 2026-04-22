const crypto = require('crypto');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseForm(raw) {
  const params = new URLSearchParams(raw || '');
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

function createExpectedHash({ merchantOid, status, totalAmount, merchantKey, merchantSalt }) {
  return crypto
    .createHmac('sha256', merchantKey)
    .update(`${merchantOid}${merchantSalt}${status}${totalAmount}`)
    .digest('base64');
}

function isHashEqual(expected, received) {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function selectOrderByMerchantOid({ supabaseUrl, serviceRoleKey, merchantOid }) {
  const params = new URLSearchParams();
  params.set('select', 'id,merchant_oid,payment_status,paid_at,status');
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

  if (!Array.isArray(data) || !data.length) {
    return null;
  }

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
  });
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method Not Allowed');
    return;
  }

  const requiredEnv = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
  ];
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Missing env');
    return;
  }

  let form = null;
  try {
    const raw = await getRawBody(req);
    form = parseForm(raw);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  const merchantOid = String(form.merchant_oid || '').trim();
  const status = String(form.status || '').trim();
  const totalAmount = String(form.total_amount || '').trim();
  const receivedHash = String(form.hash || '').trim();

  if (!merchantOid || !status || !totalAmount || !receivedHash) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  if (status !== 'success' && status !== 'failed') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  const parsedTotalAmount = Number.parseInt(totalAmount, 10);
  if (!Number.isFinite(parsedTotalAmount) || parsedTotalAmount < 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  const expectedHash = createExpectedHash({
    merchantOid,
    status,
    totalAmount,
    merchantKey: process.env.PAYTR_MERCHANT_KEY,
    merchantSalt: process.env.PAYTR_MERCHANT_SALT,
  });

  if (!isHashEqual(expectedHash, receivedHash)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Invalid Hash');
    return;
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
          status,
          payload: form,
        },
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('OK');
      return;
    }

    const wasPaid = String(order.payment_status || '').toLowerCase() === 'paid';

    if (wasPaid && status !== 'success') {
      await insertPaymentEvent({
        supabaseUrl,
        serviceRoleKey,
        payload: {
          order_id: order.id,
          merchant_oid: merchantOid,
          status,
          payload: form,
        },
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('OK');
      return;
    }

    // Idempotency: if order is already paid and callback says success again, do not re-run stock updates.
    if (wasPaid && status === 'success') {
      await insertPaymentEvent({
        supabaseUrl,
        serviceRoleKey,
        payload: {
          order_id: order.id,
          merchant_oid: merchantOid,
          status: 'success_duplicate',
          payload: form,
        },
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('OK');
      return;
    }

    const paymentStatus = status === 'success' ? 'paid' : 'failed';
    const updatePayload = {
      payment_status: paymentStatus,
      paytr_status: status,
      paytr_total_amount: parsedTotalAmount,
      failed_reason_code: form.failed_reason_code || null,
      failed_reason_msg: form.failed_reason_msg || null,
    };

    if (status === 'success' && !order.paid_at) {
      updatePayload.paid_at = new Date().toISOString();
    }
    if (status === 'success' && String(order.status || '').toLowerCase() === 'pending') {
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
        status,
        payload: form,
      },
    });

    // Decrement stock on successful payment
    if (status === 'success' && !wasPaid) {
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
        // Stock decrement failure should not block payment response
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('OK');
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Server Error');
  }
};

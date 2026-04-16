const http = require('http');
const crypto = require('crypto');

const callbackHandler = require('../lib/payments/paytr-callback');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function startServer(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.removeListener('error', reject);
      const address = server.address();
      resolve(address?.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function createCallbackHash({ merchantOid, status, totalAmount, merchantKey, merchantSalt }) {
  return crypto
    .createHmac('sha256', merchantKey)
    .update(`${merchantOid}${merchantSalt}${status}${totalAmount}`)
    .digest('base64');
}

async function sendCallbackRequest({
  callbackUrl,
  merchantOid,
  status,
  totalAmount,
  merchantKey,
  merchantSalt,
  failedReasonCode = '',
  failedReasonMsg = '',
}) {
  const hash = createCallbackHash({
    merchantOid,
    status,
    totalAmount,
    merchantKey,
    merchantSalt,
  });

  const body = new URLSearchParams({
    merchant_oid: merchantOid,
    status,
    total_amount: String(totalAmount),
    hash,
  });

  if (status === 'failed') {
    body.set('failed_reason_code', failedReasonCode);
    body.set('failed_reason_msg', failedReasonMsg);
  }

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Callback HTTP ${response.status}: ${text || 'No response body'}`);
  }

  if (text.trim() !== 'OK') {
    throw new Error(`Callback unexpected response: ${text}`);
  }
}

async function main() {
  const merchantKey = 'SMOKE_MERCHANT_KEY';
  const merchantSalt = 'SMOKE_MERCHANT_SALT';
  const merchantOid = `BLN-SMOKE-${Date.now()}`;
  const totalAmount = 349900;

  const state = {
    order: {
      id: 'order-smoke-1',
      merchant_oid: merchantOid,
      payment_status: 'pending',
      paid_at: null,
      paytr_status: null,
      paytr_total_amount: null,
      failed_reason_code: null,
      failed_reason_msg: null,
    },
    paymentEvents: [],
  };

  const supabaseServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/rest/v1/orders') {
        const merchantOidFilter = String(url.searchParams.get('merchant_oid') || '');
        const merchantOidValue = merchantOidFilter.startsWith('eq.')
          ? merchantOidFilter.slice(3)
          : '';

        const payload =
          merchantOidValue === state.order.merchant_oid
            ? [
                {
                  id: state.order.id,
                  merchant_oid: state.order.merchant_oid,
                  payment_status: state.order.payment_status,
                  paid_at: state.order.paid_at,
                },
              ]
            : [];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      if (req.method === 'PATCH' && url.pathname === '/rest/v1/orders') {
        const idFilter = String(url.searchParams.get('id') || '');
        const orderId = idFilter.startsWith('eq.') ? idFilter.slice(3) : '';
        const raw = await readRawBody(req);
        const patch = raw ? JSON.parse(raw) : {};

        if (orderId !== state.order.id) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Order not found' }));
          return;
        }

        state.order = { ...state.order, ...patch };
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/rest/v1/payment_events') {
        const raw = await readRawBody(req);
        const event = raw ? JSON.parse(raw) : {};
        state.paymentEvents.push(event);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: error.message || 'Mock server error' }));
    }
  });

  const callbackServer = http.createServer((req, res) => {
    if (req.url.startsWith('/api/public/paytr-callback')) {
      callbackHandler(req, res);
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  });

  const supabasePort = await startServer(supabaseServer);
  const callbackPort = await startServer(callbackServer);

  process.env.SUPABASE_URL = `http://127.0.0.1:${supabasePort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'SMOKE_SERVICE_ROLE_KEY';
  process.env.PAYTR_MERCHANT_KEY = merchantKey;
  process.env.PAYTR_MERCHANT_SALT = merchantSalt;

  const callbackUrl = `http://127.0.0.1:${callbackPort}/api/public/paytr-callback`;

  try {
    console.log('Running success callback...');
    await sendCallbackRequest({
      callbackUrl,
      merchantOid,
      status: 'success',
      totalAmount,
      merchantKey,
      merchantSalt,
    });

    if (state.order.payment_status !== 'paid') {
      throw new Error(`Expected payment_status=paid, got ${state.order.payment_status}`);
    }

    console.log('Running failed callback after paid to verify idempotency guard...');
    await sendCallbackRequest({
      callbackUrl,
      merchantOid,
      status: 'failed',
      totalAmount,
      merchantKey,
      merchantSalt,
      failedReasonCode: '99',
      failedReasonMsg: 'Smoke test fail event',
    });

    if (state.order.payment_status !== 'paid') {
      throw new Error(`Expected paid status to remain unchanged, got ${state.order.payment_status}`);
    }

    if (state.paymentEvents.length < 2) {
      throw new Error(`Expected at least 2 payment events, got ${state.paymentEvents.length}`);
    }

    console.log('\nSmoke test passed.');
    console.log(`Order status: ${state.order.payment_status}`);
    console.log(`Payment events: ${state.paymentEvents.length}`);
  } finally {
    await closeServer(callbackServer);
    await closeServer(supabaseServer);
  }
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message || error}`);
  process.exit(1);
});

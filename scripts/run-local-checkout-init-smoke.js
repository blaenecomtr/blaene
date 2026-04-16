const http = require('http');

const checkoutInitHandler = require('../api/public/checkout-init');

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

function parseCodeInFilter(value) {
  const raw = String(value || '');
  if (!raw.startsWith('in.(') || !raw.endsWith(')')) return [];
  const inner = raw.slice(4, -1);
  const regex = /"((?:\\.|[^"\\])*)"/g;
  const codes = [];
  let match = regex.exec(inner);
  while (match) {
    codes.push(match[1].replaceAll('\\"', '"').toUpperCase());
    match = regex.exec(inner);
  }
  return codes;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { response, data, text };
}

async function main() {
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CHECKOUT_REQUIRE_AUTH: process.env.CHECKOUT_REQUIRE_AUTH,
    CHECKOUT_MODE: process.env.CHECKOUT_MODE,
    MOCK_CHECKOUT_MODE: process.env.MOCK_CHECKOUT_MODE,
    PAYTR_MERCHANT_ID: process.env.PAYTR_MERCHANT_ID,
    PAYTR_MERCHANT_KEY: process.env.PAYTR_MERCHANT_KEY,
    PAYTR_MERCHANT_SALT: process.env.PAYTR_MERCHANT_SALT,
    SITE_URL: process.env.SITE_URL,
  };

  const state = {
    products: [
      {
        id: 'prod-1',
        code: 'FRG-001',
        name: 'Forge Raf',
        price: 1200,
        active: true,
        images: ['https://example.com/forge.jpg'],
        category: 'forge',
      },
    ],
    orders: [],
    orderItems: [],
  };

  const supabaseServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/rest/v1/products') {
        const requestedCodes = parseCodeInFilter(url.searchParams.get('code'));
        const rows = state.products.filter((product) => requestedCodes.includes(String(product.code).toUpperCase()));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/rest/v1/orders') {
        const raw = await readRawBody(req);
        const payload = raw ? JSON.parse(raw) : {};
        const order = { id: `order-${state.orders.length + 1}`, ...payload };
        state.orders.push(order);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([order]));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/rest/v1/order_items') {
        const raw = await readRawBody(req);
        const payload = raw ? JSON.parse(raw) : [];
        const rows = Array.isArray(payload) ? payload : [];
        state.orderItems.push(...rows);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }

      if (req.method === 'PATCH' && url.pathname === '/rest/v1/orders') {
        const idFilter = String(url.searchParams.get('id') || '');
        const orderId = idFilter.startsWith('eq.') ? idFilter.slice(3) : '';
        const raw = await readRawBody(req);
        const patch = raw ? JSON.parse(raw) : {};
        const order = state.orders.find((row) => row.id === orderId);

        if (!order) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Order not found' }));
          return;
        }

        Object.assign(order, patch);
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: error?.message || 'Mock server error' }));
    }
  });

  const apiServer = http.createServer((req, res) => {
    if (req.url.startsWith('/api/public/checkout-init')) {
      checkoutInitHandler(req, res);
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  const supabasePort = await startServer(supabaseServer);
  const apiPort = await startServer(apiServer);

  process.env.SUPABASE_URL = `http://127.0.0.1:${supabasePort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'SMOKE_SERVICE_ROLE_KEY';
  process.env.CHECKOUT_REQUIRE_AUTH = 'false';
  process.env.CHECKOUT_MODE = 'mock';
  process.env.MOCK_CHECKOUT_MODE = 'true';
  process.env.SITE_URL = `http://127.0.0.1:${apiPort}`;
  delete process.env.PAYTR_MERCHANT_ID;
  delete process.env.PAYTR_MERCHANT_KEY;
  delete process.env.PAYTR_MERCHANT_SALT;

  const apiUrl = `http://127.0.0.1:${apiPort}/api/public/checkout-init`;

  try {
    console.log('Running checkout-init success (mock mode)...');
    const success = await postJson(apiUrl, {
      customer: {
        name: 'Smoke Test',
        email: 'smoke@example.com',
        phone: '05551234567',
        city: 'Istanbul',
        address: 'Test Mah. 1',
        note: 'smoke',
      },
      cart: [{ code: 'FRG-001', quantity: 2 }],
    });

    assert(success.response.status === 200, `Expected HTTP 200, got ${success.response.status}`);
    assert(success.data?.ok === true, 'Expected ok=true in response payload');
    assert(success.data?.mode === 'mock', `Expected mode=mock, got ${success.data?.mode}`);
    assert(state.orders.length === 1, `Expected 1 order, got ${state.orders.length}`);
    assert(state.orderItems.length === 1, `Expected 1 order item row, got ${state.orderItems.length}`);
    assert(state.orders[0].payment_provider === 'mock', 'Expected payment_provider=mock');
    assert(state.orders[0].payment_status === 'pending', 'Expected payment_status=pending');
    assert(Number(state.orders[0].total) === 2400, `Expected total=2400, got ${state.orders[0].total}`);
    assert(Number(state.orderItems[0].quantity) === 2, `Expected quantity=2, got ${state.orderItems[0].quantity}`);

    console.log('Running checkout-init failure for unknown product...');
    const fail = await postJson(apiUrl, {
      customer: {
        name: 'Smoke Test',
        email: 'smoke@example.com',
        phone: '05551234567',
        city: 'Istanbul',
        address: 'Test Mah. 1',
      },
      cart: [{ code: 'INVALID-001', quantity: 1 }],
    });

    assert(fail.response.status === 400, `Expected HTTP 400 for invalid cart, got ${fail.response.status}`);
    assert(fail.data?.ok === false, 'Expected ok=false for invalid cart response');
    assert(state.orders.length === 1, 'Invalid request should not create a new order');

    console.log('\nCheckout-init smoke test passed.');
    console.log(`Orders created: ${state.orders.length}`);
    console.log(`Order items created: ${state.orderItems.length}`);
  } finally {
    await closeServer(apiServer);
    await closeServer(supabaseServer);

    if (originalEnv.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;

    if (originalEnv.SUPABASE_SERVICE_ROLE_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;

    if (originalEnv.CHECKOUT_REQUIRE_AUTH === undefined) delete process.env.CHECKOUT_REQUIRE_AUTH;
    else process.env.CHECKOUT_REQUIRE_AUTH = originalEnv.CHECKOUT_REQUIRE_AUTH;

    if (originalEnv.CHECKOUT_MODE === undefined) delete process.env.CHECKOUT_MODE;
    else process.env.CHECKOUT_MODE = originalEnv.CHECKOUT_MODE;

    if (originalEnv.MOCK_CHECKOUT_MODE === undefined) delete process.env.MOCK_CHECKOUT_MODE;
    else process.env.MOCK_CHECKOUT_MODE = originalEnv.MOCK_CHECKOUT_MODE;

    if (originalEnv.PAYTR_MERCHANT_ID === undefined) delete process.env.PAYTR_MERCHANT_ID;
    else process.env.PAYTR_MERCHANT_ID = originalEnv.PAYTR_MERCHANT_ID;

    if (originalEnv.PAYTR_MERCHANT_KEY === undefined) delete process.env.PAYTR_MERCHANT_KEY;
    else process.env.PAYTR_MERCHANT_KEY = originalEnv.PAYTR_MERCHANT_KEY;

    if (originalEnv.PAYTR_MERCHANT_SALT === undefined) delete process.env.PAYTR_MERCHANT_SALT;
    else process.env.PAYTR_MERCHANT_SALT = originalEnv.PAYTR_MERCHANT_SALT;

    if (originalEnv.SITE_URL === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = originalEnv.SITE_URL;
  }
}

main().catch((error) => {
  console.error(`Checkout-init smoke test failed: ${error?.message || error}`);
  process.exit(1);
});

function getRouteKey(req) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/+/, '');
  const parts = path.split('/');
  const pubIndex = parts.findIndex((part) => part === 'public');
  if (pubIndex < 0) return '';
  return parts.slice(pubIndex + 1).filter(Boolean).join('/');
}

const handlers = {
  'checkout-init': require('../../lib/handlers/public-checkout-init'),
  'checkout-settings': require('../../lib/handlers/public-checkout-settings'),
  contact: require('../../lib/handlers/public-contact'),
  'forgot-password': require('../../lib/handlers/public-forgot-password'),
  'iyzico-callback': require('../../lib/handlers/public-iyzico-callback'),
  'order-cancel': require('../../lib/handlers/public-order-cancel'),
  'paytr-callback': require('../../lib/handlers/public-paytr-callback'),
  'promo-validate': require('../../lib/handlers/public-promo-validate'),
  returns: require('../../lib/handlers/public-returns'),
  'auth-webhook': require('../../lib/handlers/public-auth-webhook'),
  'site-content': require('../../lib/handlers/public-site-content'),
  traffic: require('../../lib/handlers/public-traffic'),
};

module.exports = async function pubRouteHandler(req, res) {
  const routeKey = getRouteKey(req);
  const handler = handlers[routeKey];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found', code: 'PUB_ROUTE_NOT_FOUND' }));
    return;
  }
  return handler(req, res);
};

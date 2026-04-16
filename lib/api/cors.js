const DEFAULT_ALLOWED = 'https://www.blaene.com.tr';
const DEFAULT_ALLOWED_WWW = 'https://blaene.com.tr';
const LOCAL_ALLOWED = 'http://localhost:3000';
const LOCAL_ALLOWED_ALT = 'http://127.0.0.1:3000';

function getAllowedOrigins() {
  const raw = String(process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!raw.length) {
    return [DEFAULT_ALLOWED, DEFAULT_ALLOWED_WWW, LOCAL_ALLOWED, LOCAL_ALLOWED_ALT];
  }
  return raw;
}

function resolveOrigin(req) {
  return String(req.headers.origin || '').trim();
}

function applyCors(req, res) {
  const origin = resolveOrigin(req);
  const allowed = getAllowedOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function isOriginAllowed(req) {
  const origin = resolveOrigin(req);
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}

function handlePreflight(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

module.exports = {
  applyCors,
  isOriginAllowed,
  getAllowedOrigins,
  handlePreflight,
};

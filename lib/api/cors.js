const DEFAULT_ALLOWED = 'https://www.blaene.com.tr';
const DEFAULT_ALLOWED_WWW = 'https://blaene.com.tr';
const LOCAL_ALLOWED = 'http://localhost:3000';
const LOCAL_ALLOWED_ALT = 'http://127.0.0.1:3000';
const LOCAL_ALLOWED_VITE = 'http://localhost:5173';
const LOCAL_ALLOWED_VITE_ALT = 'http://127.0.0.1:5173';
const TRUSTED_HTTPS_HOSTS = ['blaene.com.tr', 'www.blaene.com.tr'];
const TRUSTED_HTTPS_SUFFIXES = ['.blaene.com.tr', '.vercel.app'];

function getAllowedOrigins() {
  const raw = String(process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const defaults = [
    DEFAULT_ALLOWED,
    DEFAULT_ALLOWED_WWW,
    LOCAL_ALLOWED,
    LOCAL_ALLOWED_ALT,
    LOCAL_ALLOWED_VITE,
    LOCAL_ALLOWED_VITE_ALT,
  ];

  return Array.from(new Set([...raw, ...defaults]));
}

function resolveOrigin(req) {
  return String(req.headers.origin || '').trim();
}

function isTrustedOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const protocol = String(parsed.protocol || '').toLowerCase();
    const hostname = String(parsed.hostname || '').toLowerCase();

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return protocol === 'http:' || protocol === 'https:';
    }

    if (protocol !== 'https:') return false;
    if (TRUSTED_HTTPS_HOSTS.includes(hostname)) return true;
    return TRUSTED_HTTPS_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = resolveOrigin(req);
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && (allowed.includes(origin) || isTrustedOrigin(origin)) ? origin : allowed[0];

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function isOriginAllowed(req) {
  const origin = resolveOrigin(req);
  if (!origin) return true;
  return getAllowedOrigins().includes(origin) || isTrustedOrigin(origin);
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

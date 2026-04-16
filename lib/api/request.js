function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function extractBearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header) return '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function getRequestPath(req) {
  const raw = String(req.url || '').trim();
  if (!raw) return '/';
  return raw.split('?')[0] || '/';
}

function getOrigin(req) {
  return String(req.headers.origin || '').trim();
}

function parseJsonSafely(raw) {
  if (raw === undefined || raw === null) return null;
  const asText = String(raw).trim();
  if (!asText) return null;
  try {
    return JSON.parse(asText);
  } catch {
    return null;
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  const body = parseJsonSafely(raw);
  return {
    raw,
    body,
  };
}

module.exports = {
  extractBearerToken,
  getClientIp,
  getRequestPath,
  getOrigin,
  parseJsonSafely,
  readRawBody,
  readJsonBody,
};

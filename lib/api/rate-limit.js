const memoryStore = new Map();

function normalizeNumber(input, fallback) {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nowMs() {
  return Date.now();
}

function pruneExpired(key, timestamp) {
  const item = memoryStore.get(key);
  if (!item) return null;
  if (item.resetAt <= timestamp) {
    memoryStore.delete(key);
    return null;
  }
  return item;
}

function memoryRateLimit({ key, limit, windowMs }) {
  const now = nowMs();
  let entry = pruneExpired(key, now);

  if (!entry) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  }

  entry.count += 1;
  const allowed = entry.count <= limit;
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSec,
    resetAt: entry.resetAt,
    source: 'memory',
  };
}

async function upstashRateLimit({ key, limit, windowSec }) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const safeKey = encodeURIComponent(key);
  const incrUrl = `${url}/incr/${safeKey}`;
  const expireUrl = `${url}/expire/${safeKey}/${windowSec}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  const incrResponse = await fetch(incrUrl, { method: 'POST', headers });
  if (!incrResponse.ok) return null;
  const incrData = await incrResponse.json().catch(() => null);
  const count = Number(incrData?.result || 0);
  if (!Number.isFinite(count) || count <= 0) return null;

  if (count === 1) {
    await fetch(expireUrl, { method: 'POST', headers }).catch(() => null);
  }

  const allowed = count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: windowSec,
    resetAt: Date.now() + (windowSec * 1000),
    source: 'upstash',
  };
}

async function applyRateLimit({ key, limit, windowMs }) {
  const safeLimit = normalizeNumber(limit, 60);
  const safeWindowMs = normalizeNumber(windowMs, 60 * 1000);
  const safeWindowSec = Math.ceil(safeWindowMs / 1000);

  const upstash = await upstashRateLimit({
    key,
    limit: safeLimit,
    windowSec: safeWindowSec,
  }).catch(() => null);

  if (upstash) return upstash;

  return memoryRateLimit({
    key,
    limit: safeLimit,
    windowMs: safeWindowMs,
  });
}

module.exports = {
  applyRateLimit,
};


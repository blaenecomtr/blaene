const { normalizeText } = require('./validation');

function getSupabaseConfig() {
  return {
    url: normalizeText(process.env.SUPABASE_URL, 500),
    serviceRoleKey: normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY, 4000),
    anonKey: normalizeText(process.env.SUPABASE_ANON_KEY, 4000),
  };
}

function assertSupabaseConfig() {
  const config = getSupabaseConfig();
  const missing = [];
  if (!config.url) missing.push('SUPABASE_URL');
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    const error = new Error(`Missing env: ${missing.join(', ')}`);
    error.code = 'MISSING_ENV';
    throw error;
  }
  return config;
}

function buildServiceHeaders(config) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function buildAuthHeaders(config, accessToken) {
  // Prefer service role on backend so auth checks don't break if anon/publishable key changes.
  const apiKey = config.serviceRoleKey || config.anonKey;
  return {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  return query.toString();
}

function buildRestUrl(config, tableOrPath, queryParams = undefined) {
  const path = String(tableOrPath || '').replace(/^\//, '');
  const query = queryParams ? buildQuery(queryParams) : '';
  return `${config.url}/rest/v1/${path}${query ? `?${query}` : ''}`;
}

async function parseJson(response) {
  return response.json().catch(() => null);
}

async function restSelect(config, table, queryParams = {}) {
  const url = buildRestUrl(config, table, queryParams);
  const response = await fetch(url, {
    method: 'GET',
    headers: buildServiceHeaders(config),
  });
  const data = await parseJson(response);
  if (!response.ok) {
    const message = data?.message || data?.error || `Failed select ${table}`;
    const error = new Error(message);
    error.code = 'SUPABASE_SELECT_FAILED';
    error.details = data;
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

async function restInsert(config, table, payload, options = {}) {
  const response = await fetch(buildRestUrl(config, table), {
    method: 'POST',
    headers: {
      ...buildServiceHeaders(config),
      Prefer: options.prefer || 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(response);
  if (!response.ok) {
    const message = data?.message || data?.error || `Failed insert ${table}`;
    const error = new Error(message);
    error.code = 'SUPABASE_INSERT_FAILED';
    error.details = data;
    throw error;
  }
  return data;
}

async function restUpdate(config, table, filters, payload, options = {}) {
  const query = buildQuery(filters);
  const url = `${buildRestUrl(config, table)}${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...buildServiceHeaders(config),
      Prefer: options.prefer || 'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await parseJson(response);
    const message = data?.message || data?.error || `Failed update ${table}`;
    const error = new Error(message);
    error.code = 'SUPABASE_UPDATE_FAILED';
    error.details = data;
    throw error;
  }
}

async function restDelete(config, table, filters, options = {}) {
  const query = buildQuery(filters);
  const url = `${buildRestUrl(config, table)}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...buildServiceHeaders(config),
      Prefer: options.prefer || 'return=minimal',
    },
  });
  if (!response.ok) {
    const data = await parseJson(response);
    const message = data?.message || data?.error || `Failed delete ${table}`;
    const error = new Error(message);
    error.code = 'SUPABASE_DELETE_FAILED';
    error.details = data;
    throw error;
  }
}

async function fetchAuthUser(config, accessToken) {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: 'GET',
    headers: buildAuthHeaders(config, accessToken),
  });
  const data = await parseJson(response);
  if (!response.ok || !data?.id) return null;
  return data;
}

module.exports = {
  assertSupabaseConfig,
  getSupabaseConfig,
  buildServiceHeaders,
  buildAuthHeaders,
  buildQuery,
  buildRestUrl,
  restSelect,
  restInsert,
  restUpdate,
  restDelete,
  fetchAuthUser,
};

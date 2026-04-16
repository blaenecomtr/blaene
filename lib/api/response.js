function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendSuccess(res, data = {}, statusCode = 200, meta = undefined) {
  const payload = { success: true, data };
  if (meta !== undefined) payload.meta = meta;
  sendJson(res, statusCode, payload);
}

function sendError(res, statusCode, error, code = 'UNKNOWN_ERROR', details = undefined) {
  const payload = {
    success: false,
    error: String(error || 'Unknown error'),
    code,
  };
  if (details !== undefined) payload.details = details;
  sendJson(res, statusCode, payload);
}

function sendLegacyOk(res, data = {}, statusCode = 200) {
  sendJson(res, statusCode, {
    ok: true,
    ...data,
  });
}

function sendLegacyError(res, statusCode, error) {
  sendJson(res, statusCode, {
    ok: false,
    error: String(error || 'Unknown error'),
  });
}

module.exports = {
  sendJson,
  sendSuccess,
  sendError,
  sendLegacyOk,
  sendLegacyError,
};

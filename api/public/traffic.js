const { createApiHandler } = require('../../lib/api/handler');
const { sendSuccess } = require('../../lib/api/response');
const { readJsonBody, getClientIp, getRequestPath } = require('../../lib/api/request');
const { normalizeText } = require('../../lib/api/validation');
const { restInsert } = require('../../lib/api/supabase');

const ALLOWED_EVENTS = ['page_view', 'click', 'custom'];

function sanitizeMetadata(body) {
  return {
    session_id: normalizeText(body.session_id, 160) || null,
    page_url: normalizeText(body.page_url, 1000) || null,
    page_path: normalizeText(body.page_path, 240) || null,
    referrer: normalizeText(body.referrer, 1000) || null,
    utm_source: normalizeText(body.utm_source, 120) || null,
    utm_medium: normalizeText(body.utm_medium, 120) || null,
    utm_campaign: normalizeText(body.utm_campaign, 180) || null,
    utm_term: normalizeText(body.utm_term, 180) || null,
    utm_content: normalizeText(body.utm_content, 180) || null,
    element_tag: normalizeText(body.element_tag, 40) || null,
    element_text: normalizeText(body.element_text, 160) || null,
    element_href: normalizeText(body.element_href, 1000) || null,
    country: normalizeText(body.country, 80) || null,
    city: normalizeText(body.city, 80) || null,
  };
}

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 240,
  },
  async (req, res, ctx) => {
    const parsed = await readJsonBody(req);
    const body = parsed?.body && typeof parsed.body === 'object' ? parsed.body : {};
    const eventTypeRaw = normalizeText(body.event_type, 40).toLowerCase();
    const eventType = ALLOWED_EVENTS.includes(eventTypeRaw) ? eventTypeRaw : 'custom';
    const pagePath = normalizeText(body.page_path, 240) || getRequestPath(req) || '/';

    const meta = sanitizeMetadata(body);
    // Vercel edge headers override client-sent geo data (more reliable)
    const vercelCity = normalizeText(req.headers['x-vercel-ip-city'] || '', 80) || null;
    const vercelCountry = normalizeText(req.headers['x-vercel-ip-country-name'] || req.headers['x-vercel-ip-country'] || '', 80) || null;
    if (vercelCity) meta.city = vercelCity;
    if (vercelCountry) meta.country = vercelCountry;

    const payload = {
      actor_user_id: null,
      actor_email: null,
      actor_role: null,
      action: `traffic.${eventType}`,
      entity_type: 'traffic',
      entity_id: pagePath,
      metadata: meta,
      request_path: pagePath,
      request_method: 'POST',
      ip_address: getClientIp(req),
      user_agent: normalizeText(req.headers['user-agent'] || '', 500),
    };

    await restInsert(ctx.config, 'audit_logs', payload, { prefer: 'return=minimal' }).catch(() => null);
    return sendSuccess(res, { ok: true });
  }
);

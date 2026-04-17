const { createApiHandler } = require('../../lib/api/handler');
const { sendError, sendSuccess } = require('../../lib/api/response');
const { normalizeText } = require('../../lib/api/validation');
const { restSelect } = require('../../lib/api/supabase');

const ALLOWED_KEYS = new Set(['homepage_banners']);

function sanitizeBanners(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null;
      const item = row;
      return {
        id: normalizeText(item.id, 120) || `banner-${index + 1}`,
        title: normalizeText(item.title, 180) || '',
        description: normalizeText(item.description, 500) || '',
        image_url: normalizeText(item.image_url, 2000) || '',
        link_url: normalizeText(item.link_url, 2000) || '',
        active: item.active !== false,
      };
    })
    .filter((item) => Boolean(item && item.image_url && item.active));
}

module.exports = createApiHandler(
  {
    methods: ['GET'],
    requireAuth: false,
    rateLimit: 240,
  },
  async (req, res, ctx) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const key = normalizeText(url.searchParams.get('key'), 120).toLowerCase();

    if (!ALLOWED_KEYS.has(key)) {
      return sendError(res, 400, 'Invalid key', 'VALIDATION_INVALID_KEY');
    }

    const rows = await restSelect(ctx.config, 'site_settings', {
      select: 'key,value_json,updated_at',
      key: `eq.${key}`,
      limit: 1,
    }).catch(() => []);

    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    const payload = {
      key,
      updated_at: row?.updated_at || null,
      banners: key === 'homepage_banners' ? sanitizeBanners(row?.value_json) : [],
    };

    return sendSuccess(res, payload);
  }
);


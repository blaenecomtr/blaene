const { createApiHandler } = require('../api/handler');
const { sendSuccess } = require('../api/response');
const { normalizeText } = require('../api/validation');
const { restSelect } = require('../api/supabase');

function normalizeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function isPromoActive(promo, now) {
  if (!promo || promo.is_active !== true) {
    return { valid: false, reasonCode: 'PROMO_INACTIVE', message: 'Gecersiz veya pasif indirim kodu.' };
  }

  if (promo.starts_at) {
    const startDate = new Date(promo.starts_at);
    if (!Number.isNaN(startDate.getTime()) && startDate > now) {
      return { valid: false, reasonCode: 'PROMO_NOT_STARTED', message: 'Bu indirim kodu henuz aktif degil.' };
    }
  }

  if (promo.ends_at) {
    const endDate = new Date(promo.ends_at);
    if (!Number.isNaN(endDate.getTime()) && endDate < now) {
      return { valid: false, reasonCode: 'PROMO_EXPIRED', message: 'Bu indirim kodunun suresi dolmus.' };
    }
  }

  const usageLimit = Number(promo.usage_limit || 0);
  const usageCount = Number(promo.usage_count || 0);
  if (usageLimit > 0 && usageCount >= usageLimit) {
    return { valid: false, reasonCode: 'PROMO_LIMIT_REACHED', message: 'Bu indirim kodu kullanim limitine ulasmis.' };
  }

  return { valid: true };
}

function calculateDiscount(subtotal, promo) {
  const total = normalizeAmount(subtotal);
  const promoValue = normalizeAmount(promo?.discount_value);
  if (total === null || promoValue === null) {
    return { discountAmount: null, totalAfterDiscount: null };
  }

  let discountAmount = 0;
  const promoType = String(promo?.discount_type || '').toLowerCase();
  if (promoType === 'percent') {
    discountAmount = total * (promoValue / 100);
  } else if (promoType === 'fixed') {
    discountAmount = promoValue;
  } else {
    return { discountAmount: null, totalAfterDiscount: null };
  }

  discountAmount = Math.max(0, Math.min(total, discountAmount));
  discountAmount = Math.round(discountAmount * 100) / 100;
  const totalAfterDiscount = Math.round((total - discountAmount) * 100) / 100;
  return { discountAmount, totalAfterDiscount };
}

module.exports = createApiHandler(
  {
    methods: ['GET'],
    requireAuth: false,
    rateLimit: 240,
  },
  async (req, res, ctx) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const code = normalizeText(url.searchParams.get('code'), 80).toUpperCase();
    const subtotal = normalizeAmount(url.searchParams.get('subtotal'));

    if (!code) {
      return sendSuccess(res, {
        valid: false,
        reason_code: 'PROMO_CODE_REQUIRED',
        message: 'Indirim kodu giriniz.',
      });
    }

    const rows = await restSelect(ctx.config, 'promotions', {
      select: 'id,code,title,discount_type,discount_value,usage_limit,usage_count,is_active,starts_at,ends_at',
      code: `eq.${code}`,
      limit: 1,
    }).catch(() => []);

    const promo = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!promo) {
      return sendSuccess(res, {
        valid: false,
        reason_code: 'PROMO_NOT_FOUND',
        message: 'Indirim kodu bulunamadi.',
      });
    }

    const validation = isPromoActive(promo, new Date());
    if (!validation.valid) {
      return sendSuccess(res, {
        valid: false,
        reason_code: validation.reasonCode,
        message: validation.message,
      });
    }

    const summary = calculateDiscount(subtotal, promo);

    return sendSuccess(res, {
      valid: true,
      promo: {
        code: String(promo.code || '').toUpperCase(),
        title: String(promo.title || '').trim(),
        discount_type: String(promo.discount_type || '').toLowerCase(),
        discount_value: normalizeAmount(promo.discount_value) || 0,
      },
      discount_amount: summary.discountAmount,
      total_after_discount: summary.totalAfterDiscount,
    });
  }
);


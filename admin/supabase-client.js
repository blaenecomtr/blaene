import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_uKwxlDCAxSOzus7W96aF9w_m2iDE2QA';

const URL_PLACEHOLDER = 'https://YOUR_PROJECT_REF.supabase.co';
const KEY_PLACEHOLDER = 'YOUR_PUBLIC_ANON_KEY';

export const isSupabaseConfigured =
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_URL !== URL_PLACEHOLDER &&
  SUPABASE_ANON_KEY !== KEY_PLACEHOLDER;

let client = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export const supabase = getSupabaseClient();

const CATEGORY_BY_CODE = {
  BTH: 'bath',
  FRG: 'forge',
  MDL: 'industrial',
};

export function inferCategoryFromCode(code = '') {
  const prefix = String(code).toUpperCase().split('-')[0];
  return CATEGORY_BY_CODE[prefix] || 'bath';
}

export function parseJsonArray(input, fallback = []) {
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input !== 'string' || !input.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function formatPrice(value, locale = 'tr-TR', currency = 'TRY') {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(number);
}

export function mapDbProductToUi(row) {
  const images = Array.isArray(row?.images) ? row.images.filter(Boolean) : [];
  const variants = Array.isArray(row?.variants) ? row.variants : parseJsonArray(row?.variants, []);
  const safeImages = images.length ? images : ['logo/sitelogo.png'];
  const safeVariants = variants
    .map((variant) => ({
      label: String(variant?.label || '').trim(),
      images: Array.isArray(variant?.images) ? variant.images.filter(Boolean) : [],
    }))
    .filter((variant) => variant.label && variant.images.length);

  return {
    id: row?.id || '',
    code: String(row?.code || '').trim(),
    name: String(row?.name || '').trim(),
    category: String(row?.category || inferCategoryFromCode(row?.code || '')),
    material: String(row?.material || '').trim(),
    thickness: String(row?.thickness || '').trim(),
    dims: String(row?.dims || '').trim(),
    description: String(row?.description || '').trim(),
    price: row?.price === null || row?.price === undefined || row?.price === '' ? null : Number(row.price),
    priceVisible: Boolean(row?.price_visible),
    images: safeImages,
    variants: safeVariants,
    displayOrder: Number.isFinite(Number(row?.display_order)) ? Number(row.display_order) : 0,
    active: row?.active === undefined ? true : Boolean(row.active),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

export function mapUiProductToDb(product) {
  return {
    code: product.code,
    name: product.name,
    category: product.category,
    material: product.material || null,
    thickness: product.thickness || null,
    dims: product.dims || null,
    description: product.description || null,
    price: product.price === null || product.price === undefined || product.price === '' ? null : Number(product.price),
    price_visible: Boolean(product.priceVisible),
    images: Array.isArray(product.images) ? product.images : [],
    variants: Array.isArray(product.variants) ? product.variants : [],
    display_order: Number.isFinite(Number(product.displayOrder)) ? Number(product.displayOrder) : 0,
    active: product.active !== false,
  };
}

import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://myufpjuyfjmpbunrkozy.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env variable is required');
  process.exit(1);
}
const KUNYE_DIR = join(import.meta.dirname, '..', 'KUNYE');

const COLOR_MAP = {
  'B': 'Beyaz',
  'S': 'Siyah',
  'MD': 'Mint Yeşili',
  'ST': 'Satine',
};

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function restGet(table, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function restPatch(table, matchParams, body) {
  const qs = new URLSearchParams(matchParams).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function restPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function restDelete(table, matchParams) {
  const qs = new URLSearchParams(matchParams).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`DELETE ${table} failed: ${res.status} ${await res.text()}`);
}

function scanKunyeDir() {
  const entries = readdirSync(KUNYE_DIR).filter(e => e.startsWith('BTH-'));
  const result = [];

  for (const productFolder of entries) {
    const productPath = join(KUNYE_DIR, productFolder);
    if (!statSync(productPath).isDirectory()) continue;

    const colorFolders = readdirSync(productPath).filter(e =>
      statSync(join(productPath, e)).isDirectory()
    );

    const colors = [];
    for (const colorFolder of colorFolders) {
      const suffix = colorFolder.replace(productFolder + '-', '');
      const colorName = COLOR_MAP[suffix.toUpperCase()];
      if (!colorName) {
        console.warn(`  Unknown color suffix: ${suffix} in ${colorFolder}`);
        continue;
      }

      const colorPath = join(productPath, colorFolder);
      const images = readdirSync(colorPath)
        .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .sort()
        .map(f => `KUNYE/${productFolder}/${colorFolder}/${f}`);

      if (images.length) {
        colors.push({ colorCode: suffix.toUpperCase(), colorName, images });
      }
    }

    result.push({ folderName: productFolder, colors });
  }

  return result;
}

function folderToDbCode(folderName) {
  if (folderName === 'BTH-014A') return 'BTH-014-A';
  return folderName;
}

async function main() {
  console.log('Scanning KUNYE directory...');
  const products = scanKunyeDir();
  console.log(`Found ${products.length} products\n`);

  const dbProducts = await restGet('products', {
    select: 'id,code,name',
    category: 'eq.bath',
    archived: 'eq.false',
    order: 'display_order.asc',
    limit: '100',
  });
  console.log(`Found ${dbProducts.length} bath products in DB\n`);

  const codeToProduct = {};
  for (const p of dbProducts) {
    codeToProduct[p.code.toUpperCase()] = p;
  }

  let totalVariants = 0;
  let totalProducts = 0;

  for (const prod of products) {
    const dbCode = folderToDbCode(prod.folderName);
    const dbProduct = codeToProduct[dbCode.toUpperCase()];

    if (!dbProduct) {
      console.warn(`⚠ No DB product found for ${prod.folderName} (tried code: ${dbCode})`);
      continue;
    }

    console.log(`\n--- ${dbProduct.code} (${dbProduct.id}) ---`);

    const existingVariants = await restGet('product_variants', {
      select: 'id,label,color',
      product_id: `eq.${dbProduct.id}`,
      limit: '50',
    });

    if (existingVariants.length) {
      console.log(`  Deleting ${existingVariants.length} existing variants...`);
      await restDelete('product_variants', { product_id: `eq.${dbProduct.id}` });
    }

    const newVariants = [];
    let firstColorImages = null;

    for (let i = 0; i < prod.colors.length; i++) {
      const c = prod.colors[i];
      if (i === 0) firstColorImages = c.images;

      const variant = {
        product_id: dbProduct.id,
        label: c.colorName,
        color: c.colorName,
        images: c.images,
        active: true,
        display_order: i,
        stock: 100,
      };

      console.log(`  + Variant: ${c.colorName} (${c.images.length} images)`);
      const inserted = await restPost('product_variants', variant);
      newVariants.push(inserted[0] || inserted);
      totalVariants++;
    }

    const variantsForCache = newVariants.map(v => ({
      id: v.id,
      label: v.label,
      color: v.color,
      images: v.images,
      active: v.active,
      display_order: v.display_order,
    }));

    const productImages = firstColorImages || prod.colors[0]?.images || [];

    await restPatch('products', { id: `eq.${dbProduct.id}` }, {
      images: productImages,
      variants: variantsForCache,
    });

    console.log(`  ✓ Updated product images & variants cache`);
    totalProducts++;
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated ${totalProducts} products, created ${totalVariants} variants`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

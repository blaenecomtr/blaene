#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
}

function parseEnvFile(filePath) {
  const raw = readText(filePath);
  if (!raw) return null;
  const out = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) return;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  });
  return out;
}

function makeCheck(name, pass, detail, fix) {
  return { name, pass, detail: detail || '', fix: fix || '' };
}

function hasToken(text, token) {
  return String(text || '').includes(token);
}

const root = process.cwd();
const checks = [];

const files = {
  contact: path.join(root, 'lib', 'handlers', 'public-contact.js'),
  auth: path.join(root, 'assets', 'js', 'user-auth.js'),
  pubRoute: path.join(root, 'api', 'public', '[...pub].js'),
  marketingCron: path.join(root, 'lib', 'handlers', 'public-marketing-cron.js'),
  adminRoute: path.join(root, 'api', 'admin', '[...route].js'),
  vercel: path.join(root, 'vercel.json'),
  envLocal: path.join(root, '.env.local'),
};

const contact = readText(files.contact);
const auth = readText(files.auth);
const pubRoute = readText(files.pubRoute);
const marketingCron = readText(files.marketingCron);
const adminRoute = readText(files.adminRoute);
const vercelRaw = readText(files.vercel);
const envLocal = parseEnvFile(files.envLocal);

checks.push(
  makeCheck(
    'Havale alici adresi',
    Boolean(contact) &&
      hasToken(contact, "DEFAULT_BANK_TRANSFER_NOTIFICATION_EMAIL = 'info@blaene.com.tr'") &&
      /function\s+resolveBankTransferNotificationEmail\(\)\s*{[\s\S]*return\s+DEFAULT_BANK_TRANSFER_NOTIFICATION_EMAIL;/.test(contact),
    'Havale bildirim alicisi info@blaene.com.tr olarak sabitlenmeli.',
    'public-contact.js icindeki resolveBankTransferNotificationEmail fonksiyonunu kontrol edin.'
  )
);

checks.push(
  makeCheck(
    'Havale urun gorselleri parse',
    Boolean(contact) &&
      hasToken(contact, 'function firstImageUrl(images)') &&
      hasToken(contact, 'JSON.parse(raw)') &&
      hasToken(contact, 'item.product_image || item.image || item.product_images || item.images'),
    'Urun gorselleri string/JSON/object formatlarinda cozulmeli.',
    'public-contact.js icinde firstImageUrl ve resolveItemImage bloklarini kontrol edin.'
  )
);

checks.push(
  makeCheck(
    'Google yonlendirme fallback',
    Boolean(auth) &&
      hasToken(auth, 'async function signInWithGoogle') &&
      hasToken(auth, 'Google yonlendirme baglantisi olusturulamadi'),
    'Google OAuth URL donmezse kullaniciya net hata donulmeli.',
    'assets/js/user-auth.js icindeki signInWithGoogle fonksiyonunu kontrol edin.'
  )
);

checks.push(
  makeCheck(
    'Dogrulama maili hizlandirma',
    Boolean(auth) &&
      hasToken(auth, 'void tryExpediteSignupVerificationEmail(client, email)') &&
      hasToken(auth, 'Dogrulama e-postasi yeniden tetiklendi'),
    'Signup sonrasi verification resend non-blocking tetiklenmeli.',
    'assets/js/user-auth.js icindeki signup error/not-confirmed akislarini kontrol edin.'
  )
);

checks.push(
  makeCheck(
    'Marketing cron route kaydi',
    Boolean(pubRoute) && hasToken(pubRoute, "'marketing-cron': require('../../lib/handlers/public-marketing-cron')"),
    '/api/public/marketing-cron route mapte olmali.',
    'api/public/[...pub].js icine marketing-cron handler kaydini ekleyin.'
  )
);

checks.push(
  makeCheck(
    'Marketing cron handler akislari',
    Boolean(marketingCron) &&
      hasToken(marketingCron, 'runAbandonedCartFlow') &&
      hasToken(marketingCron, 'runProductIntroFlow') &&
      hasToken(marketingCron, 'email.cart_abandoned.sent') &&
      hasToken(marketingCron, 'email.product_intro.sent'),
    'Sepet terk + urun tanitim mail akislarinin handlerda olmasi beklenir.',
    'lib/handlers/public-marketing-cron.js dosyasini kontrol edin.'
  )
);

checks.push(
  makeCheck(
    'Kargo mail tetikleme',
    Boolean(adminRoute) &&
      hasToken(adminRoute, 'sendOrderShippedEmailIfPossible') &&
      hasToken(adminRoute, "workflowStatus === 'shipped'"),
    'Siparis shipped oldugunda kargo maili tetiklenmeli.',
    'api/admin/[...route].js icindeki shipping/status update akislarini kontrol edin.'
  )
);

let vercel = null;
try {
  vercel = vercelRaw ? JSON.parse(vercelRaw) : null;
} catch (_) {
  vercel = null;
}
const hasMarketingCronSchedule =
  Boolean(vercel) &&
  Array.isArray(vercel.crons) &&
  vercel.crons.some((item) => item && item.path === '/api/public/marketing-cron');

checks.push(
  makeCheck(
    'Vercel cron schedule',
    hasMarketingCronSchedule,
    'vercel.json icinde /api/public/marketing-cron schedule kaydi olmali.',
    'vercel.json -> crons bolumune marketing-cron path ekleyin.'
  )
);

if (!envLocal) {
  checks.push(
    makeCheck(
      '.env.local dosyasi',
      false,
      '.env.local bulunamadi ya da okunamadi.',
      '.env.example dosyasini temel alarak .env.local olusturun.'
    )
  );
} else {
  const requiredEnvKeys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'MARKETING_CRON_SECRET',
  ];

  requiredEnvKeys.forEach((key) => {
    const value = String(envLocal[key] || '').trim();
    const pass = Boolean(value) && !/^change_me$/i.test(value);
    checks.push(
      makeCheck(
        `.env.local ${key}`,
        pass,
        pass ? 'Ayarli.' : 'Eksik veya placeholder.',
        `${key} degerini .env.local dosyasina gercek degerle ekleyin.`
      )
    );
  });
}

let passed = 0;
let failed = 0;

console.log('Mail Smoke Check');
console.log('================');
checks.forEach((check, index) => {
  const status = check.pass ? 'PASS' : 'FAIL';
  if (check.pass) passed += 1;
  else failed += 1;
  console.log(`${index + 1}. [${status}] ${check.name}`);
  if (!check.pass) {
    if (check.detail) console.log(`   Detay: ${check.detail}`);
    if (check.fix) console.log(`   Cozum: ${check.fix}`);
  }
});

console.log('----------------');
console.log(`Toplam: ${checks.length}, PASS: ${passed}, FAIL: ${failed}`);

if (failed > 0) {
  process.exitCode = 1;
}

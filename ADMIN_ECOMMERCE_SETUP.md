# Blaene Admin + E-Ticaret Kurulum Notlari

## 1) Supabase SQL
1. Supabase SQL Editor'de `supabase-setup.sql` dosyasini calistirin.
2. Ardindan `supabase-mvp-migration.sql` dosyasini calistirin (RBAC + yeni tablolar).
3. Auth > Users altindan bir admin kullanicisi olusturun.
4. Storage bucket `product-images` olusmus olmali.

## 2) Frontend Supabase Ayari
1. `admin/supabase-client.js` icindeki su iki alani doldurun:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
2. `assets/js/storefront.js` icindeki su iki alani doldurun:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## 3) Vercel Environment Variables
`.env.example` dosyasindaki degiskenleri Vercel Project Settings > Environment Variables alanina ekleyin.

Zorunlu anahtarlar:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGIN`
- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `SITE_URL`

Opsiyonel:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ANTHROPIC_API_KEY`
- `SHIPPING_YURTICI_API_KEY`, `SHIPPING_YURTICI_API_SECRET`
- `SHIPPING_MNG_API_KEY`, `SHIPPING_MNG_API_SECRET`
- `SHIPPING_ARAS_API_KEY`, `SHIPPING_ARAS_API_SECRET`

## 4) PayTR Ayari
1. PayTR panelinde callback URL olarak su endpoint'i girin:
   - `https://YOUR_DOMAIN/api/public/paytr-callback`
2. Test asamasinda `PAYTR_TEST_MODE=1` kullanin.
3. Canliya gecince `PAYTR_TEST_MODE=0` yapin.

PayTR anlasmasi yoksa gecici olarak `CHECKOUT_MODE=mock` kullanabilirsiniz.
Bu modda siparis olusur, durum `pending` kalir ve PayTR iFrame acilmaz.

## 5) Admin Sayfalari
- Login: `/admin/index.html`
- Urunler: `/admin/dashboard.html`
- Siparisler: `/admin/orders.html`
- Urun formu: `/admin/product.html`
- Seed: `/admin/seed.html`

## 6) E-Ticaret Akisi
1. Kategori veya urun sayfasindan `Sepete Ekle`.
2. `checkout.html` sayfasinda musteri bilgisi gir.
3. Sistem `/api/public/checkout-init` ile PayTR iFrame token uretir.
4. Odeme sonucu PayTR callback'i `/api/public/paytr-callback` endpoint'ine gelir.
5. Siparis durumu Admin > Siparisler ekranina duser.

## 7) Yeni Admin API Katmani
- Admin frontend artik `Authorization: Bearer <token>` ile `/api/admin/*` endpointlerini kullanir.
- Standart API cevap formati:
  - Basarili: `{"success": true, "data": ...}`
  - Hatali: `{"success": false, "error": "...", "code": "..."}`
- Public whitelist:
  - `/api/public/checkout-init`
  - `/api/public/paytr-callback`

Detayli test adimlari: `LIVE_TEST_CHECKLIST.md`

## Guvenlik
- Kart bilgisi sadece PayTR iFrame tarafinda islenir.
- Kart verisi sistem veritabanina yazilmaz.
- Siparis tutari backend'de DB fiyatlariyla tekrar hesaplanir.

# Canli Test Checklist (Admin + Sepet + PayTR)

Bu checklist ile sistemi uctan uca test edebilirsiniz.

## 0) On Kosul
- `supabase-setup.sql` calisti
- `admin/supabase-client.js` ve `assets/js/storefront.js` icindeki Supabase URL/anon key dolu
- Vercel env degiskenleri eklendi (`.env.example`)
- PayTR panelinde callback URL: `https://YOUR_DOMAIN/api/public/paytr-callback`

## 0.5) Yerel Hızlı Smoke (Opsiyonel)
Dis servislere gitmeden API akisini hizli dogrulamak icin:

```powershell
node scripts/run-local-checkout-init-smoke.js
node scripts/run-local-paytr-callback-smoke.js
```

## 1) Admin Giris ve Urun Kontrol
1. `/admin/index.html` ac
2. Admin hesabiyla giris yap
3. `/admin/dashboard.html` ekraninda urunlerin listelendigini dogrula
4. Bir urunde `price_visible` ac/kapat -> public sayfada fiyatin gorunup/gizlendigini kontrol et

Beklenen:
- Toggle degisiklikleri anlik kaydolur
- Fiyati gizlenen urunde `Sepete Ekle` butonu da gorunmez

## 2) Sepet Akisi
1. `bath.html` veya `forge.html` ac
2. Fiyati gorunen urunde `Sepete Ekle`
3. Sag alttaki sepetten adet artir/azalt/sil
4. `Odeme` butonuyla `checkout.html` sayfasina git

Beklenen:
- Sepet adedi ve ara toplam dogru hesaplanir
- Checkout ozetinde urunler dogru gorunur

## 3) PayTR iFrame Baslatma (Token)
1. `checkout.html` formunu zorunlu alanlarla doldur
2. `PayTR ile ode` butonuna bas

Beklenen:
- `/api/public/checkout-init` 200 doner
- Siparis kaydi `orders` + `order_items` tablolarina `pending` olarak yazilir
- Sayfada PayTR iFrame acilir

Not: `CHECKOUT_MODE=mock` ise iFrame acilmaz. Siparis pending olarak kaydolur ve ekranda bilgilendirme mesaji gorunur.

## 4) Basarili Odeme Senaryosu
1. PayTR test ortaminda basarili odeme tamamla
2. Kullanici `checkout.html?pay=ok` sayfasina donebilir
3. `/admin/orders.html` ekranini yenile

Beklenen:
- Ilgili siparis `paid` durumuna gecer
- `paytr_status = success`
- `paid_at` dolu olur

## 5) Basarisiz Odeme Senaryosu
1. PayTR test ortaminda basarisiz/iptal odeme dene
2. Kullanici `checkout.html?pay=fail` sayfasina donebilir
3. `/admin/orders.html` ekranini yenile

Beklenen:
- Ilgili siparis `failed` durumuna gecer
- `failed_reason_code` / `failed_reason_msg` dolu olabilir

## 6) Webhook Elle Test (Opsiyonel ama onerilir)
Ayni callback'i tekrar yollayip idempotency davranisini gozleyin.

PowerShell:

```powershell
./scripts/send-paytr-callback.ps1 `
  -CallbackUrl "https://YOUR_DOMAIN/api/public/paytr-callback" `
  -MerchantOid "BLN1234567890ABCD" `
  -Status success `
  -TotalAmount 349900 `
  -MerchantKey "YOUR_PAYTR_MERCHANT_KEY" `
  -MerchantSalt "YOUR_PAYTR_MERCHANT_SALT"
```

Beklenen:
- Endpoint `OK` doner
- Siparis durumu tutarli kalir (tekrar callback sistem bozmaz)

## 7) Guvenlik Kontrolleri
1. DB'de kart numarasi/cvv gibi alan olmadigini dogrula
2. `orders` tablosunda sadece siparis ve durum bilgileri oldugunu dogrula
3. Payment credential'larin sadece Vercel env'de oldugunu dogrula

## 8) Canliya Alma Son Kontrol
- `PAYTR_TEST_MODE=0`
- PayTR panel callback URL production domain
- Gercek bir dusuk tutarli odemeyle smoke test

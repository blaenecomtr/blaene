const LOGO_URL = 'https://www.blaene.com.tr/logo/blaene-logo-white.png';
const ACCENT_COLOR = '#FF6B00';
const YEAR = 2026;

function baseLayout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td bgcolor="#000000" style="background:#000000 !important;padding:24px 40px;text-align:center;">
              <img src="${LOGO_URL}" alt="Blaene" style="height:48px;display:block;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:#000000;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">
                © ${YEAR} Blaene. Tüm hakları saklıdır.<br/>
                <a href="https://www.blaene.com.tr" style="color:${ACCENT_COLOR};text-decoration:none;">www.blaene.com.tr</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function orderConfirmationTemplate({ orderNo, customerName, items = [], total, shippingAddress }) {
  const greeting = customerName ? `Merhaba ${customerName},` : 'Merhaba,';

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#333;">${item.name || 'Ürün'}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:center;color:#555;">${item.quantity || 1}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#333;">${item.price ? `${item.price} ₺` : '-'}</td>
    </tr>
  `).join('');

  const addressBlock = shippingAddress
    ? `<p style="margin:16px 0 0;color:#555;font-size:14px;"><strong>Teslimat Adresi:</strong><br/>${shippingAddress}</p>`
    : '';

  const body = `
    <h2 style="color:#000000;margin:0 0 8px;">Siparişiniz Alındı!</h2>
    <p style="color:#555;margin:0 0 16px;">${greeting}</p>
    <p style="color:#555;margin:0 0 24px;">Siparişiniz başarıyla alındı ve hazırlanmaya başlandı.</p>

    <div style="background:#f8f8f8;border-radius:6px;padding:16px 20px;margin-bottom:24px;border-left:4px solid ${ACCENT_COLOR};">
      <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Sipariş No</p>
      <p style="margin:4px 0 0;color:#000000;font-size:20px;font-weight:bold;">#${orderNo}</p>
    </div>

    ${items.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;color:#888;font-size:12px;text-transform:uppercase;border-bottom:2px solid #eee;">Ürün</th>
          <th style="text-align:center;padding:8px 0;color:#888;font-size:12px;text-transform:uppercase;border-bottom:2px solid #eee;">Adet</th>
          <th style="text-align:right;padding:8px 0;color:#888;font-size:12px;text-transform:uppercase;border-bottom:2px solid #eee;">Fiyat</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    ` : ''}

    ${total ? `
    <div style="text-align:right;margin-bottom:24px;">
      <span style="color:#888;font-size:14px;">Toplam: </span>
      <span style="color:#000000;font-size:18px;font-weight:bold;">${total} ₺</span>
    </div>
    ` : ''}

    ${addressBlock}

    <div style="margin-top:32px;text-align:center;">
      <a href="https://www.blaene.com.tr/account.html"
         style="background:${ACCENT_COLOR};color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
        Siparişimi Takip Et
      </a>
    </div>
  `;

  return baseLayout(`Sipariş Onayı #${orderNo}`, body);
}

function welcomeTemplate({ customerName, email }) {
  const greeting = customerName ? `Merhaba ${customerName},` : 'Merhaba,';

  const body = `
    <h2 style="color:#000000;margin:0 0 8px;">Blaene'ye Hoş Geldiniz!</h2>
    <p style="color:#555;margin:0 0 16px;">${greeting}</p>
    <p style="color:#555;margin:0 0 24px;">Hesabınız başarıyla oluşturuldu. Artık tüm ürünlerimize göz atabilir, kolayca sipariş verebilirsiniz.</p>

    <div style="background:#f8f8f8;border-radius:6px;padding:16px 20px;margin-bottom:24px;border-left:4px solid ${ACCENT_COLOR};">
      <p style="margin:0;color:#888;font-size:12px;">Kayıtlı e-posta adresiniz</p>
      <p style="margin:4px 0 0;color:#000000;font-weight:bold;">${email}</p>
    </div>

    <div style="margin-top:32px;text-align:center;">
      <a href="https://www.blaene.com.tr"
         style="background:${ACCENT_COLOR};color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
        Alışverişe Başla
      </a>
    </div>
  `;

  return baseLayout('Blaene\'ye Hoş Geldiniz', body);
}

function passwordResetTemplate({ resetLink }) {
  const body = `
    <h2 style="color:#000000;margin:0 0 8px;">Şifre Sıfırlama</h2>
    <p style="color:#555;margin:0 0 16px;">Hesabınız için şifre sıfırlama talebi aldık. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.</p>
    <p style="color:#888;font-size:13px;margin:0 0 24px;">Bu talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>

    <div style="margin:32px 0;text-align:center;">
      <a href="${resetLink}"
         style="background:${ACCENT_COLOR};color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
        Şifremi Sıfırla
      </a>
    </div>

    <p style="color:#aaa;font-size:12px;text-align:center;margin:0;">Bu bağlantı 24 saat geçerlidir.</p>
  `;

  return baseLayout('Şifre Sıfırlama', body);
}

function cartAbandonedTemplate({ customerName, items = [], cartUrl, discountCode, discountText }) {
  const greeting = customerName ? `Merhaba ${customerName},` : 'Merhaba,';

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#333;">${item.name || 'Ürün'}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#555;">${item.quantity || 1} adet</td>
    </tr>
  `).join('');

  const body = `
    <h2 style="color:#000000;margin:0 0 8px;">Sepetinizde Ürünler Bekliyor!</h2>
    <p style="color:#555;margin:0 0 16px;">${greeting}</p>
    <p style="color:#555;margin:0 0 24px;">Sepetinizde bıraktığınız ürünler sizi bekliyor. Hemen tamamlayın, kaçırmayın!</p>

    ${items.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tbody>${itemRows}</tbody>
    </table>
    ` : ''}

    ${discountCode ? `
    <div style="background:#fff8eb;border:1px solid #f3d7b8;border-radius:8px;padding:14px 16px;margin:0 0 20px;">
      <p style="margin:0 0 8px;color:#8a4c10;font-size:13px;font-weight:700;">Size ozel indirim kodu</p>
      <p style="margin:0;color:#111;font-size:20px;font-weight:800;letter-spacing:1px;">${discountCode}</p>
      ${discountText ? `<p style="margin:8px 0 0;color:#8a4c10;font-size:13px;">${discountText}</p>` : ''}
    </div>
    ` : ''}

    <div style="margin-top:32px;text-align:center;">
      <a href="${cartUrl || 'https://www.blaene.com.tr/checkout.html'}"
         style="background:${ACCENT_COLOR};color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
        Sepetime Dön
      </a>
    </div>
  `;

  return baseLayout('Sepetinizde Ürünler Bekliyor', body);
}

function productShowcaseTemplate({ customerName, products = [], catalogUrl }) {
  const greeting = customerName ? `Merhaba ${customerName},` : 'Merhaba,';
  const rows = products
    .slice(0, 6)
    .map((item) => {
      const name = String(item && item.name || 'Urun');
      const price = item && item.price ? `${item.price} TL` : '';
      const image = String(item && item.image || '').trim();
      const productUrl = String(item && item.url || catalogUrl || 'https://www.blaene.com.tr').trim();

      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;vertical-align:middle;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:76px;vertical-align:middle;">
                ${image
                  ? `<img src="${image}" alt="${name}" width="64" height="64" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #eee;" />`
                  : `<div style="width:64px;height:64px;background:#f3f4f6;border-radius:6px;border:1px solid #eee;"></div>`}
              </td>
              <td style="vertical-align:middle;padding-left:10px;">
                <p style="margin:0;color:#111;font-size:14px;font-weight:700;">${name}</p>
                ${price ? `<p style="margin:6px 0 0;color:#555;font-size:13px;">${price}</p>` : ''}
                <p style="margin:8px 0 0;"><a href="${productUrl}" style="color:${ACCENT_COLOR};font-size:13px;text-decoration:none;font-weight:700;">Urunu Incele</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  const body = `
    <h2 style="color:#000000;margin:0 0 8px;">Sizin Icin Onerilen Urunler</h2>
    <p style="color:#555;margin:0 0 16px;">${greeting}</p>
    <p style="color:#555;margin:0 0 22px;">Yeni ve populer urunlerimizi sizin icin derledik.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tbody>${rows || '<tr><td style="color:#666;font-size:13px;">Su an listelenecek urun bulunamadi.</td></tr>'}</tbody>
    </table>

    <div style="text-align:center;">
      <a href="${catalogUrl || 'https://www.blaene.com.tr'}"
         style="background:${ACCENT_COLOR};color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
        Tum Urunleri Gor
      </a>
    </div>
  `;

  return baseLayout('Yeni Urun Onerileri', body);
}

function orderShippedTemplate({ orderNo, customerName, trackingCode, shippingProvider }) {
  const greeting = customerName ? `Merhaba ${customerName},` : 'Merhaba,';

  const body = `
    <h2 style="color:#000000;margin:0 0 8px;">Siparişiniz Kargoya Verildi!</h2>
    <p style="color:#555;margin:0 0 16px;">${greeting}</p>
    <p style="color:#555;margin:0 0 24px;">Siparişiniz kargoya teslim edildi, yolda!</p>

    <div style="background:#f8f8f8;border-radius:6px;padding:16px 20px;margin-bottom:24px;border-left:4px solid ${ACCENT_COLOR};">
      <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Sipariş No</p>
      <p style="margin:4px 0 0;color:#000000;font-size:18px;font-weight:bold;">#${orderNo}</p>
      ${shippingProvider ? `<p style="margin:8px 0 0;color:#555;font-size:13px;">Kargo Firması: <strong>${shippingProvider}</strong></p>` : ''}
      ${trackingCode ? `<p style="margin:4px 0 0;color:#555;font-size:13px;">Takip Kodu: <strong>${trackingCode}</strong></p>` : ''}
    </div>

    <div style="margin-top:32px;text-align:center;">
      <a href="https://www.blaene.com.tr/account.html"
         style="background:${ACCENT_COLOR};color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
        Siparişimi Takip Et
      </a>
    </div>
  `;

  return baseLayout(`Sipariş Kargoya Verildi #${orderNo}`, body);
}

module.exports = {
  orderConfirmationTemplate,
  welcomeTemplate,
  passwordResetTemplate,
  cartAbandonedTemplate,
  orderShippedTemplate,
  productShowcaseTemplate,
};

import { writeFileSync } from "node:fs";

const BASE = "https://www.blaene.com.tr";

const PRODUCTS = [
  { code: 'BTH-001', name: 'Çift Katlı Köşe Duş Rafı', images: ['KUNYE/BTH-001/BTH-001-B/blaene-bth-001-b-1.webp','KUNYE/BTH-001/BTH-001-B/blaene-bth-001-b-2.webp','KUNYE/BTH-001/BTH-001-B/blaene-bth-001-b-3.webp','KUNYE/BTH-001/BTH-001-S/blaene-bth-001-s-1.webp','KUNYE/BTH-001/BTH-001-MD/blaene-bth-001-md-1.webp','KUNYE/BTH-001/BTH-001-ST/blaene-bth-001-st-1.webp'] },
  { code: 'BTH-002', name: 'Slim Köşe Duş Rafı', images: ['KUNYE/BTH-002/BTH-002-B/blaene-bth-002-b-1.webp','KUNYE/BTH-002/BTH-002-S/blaene-bth-002-s-1.webp','KUNYE/BTH-002/BTH-002-MD/blaene-bth-002-md-1.webp','KUNYE/BTH-002/BTH-002-ST/blaene-bth-002-st-1.webp'] },
  { code: 'BTH-003', name: 'Modern Havluluk', images: ['KUNYE/BTH-003/BTH-003-B/blaene-bth-003-b-1.webp','KUNYE/BTH-003/BTH-003-S/blaene-bth-003-s-1.webp'] },
  { code: 'BTH-004', name: 'Çift Katlı Duş Organizeri', images: ['KUNYE/BTH-004/BTH-004-B/blaene-bth-004-b-1.webp','KUNYE/BTH-004/BTH-004-S/blaene-bth-004-s-1.webp'] },
  { code: 'BTH-005', name: 'Raflı Havluluk', images: ['KUNYE/BTH-005/BTH-005-B/blaene-bth-005-b-1.webp','KUNYE/BTH-005/BTH-005-S/blaene-bth-005-s-1.webp'] },
  { code: 'BTH-006', name: 'Premium WC İstasyonu', images: ['KUNYE/BTH-006/BTH-006-B/blaene-bth-006-b-1.webp','KUNYE/BTH-006/BTH-006-S/blaene-bth-006-s-1.webp'] },
  { code: 'BTH-007', name: 'Kapalı Kasa WC Kağıtlığı', images: ['KUNYE/BTH-007/BTH-007-B/blaene-bth-007-b-1.webp','KUNYE/BTH-007/BTH-007-S/blaene-bth-007-s-1.webp'] },
  { code: 'BTH-008', name: 'Raflı Havluluk Organizer', images: ['KUNYE/BTH-008/BTH-008-B/blaene-bth-008-B-1.webp','KUNYE/BTH-008/BTH-008-S/blaene-bth-008-S-1.webp'] },
  { code: 'BTH-009', name: 'Çok Amaçlı Banyo Rafı', images: ['KUNYE/BTH-009/BTH-009-B/blaene-bth-009-b-1.webp','KUNYE/BTH-009/BTH-009-S/blaene-bth-009-s-1.webp'] },
  { code: 'BTH-010', name: 'Fön ve Bakım İstasyonu', images: ['KUNYE/BTH-010/BTH-010-B/blaene-bth-010-b-1.webp','KUNYE/BTH-010/BTH-010-S/blaene-bth-010-s-1.webp'] },
  { code: 'BTH-011', name: 'Telefon Raflı WC Kağıtlığı', images: ['KUNYE/BTH-011/BTH-011-B/blaene-bth-011-b-1.webp','KUNYE/BTH-011/BTH-011-S/blaene-bth-011-s-1.webp'] },
  { code: 'BTH-012', name: 'Kompakt Banyo Rafı', images: ['KUNYE/BTH-012/BTH-012-B/blaene-bth-012-b-1.webp','KUNYE/BTH-012/BTH-012-S/blaene-bth-012-s-1.webp'] },
  { code: 'BTH-013', name: 'Slim WC Kağıtlığı', images: ['KUNYE/BTH-013/BTH-013-B/blaene-bth-013-b-1.webp','KUNYE/BTH-013/BTH-013-S/blaene-bth-013-s-1.webp'] },
  { code: 'BTH-014', name: 'Raflı WC Kağıtlığı', images: ['KUNYE/BTH-014/BTH-014-B/blaene-bth-014-b-1.webp','KUNYE/BTH-014/BTH-014-S/blaene-bth-014-s-1.webp','KUNYE/BTH-014/BTH-014-MD/blaene-bth-014-md-1.webp','KUNYE/BTH-014/BTH-014-ST/blaene-bth-014-st-1.webp'] },
  { code: 'BTH-014-A', name: 'Premium Raflı WC Kağıtlığı', images: ['KUNYE/BTH-014A/BTH-014A-B/blaene-bth-014a-b-1.webp','KUNYE/BTH-014A/BTH-014A-S/blaene-bth-014a-s-1.webp','KUNYE/BTH-014A/BTH-014A-MD/blaene-bth-014a-md-1.webp','KUNYE/BTH-014A/BTH-014A-ST/blaene-bth-014a-st-1.webp'] },
  { code: 'BTH-015', name: 'Modern Havluluk', images: ['KUNYE/BTH-015/BTH-015-B/blaene-bth-015-b-1.webp','KUNYE/BTH-015/BTH-015-S/blaene-bth-015-s-1.webp'] },
  { code: 'BTH-016', name: 'Minimal WC Kağıtlığı', images: ['KUNYE/BTH-016/BTH-016-B/blaene-bth-016-b-1.webp','KUNYE/BTH-016/BTH-016-S/blaene-bth-016-s-1.webp'] },
  { code: 'BTH-017', name: 'Fön Makinesi Askılığı', images: ['KUNYE/BTH-017/BTH-017-B/blaene-bth-017-b-1.webp','KUNYE/BTH-017/BTH-017-S/blaene-bth-017-s-1.webp'] },
  { code: 'BTH-018', name: 'Şampuanlık ve Banyo Organizeri', images: ['KUNYE/BTH-018/BTH-018-B/blaene-bth-018-b-1.webp','KUNYE/BTH-018/BTH-018-S/blaene-bth-018-s-1.webp'] },
  { code: 'BTH-019', name: 'Geniş Banyo Rafı', images: ['KUNYE/BTH-019/BTH-019-B/blaene-bth-019-b-1.webp','KUNYE/BTH-019/BTH-019-S/blaene-bth-019-s-1.webp'] },
  { code: 'FRG-001', name: 'Kampcı Portatif Mangal', images: ['görsel/forge/frg-001/IMG_0237.webp','görsel/forge/frg-001/IMG_0068.webp'] },
  { code: 'FRG-002', name: 'Kampcı Portatif Mangal', images: ['görsel/forge/frg-002/IMG_0160.webp','görsel/forge/frg-002/IMG_0161.webp'] },
  { code: 'FRG-003', name: 'Kampcı Portatif Mangal', images: ['görsel/forge/frg-003/IMG_0182.webp','görsel/forge/frg-003/IMG_0183.webp'] },
  { code: 'MDL-002', name: 'Çelik Raf Sistemi', images: ['görsel/industrial/mdl-002/IMG_0278.webp','görsel/industrial/mdl-002/IMG_0279.webp'] },
  { code: 'MDL-003', name: 'Kademeli Servis Arabası', images: ['görsel/industrial/mdl-003/mdl-003 (1)SİYAH.webp'] },
  { code: 'MDL-004', name: 'Servis Takım Arabası', images: ['görsel/industrial/mdl-004/mdl-004 (1) SİYAH.webp'] },
];

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function encUrl(path) {
  return encodeURI(path).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${BASE}/${encUrl('görsel/marka/bath.webp')}</image:loc>
      <image:title>Blaene Banyo Koleksiyonu</image:title>
    </image:image>
    <image:image>
      <image:loc>${BASE}/${encUrl('görsel/forge/forge banner.webp')}</image:loc>
      <image:title>Blaene Forge Koleksiyonu</image:title>
    </image:image>
  </url>
  <url>
    <loc>${BASE}/bath.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <image:image>
      <image:loc>${BASE}/${encUrl('görsel/marka/bath.webp')}</image:loc>
      <image:title>Blaene Banyo Aksesuarları — 304 Paslanmaz Çelik</image:title>
      <image:caption>Blaene BANYO Koleksiyonu: Duş rafı, havluluk, WC kağıtlığı, banyo organizeri</image:caption>
    </image:image>
  </url>
  <url>
    <loc>${BASE}/forge.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${BASE}/industrial.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
`;

for (const p of PRODUCTS) {
  const pageUrl = `${BASE}/product.html?code=${encodeURIComponent(p.code)}`;
  xml += `  <url>\n    <loc>${escXml(pageUrl)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n`;
  for (const img of p.images) {
    const imgUrl = `${BASE}/${encUrl(img)}`;
    xml += `    <image:image>\n      <image:loc>${escXml(imgUrl)}</image:loc>\n      <image:title>${escXml(`Blaene ${p.code} ${p.name} - 304 Paslanmaz Çelik`)}</image:title>\n      <image:caption>${escXml(`Blaene ${p.code} ${p.name}`)}</image:caption>\n    </image:image>\n`;
  }
  xml += `  </url>\n`;
}

xml += `</urlset>\n`;

writeFileSync("sitemap.xml", xml, "utf-8");
console.log(`sitemap.xml oluşturuldu — ${PRODUCTS.length} ürün, ${PRODUCTS.reduce((s, p) => s + p.images.length, 0)} görsel`);

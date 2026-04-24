import { type CSSProperties, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { getSiteSetting, saveSiteSetting } from '../lib/siteSettings'

interface ShippingTier {
  min: number
  fee: number
  label: string
}

interface ShippingProviderOption {
  provider: string
  label: string
  enabled: boolean
}

interface ShippingSettings {
  free_shipping_threshold: number
  base_shipping_fee: number
  tiers: ShippingTier[]
  providers: ShippingProviderOption[]
}

interface ContactSettings {
  company_name: string
  email: string
  phone: string
  whatsapp: string
  address: string
}

export interface SlipSettings {
  show_logo: boolean
  show_site_url: boolean
  site_url: string
  logo_height: number
  show_qr: boolean
  qr_size: number
  show_order_no: boolean
  show_customer_name: boolean
  show_email: boolean
  show_phone: boolean
  show_address: boolean
  show_city: boolean
  show_shipping_provider: boolean
  show_tracking_code: boolean
  show_total: boolean
  show_date: boolean
  show_items_table: boolean
  border_enabled: boolean
  border_width: number
  border_color: string
  border_style: string
  border_radius: number
  border_padding: number
  paper_width_cm: number
  paper_height_cm: number
  paper_fit: 'exact' | 'fit' | 'fill'
}

interface ManualSlipItem {
  name: string
  qty: string
  price: string
}

interface ManualSlip {
  customer_name: string
  address: string
  city: string
  phone: string
  items: ManualSlipItem[]
  note: string
}

interface BankTransferAccount {
  bank_name: string
  account_name: string
  iban: string
  branch: string
  account_no: string
  currency: string
  enabled: boolean
}

interface PaymentSettings {
  paytr_enabled: boolean
  iyzico_enabled: boolean
  provider_preference: 'iyzico' | 'paytr'
  paytr_merchant_id: string
  iyzico_api_key: string
  iyzico_secret_key: string
  iyzico_base_url: string
  bank_transfer_company_name: string
  bank_transfer_accounts: BankTransferAccount[]
}

const DEFAULT_SHIPPING: ShippingSettings = {
  free_shipping_threshold: 2000,
  base_shipping_fee: 120,
  tiers: [],
  providers: [
    { provider: 'yurtici', label: 'Yurtici Kargo', enabled: true },
    { provider: 'mng', label: 'MNG Kargo', enabled: true },
    { provider: 'aras', label: 'Aras Kargo', enabled: true },
  ],
}

const DEFAULT_CONTACT: ContactSettings = {
  company_name: 'Blaene',
  email: 'info@blaene.com',
  phone: '',
  whatsapp: '',
  address: '',
}

export const DEFAULT_SLIP: SlipSettings = {
  show_logo: true,
  show_site_url: true,
  site_url: 'www.blaene.com.tr',
  logo_height: 80,
  show_qr: true,
  qr_size: 150,
  show_order_no: true,
  show_customer_name: true,
  show_email: true,
  show_phone: true,
  show_address: true,
  show_city: true,
  show_shipping_provider: true,
  show_tracking_code: true,
  show_total: true,
  show_date: true,
  show_items_table: true,
  border_enabled: true,
  border_width: 2,
  border_color: '#111111',
  border_style: 'solid',
  border_radius: 0,
  border_padding: 16,
  paper_width_cm: 14.8,
  paper_height_cm: 10.5,
  paper_fit: 'exact',
}

const DEFAULT_MANUAL_SLIP: ManualSlip = {
  customer_name: '',
  address: '',
  city: '',
  phone: '',
  items: [{ name: '', qty: '1', price: '' }],
  note: '',
}

const DEFAULT_PAYMENT: PaymentSettings = {
  paytr_enabled: false,
  iyzico_enabled: false,
  provider_preference: 'iyzico',
  paytr_merchant_id: '',
  iyzico_api_key: '',
  iyzico_secret_key: '',
  iyzico_base_url: 'https://sandbox-api.iyzipay.com',
  bank_transfer_company_name: 'Blaene',
  bank_transfer_accounts: [
    {
      bank_name: 'Ziraat Bankasi',
      account_name: 'Blaene Metal Urunleri',
      iban: 'TR00 0000 0000 0000 0000 0000 00',
      branch: '',
      account_no: '',
      currency: 'TRY',
      enabled: true,
    },
  ],
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(String(value || '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

export default function SiteSettings() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [shipping, setShipping] = useState<ShippingSettings>(DEFAULT_SHIPPING)
  const [contact, setContact] = useState<ContactSettings>(DEFAULT_CONTACT)
  const [payment, setPayment] = useState<PaymentSettings>(DEFAULT_PAYMENT)
  const [slip, setSlip] = useState<SlipSettings>(DEFAULT_SLIP)
  const [manualSlip, setManualSlip] = useState<ManualSlip>(DEFAULT_MANUAL_SLIP)
  const [slipPreviewHtml, setSlipPreviewHtml] = useState('')
  const previewRef = useRef<HTMLIFrameElement>(null)

  const loadSettings = async () => {
    setLoading(true)
    setError('')
    try {
      const [shippingSetting, contactSetting, paymentSetting, slipSetting] = await Promise.all([
        getSiteSetting<ShippingSettings>(token, 'shipping_settings', DEFAULT_SHIPPING),
        getSiteSetting<ContactSettings>(token, 'contact_settings', DEFAULT_CONTACT),
        getSiteSetting<PaymentSettings>(token, 'payment_settings', DEFAULT_PAYMENT),
        getSiteSetting<SlipSettings>(token, 'slip_settings', DEFAULT_SLIP),
      ])
      setShipping({ ...DEFAULT_SHIPPING, ...(shippingSetting || {}) })
      setContact({ ...DEFAULT_CONTACT, ...(contactSetting || {}) })
      setPayment({
        ...DEFAULT_PAYMENT,
        ...(paymentSetting || {}),
        bank_transfer_accounts: Array.isArray(paymentSetting?.bank_transfer_accounts)
          ? paymentSetting.bank_transfer_accounts
          : DEFAULT_PAYMENT.bank_transfer_accounts,
      })
      setSlip({ ...DEFAULT_SLIP, ...(slipSetting || {}) })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ayarlar yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  const addShippingTier = () => {
    setShipping((prev) => ({
      ...prev,
      tiers: [...(Array.isArray(prev.tiers) ? prev.tiers : []), { min: 0, fee: 0, label: '' }],
    }))
  }

  const addShippingProvider = () => {
    setShipping((prev) => ({
      ...prev,
      providers: [
        ...(Array.isArray(prev.providers) ? prev.providers : []),
        { provider: '', label: '', enabled: true },
      ],
    }))
  }

  const addBankTransferAccount = () => {
    setPayment((prev) => ({
      ...prev,
      bank_transfer_accounts: [
        ...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : []),
        {
          bank_name: '',
          account_name: '',
          iban: '',
          branch: '',
          account_no: '',
          currency: 'TRY',
          enabled: true,
        },
      ],
    }))
  }

  const saveAll = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await Promise.all([
        saveSiteSetting(token, 'shipping_settings', shipping, 'Kargo baremleri ve ucretsiz kargo ayarlari'),
        saveSiteSetting(token, 'contact_settings', contact, 'Iletisim bilgileri ve firma metadatasi'),
        saveSiteSetting(token, 'payment_settings', payment, 'Odeme saglayici, API ve havale hesap ayarlari'),
        saveSiteSetting(token, 'slip_settings', slip, 'Kargo fisi tasarim ve alan ayarlari'),
      ])
      setMessage('Site ayarlari kaydedildi')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ayarlar kaydedilemedi'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const buildManualSlipHtml = async (s: SlipSettings, m: ManualSlip): Promise<string> => {
    let logoDataUrl = ''
    if (s.show_logo) {
      try {
        const res = await fetch(`${window.location.origin}/logo/blaene-logo.png`)
        if (res.ok) {
          const blob = await res.blob()
          logoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => resolve('')
            reader.readAsDataURL(blob)
          })
        }
      } catch { /* no logo */ }
    }

    let qrHtml = ''
    if (s.show_qr) {
      const validItems = m.items.filter((it) => it.name.trim())
      const itemNote = validItems.map((it) => `${it.name} x${it.qty || 1}`).join(', ')
      const noteParts = [itemNote, m.note].filter(Boolean).join(' | ')
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        m.customer_name ? `FN:${m.customer_name}` : 'FN:',
        m.phone ? `TEL;TYPE=CELL:${m.phone}` : '',
        (m.address || m.city) ? `ADR;TYPE=HOME:;;${m.address || ''};;${m.city || ''};;TR` : '',
        noteParts ? `NOTE:${noteParts}` : '',
        'END:VCARD',
      ].filter(Boolean).join('\r\n')
      try {
        const qd = QRCode.create(vcard, { errorCorrectionLevel: 'M' })
        const sizePx = s.qr_size
        const mc = qd.modules.size
        const ms = sizePx / mc
        const r = ms * 0.48
        const fg = '#111111'
        const bg = '#ffffff'
        const fSize = 7 * ms
        const ip = ms
        const iw = 5 * ms
        const ib = 3 * ms
        const finders: [number, number][] = [[0, 0], [0, mc - 7], [mc - 7, 0]]
        const isInFinder = (row: number, col: number) =>
          (row < 7 && col < 7) || (row < 7 && col >= mc - 7) || (row >= mc - 7 && col < 7)
        const finderSvg = finders.map(([fr, fc]) => {
          const x = fc * ms; const y = fr * ms
          return `<rect x="${x}" y="${y}" width="${fSize}" height="${fSize}" fill="${fg}" rx="10" ry="10"/>` +
            `<rect x="${x+ip}" y="${y+ip}" width="${iw}" height="${iw}" fill="${bg}" rx="7" ry="7"/>` +
            `<rect x="${x+ip*2}" y="${y+ip*2}" width="${ib}" height="${ib}" fill="${fg}" rx="3" ry="3"/>`
        }).join('')
        let dots = ''
        for (let row = 0; row < mc; row++)
          for (let col = 0; col < mc; col++)
            if (qd.modules.get(row, col) && !isInFinder(row, col))
              dots += `<circle cx="${(col+0.5)*ms}" cy="${(row+0.5)*ms}" r="${r}" fill="${fg}"/>`
        qrHtml = `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0;">` +
          `<rect width="${sizePx}" height="${sizePx}" fill="${bg}" rx="10" ry="10"/>` +
          finderSvg + dots + `</svg>`
      } catch { qrHtml = '' }
    }

    const logoBlock = logoDataUrl
      ? `<img src="${logoDataUrl}" alt="Blaene" style="height:${s.logo_height}px;width:auto;display:block;" />`
      : `<span style="font-size:24px;font-weight:700;font-family:Arial,sans-serif;display:block;">BLAENE</span>`

    const siteUrlHtml = s.show_site_url
      ? `<span style="font-size:11px;font-family:Arial,sans-serif;color:#444;display:block;width:100%;text-align:center;">${s.site_url || 'www.blaene.com.tr'}</span>`
      : ''

    const itemRows = m.items
      .filter((it) => it.name.trim())
      .map((it) => {
        const total = (parseFloat(it.price) || 0) * (parseInt(it.qty) || 1)
        return `<tr><td>${it.name}</td><td>${it.qty || 1}</td><td>${it.price ? Number(it.price).toLocaleString('tr-TR') + ' TL' : '-'}</td><td>${total ? total.toLocaleString('tr-TR') + ' TL' : '-'}</td></tr>`
      })
      .join('')

    const borderCss = s.border_enabled
      ? `border:${s.border_width}px ${s.border_style} ${s.border_color};border-radius:${s.border_radius}px;padding:${s.border_padding}px;`
      : 'padding:20px;'

    return `<html><head><meta charset="UTF-8"/><title>Manuel Kargo Fisi</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{font-family:Arial,sans-serif;color:#111;font-size:10px;}
      .slip-wrap{${borderCss}}
      .header{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;border-bottom:2px solid #111;padding-bottom:4px;}
      .logo-block{display:flex;flex-direction:column;align-items:flex-start;gap:2px;}
      .meta p{margin:1px 0;font-size:10px;line-height:1.3;}
      table{width:100%;border-collapse:collapse;margin-top:6px;}
      th,td{border:1px solid #ccc;padding:2px 4px;text-align:left;font-size:9px;line-height:1.2;}
      th{background:#f3f4f6;font-weight:700;}
      @media print{@page{size:${s.paper_width_cm}cm ${s.paper_height_cm}cm;margin:3mm;} html,body{width:${s.paper_width_cm}cm;height:${s.paper_height_cm}cm;overflow:hidden;} .slip-wrap{overflow:hidden;}}
    </style></head><body>
    <div class="slip-wrap">
    <div class="header">
      <div class="logo-block">${s.show_logo ? logoBlock : ''} ${siteUrlHtml}</div>
      ${qrHtml}
    </div>
    <div class="meta">
      ${m.customer_name ? `<p><strong>Musteri:</strong> ${m.customer_name}</p>` : ''}
      ${m.phone ? `<p><strong>Telefon:</strong> ${m.phone}</p>` : ''}
      ${m.address ? `<p><strong>Adres:</strong> ${m.address}</p>` : ''}
      ${m.city ? `<p><strong>Sehir:</strong> ${m.city}</p>` : ''}
      ${m.note ? `<p><strong>Not:</strong> ${m.note}</p>` : ''}
      <p><strong>Tarih:</strong> ${new Date().toLocaleDateString('tr-TR')}</p>
    </div>
    ${s.show_items_table && itemRows ? `<table><thead><tr><th>Urun</th><th>Adet</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead><tbody>${itemRows}</tbody></table>` : ''}
    </div>
    </body></html>`
  }

  const printManualSlip = async () => {
    const html = await buildManualSlipHtml(slip, manualSlip)
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { setError('Pop-up engellendi, lutfen izin verin.'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  const updatePreview = async () => {
    const html = await buildManualSlipHtml(slip, manualSlip)
    setSlipPreviewHtml(html)
  }

  if (loading) {
    return <p style={{ color: '#94a3b8' }}>Site ayarlari yukleniyor...</p>
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Site Ayarlari</h2>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Kargo baremleri</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Ücretsiz kargo alt limiti (TL)</div>
            <input
              value={String(shipping.free_shipping_threshold ?? 0)}
              onChange={(evt) => setShipping((prev) => ({ ...prev, free_shipping_threshold: parseNumber(evt.target.value, 0) }))}
              placeholder="orn: 3000"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Temel kargo ücreti (TL)</div>
            <input
              value={String(shipping.base_shipping_fee ?? 0)}
              onChange={(evt) => setShipping((prev) => ({ ...prev, base_shipping_fee: parseNumber(evt.target.value, 0) }))}
              placeholder="orn: 120"
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ marginBottom: '8px', color: '#cbd5e1', fontSize: '12px' }}>Ek kargo baremleri</div>
        {(Array.isArray(shipping.tiers) ? shipping.tiers : []).map((tier, idx) => (
          <div key={`tier-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr auto', gap: '8px', marginBottom: '8px' }}>
            <input
              value={String(tier.min ?? 0)}
              onChange={(evt) =>
                setShipping((prev) => {
                  const next = [...(Array.isArray(prev.tiers) ? prev.tiers : [])]
                  next[idx] = { ...next[idx], min: parseNumber(evt.target.value, 0) }
                  return { ...prev, tiers: next }
                })
              }
              placeholder="Min tutar"
              style={inputStyle}
            />
            <input
              value={String(tier.fee ?? 0)}
              onChange={(evt) =>
                setShipping((prev) => {
                  const next = [...(Array.isArray(prev.tiers) ? prev.tiers : [])]
                  next[idx] = { ...next[idx], fee: parseNumber(evt.target.value, 0) }
                  return { ...prev, tiers: next }
                })
              }
              placeholder="Kargo ucreti"
              style={inputStyle}
            />
            <input
              value={tier.label || ''}
              onChange={(evt) =>
                setShipping((prev) => {
                  const next = [...(Array.isArray(prev.tiers) ? prev.tiers : [])]
                  next[idx] = { ...next[idx], label: evt.target.value }
                  return { ...prev, tiers: next }
                })
              }
              placeholder="Etiket (or: Anadolu Ekspres)"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() =>
                setShipping((prev) => ({
                  ...prev,
                  tiers: (Array.isArray(prev.tiers) ? prev.tiers : []).filter((_, itemIdx) => itemIdx !== idx),
                }))
              }
              style={dangerMiniStyle}
            >
              Sil
            </button>
          </div>
        ))}
        <button type="button" onClick={addShippingTier} style={secondaryButton}>
          + Barem ekle
        </button>

        <div style={{ marginTop: '14px', marginBottom: '8px', color: '#cbd5e1', fontSize: '12px' }}>
          Musteriye gosterilecek kargo firmalari
        </div>
        {(Array.isArray(shipping.providers) ? shipping.providers : []).map((provider, idx) => (
          <div
            key={`provider-${idx}`}
            style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr auto auto', gap: '8px', marginBottom: '8px' }}
          >
            <input
              value={provider.provider || ''}
              onChange={(evt) =>
                setShipping((prev) => {
                  const next = [...(Array.isArray(prev.providers) ? prev.providers : [])]
                  next[idx] = {
                    ...next[idx],
                    provider: evt.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                  }
                  return { ...prev, providers: next }
                })
              }
              placeholder="Kod (or: yurtici)"
              style={inputStyle}
            />
            <input
              value={provider.label || ''}
              onChange={(evt) =>
                setShipping((prev) => {
                  const next = [...(Array.isArray(prev.providers) ? prev.providers : [])]
                  next[idx] = { ...next[idx], label: evt.target.value }
                  return { ...prev, providers: next }
                })
              }
              placeholder="Gorunen ad (or: Yurtici Kargo)"
              style={inputStyle}
            />
            <label style={checkLabelStyle}>
              <input
                type="checkbox"
                checked={provider.enabled !== false}
                onChange={(evt) =>
                  setShipping((prev) => {
                    const next = [...(Array.isArray(prev.providers) ? prev.providers : [])]
                    next[idx] = { ...next[idx], enabled: evt.target.checked }
                    return { ...prev, providers: next }
                  })
                }
              />
              Aktif
            </label>
            <button
              type="button"
              onClick={() =>
                setShipping((prev) => ({
                  ...prev,
                  providers: (Array.isArray(prev.providers) ? prev.providers : []).filter((_, itemIdx) => itemIdx !== idx),
                }))
              }
              style={dangerMiniStyle}
            >
              Sil
            </button>
          </div>
        ))}
        <button type="button" onClick={addShippingProvider} style={secondaryButton}>
          + Kargo firmasi ekle
        </button>
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Iletisim bilgileri</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <input
            value={contact.company_name}
            onChange={(evt) => setContact((prev) => ({ ...prev, company_name: evt.target.value }))}
            placeholder="Firma adi"
            style={inputStyle}
          />
          <input
            value={contact.email}
            onChange={(evt) => setContact((prev) => ({ ...prev, email: evt.target.value }))}
            placeholder="E-posta"
            style={inputStyle}
          />
          <input
            value={contact.phone}
            onChange={(evt) => setContact((prev) => ({ ...prev, phone: evt.target.value }))}
            placeholder="Telefon"
            style={inputStyle}
          />
          <input
            value={contact.whatsapp}
            onChange={(evt) => setContact((prev) => ({ ...prev, whatsapp: evt.target.value }))}
            placeholder="WhatsApp"
            style={inputStyle}
          />
        </div>
        <textarea
          value={contact.address}
          onChange={(evt) => setContact((prev) => ({ ...prev, address: evt.target.value }))}
          placeholder="Adres"
          style={{ ...inputStyle, width: '100%', minHeight: '72px', resize: 'vertical', marginTop: '10px' }}
        />
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>API / Odeme ayarlari (Iyzico / PayTR / Havale)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={payment.paytr_enabled}
              onChange={(evt) => setPayment((prev) => ({ ...prev, paytr_enabled: evt.target.checked }))}
            />
            PayTR aktif
          </label>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={payment.iyzico_enabled}
              onChange={(evt) => setPayment((prev) => ({ ...prev, iyzico_enabled: evt.target.checked }))}
            />
            Iyzico aktif
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
          <select
            value={payment.provider_preference}
            onChange={(evt) =>
              setPayment((prev) => ({
                ...prev,
                provider_preference: (evt.target.value as 'iyzico' | 'paytr') || 'iyzico',
              }))
            }
            style={inputStyle}
          >
            <option value="iyzico">Oncelik: Iyzico</option>
            <option value="paytr">Oncelik: PayTR</option>
          </select>
          <input
            value={payment.paytr_merchant_id}
            onChange={(evt) => setPayment((prev) => ({ ...prev, paytr_merchant_id: evt.target.value }))}
            placeholder="PayTR Merchant ID"
            style={inputStyle}
          />
          <input
            value={payment.iyzico_api_key}
            onChange={(evt) => setPayment((prev) => ({ ...prev, iyzico_api_key: evt.target.value }))}
            placeholder="Iyzico API Key (anlaşma sonrası girilecek)"
            style={inputStyle}
          />
          <input
            value={payment.iyzico_secret_key}
            onChange={(evt) => setPayment((prev) => ({ ...prev, iyzico_secret_key: evt.target.value }))}
            placeholder="Iyzico Secret Key (anlaşma sonrası girilecek)"
            style={inputStyle}
          />
          <input
            value={payment.iyzico_base_url}
            onChange={(evt) => setPayment((prev) => ({ ...prev, iyzico_base_url: evt.target.value }))}
            placeholder="Iyzico Base URL"
            style={inputStyle}
          />
        </div>
        {!payment.iyzico_api_key && !payment.iyzico_secret_key && (
          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: '6px', color: '#93c5fd', fontSize: '12px' }}>
            Iyzico ile henüz anlaşma yapılmadı. Anlaşma tamamlandığında API Key ve Secret Key buraya girilecek, ardından &quot;Iyzico aktif&quot; işaretlenecek.
          </div>
        )}

        <div style={{ marginTop: '14px', marginBottom: '8px', color: '#cbd5e1', fontSize: '12px' }}>
          Havale / EFT firma ve banka hesaplari
        </div>
        <input
          value={payment.bank_transfer_company_name}
          onChange={(evt) => setPayment((prev) => ({ ...prev, bank_transfer_company_name: evt.target.value }))}
          placeholder="Firma gorunen adi (or: Blaene Metal Urunleri)"
          style={{ ...inputStyle, width: '100%', marginBottom: '8px' }}
        />
        {(Array.isArray(payment.bank_transfer_accounts) ? payment.bank_transfer_accounts : []).map((account, idx) => (
          <div
            key={`bank-account-${idx}`}
            style={{
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px',
              marginBottom: '8px',
              background: '#0b1222',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '8px', marginBottom: '8px' }}>
              <input
                value={account.bank_name || ''}
                onChange={(evt) =>
                  setPayment((prev) => {
                    const next = [...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : [])]
                    next[idx] = { ...next[idx], bank_name: evt.target.value }
                    return { ...prev, bank_transfer_accounts: next }
                  })
                }
                placeholder="Banka adi"
                style={inputStyle}
              />
              <input
                value={account.account_name || ''}
                onChange={(evt) =>
                  setPayment((prev) => {
                    const next = [...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : [])]
                    next[idx] = { ...next[idx], account_name: evt.target.value }
                    return { ...prev, bank_transfer_accounts: next }
                  })
                }
                placeholder="Alici / Hesap sahibi"
                style={inputStyle}
              />
              <input
                value={account.iban || ''}
                onChange={(evt) =>
                  setPayment((prev) => {
                    const next = [...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : [])]
                    next[idx] = { ...next[idx], iban: evt.target.value.toUpperCase() }
                    return { ...prev, bank_transfer_accounts: next }
                  })
                }
                placeholder="IBAN"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: '8px' }}>
              <input
                value={account.branch || ''}
                onChange={(evt) =>
                  setPayment((prev) => {
                    const next = [...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : [])]
                    next[idx] = { ...next[idx], branch: evt.target.value }
                    return { ...prev, bank_transfer_accounts: next }
                  })
                }
                placeholder="Sube (opsiyonel)"
                style={inputStyle}
              />
              <input
                value={account.account_no || ''}
                onChange={(evt) =>
                  setPayment((prev) => {
                    const next = [...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : [])]
                    next[idx] = { ...next[idx], account_no: evt.target.value }
                    return { ...prev, bank_transfer_accounts: next }
                  })
                }
                placeholder="Hesap no (opsiyonel)"
                style={inputStyle}
              />
              <input
                value={account.currency || 'TRY'}
                onChange={(evt) =>
                  setPayment((prev) => {
                    const next = [...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : [])]
                    next[idx] = { ...next[idx], currency: evt.target.value.toUpperCase() }
                    return { ...prev, bank_transfer_accounts: next }
                  })
                }
                placeholder="Para birimi"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                <label style={checkLabelStyle}>
                  <input
                    type="checkbox"
                    checked={account.enabled !== false}
                    onChange={(evt) =>
                      setPayment((prev) => {
                        const next = [...(Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : [])]
                        next[idx] = { ...next[idx], enabled: evt.target.checked }
                        return { ...prev, bank_transfer_accounts: next }
                      })
                    }
                  />
                  Aktif
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPayment((prev) => ({
                      ...prev,
                      bank_transfer_accounts: (Array.isArray(prev.bank_transfer_accounts) ? prev.bank_transfer_accounts : []).filter(
                        (_, accountIdx) => accountIdx !== idx
                      ),
                    }))
                  }
                  style={dangerMiniStyle}
                >
                  Sil
                </button>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addBankTransferAccount} style={secondaryButton}>
          + Banka hesabi ekle
        </button>
      </div>

      {/* ─── KARGO FİŞİ AYARLARI ─── */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Kargo Fisi Ayarlari</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>

          {/* SOL: Ayarlar */}
          <div>
            {/* Tasarım */}
            <div style={sectionLabelStyle}>Tasarim</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <div style={labelStyle}>Logo yüksekliği (px)</div>
                <input type="number" value={slip.logo_height} onChange={(e) => setSlip((p) => ({ ...p, logo_height: Number(e.target.value) || 80 }))} style={inputStyle} min={20} max={200} />
              </div>
              <div>
                <div style={labelStyle}>QR boyutu (px)</div>
                <input type="number" value={slip.qr_size} onChange={(e) => setSlip((p) => ({ ...p, qr_size: Number(e.target.value) || 150 }))} style={inputStyle} min={40} max={300} />
              </div>
              <div>
                <div style={labelStyle}>Site adresi metni</div>
                <input value={slip.site_url} onChange={(e) => setSlip((p) => ({ ...p, site_url: e.target.value }))} style={inputStyle} placeholder="www.blaene.com.tr" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={labelStyle}>Kağıt genişliği (cm) — 10: termal, 14.8: A6</div>
                <input type="number" value={slip.paper_width_cm} onChange={(e) => setSlip((p) => ({ ...p, paper_width_cm: Number(e.target.value) || 14.8 }))} style={inputStyle} min={5} max={30} step={0.1} />
              </div>
              <div>
                <div style={labelStyle}>Kağıt yüksekliği (cm) — 10: termal, 10.5: A6</div>
                <input type="number" value={slip.paper_height_cm} onChange={(e) => setSlip((p) => ({ ...p, paper_height_cm: Number(e.target.value) || 10.5 }))} style={inputStyle} min={5} max={50} step={0.1} />
              </div>
              <div>
                <div style={labelStyle}>Sığdırma modu</div>
                <select value={slip.paper_fit} onChange={(e) => setSlip((p) => ({ ...p, paper_fit: e.target.value as SlipSettings['paper_fit'] }))} style={inputStyle}>
                  <option value="exact">Tam boyut (exact)</option>
                  <option value="fit">Sığdır (fit)</option>
                  <option value="fill">Doldur (fill)</option>
                </select>
              </div>
            </div>

            {/* Çerçeve */}
            <div style={sectionLabelStyle}>Cerceve</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '10px', alignItems: 'end', marginBottom: '8px' }}>
              <label style={checkLabelStyle}>
                <input type="checkbox" checked={slip.border_enabled} onChange={(e) => setSlip((p) => ({ ...p, border_enabled: e.target.checked }))} />
                Aktif
              </label>
              <div>
                <div style={labelStyle}>Kalinlik (px)</div>
                <input type="number" value={slip.border_width} onChange={(e) => setSlip((p) => ({ ...p, border_width: Number(e.target.value) || 1 }))} style={inputStyle} min={1} max={20} disabled={!slip.border_enabled} />
              </div>
              <div>
                <div style={labelStyle}>Stil</div>
                <select value={slip.border_style} onChange={(e) => setSlip((p) => ({ ...p, border_style: e.target.value }))} style={inputStyle} disabled={!slip.border_enabled}>
                  <option value="solid">Solid (düz)</option>
                  <option value="dashed">Dashed (kesik)</option>
                  <option value="dotted">Dotted (noktalı)</option>
                  <option value="double">Double (çift)</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>Renk</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="color" value={slip.border_color} onChange={(e) => setSlip((p) => ({ ...p, border_color: e.target.value }))} style={{ ...inputStyle, padding: '2px', width: '40px', height: '34px', cursor: 'pointer', flexShrink: 0 }} disabled={!slip.border_enabled} />
                  <input value={slip.border_color} onChange={(e) => setSlip((p) => ({ ...p, border_color: e.target.value }))} style={{ ...inputStyle, minWidth: 0, flex: 1 }} placeholder="#111111" disabled={!slip.border_enabled} />
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <div style={labelStyle}>Köşe yuvarlatma (px)</div>
                <input type="number" value={slip.border_radius} onChange={(e) => setSlip((p) => ({ ...p, border_radius: Number(e.target.value) || 0 }))} style={inputStyle} min={0} max={40} disabled={!slip.border_enabled} />
              </div>
              <div>
                <div style={labelStyle}>İç boşluk (px)</div>
                <input type="number" value={slip.border_padding} onChange={(e) => setSlip((p) => ({ ...p, border_padding: Number(e.target.value) || 0 }))} style={inputStyle} min={0} max={60} disabled={!slip.border_enabled} />
              </div>
            </div>

            {/* Alanlar */}
            <div style={sectionLabelStyle}>Yazdırılacak alanlar</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {([
                ['show_logo', 'Logo'],
                ['show_site_url', 'Site adresi'],
                ['show_qr', 'QR kodu'],
                ['show_order_no', 'Sipariş no'],
                ['show_customer_name', 'Müşteri adı'],
                ['show_email', 'E-posta'],
                ['show_phone', 'Telefon'],
                ['show_address', 'Adres'],
                ['show_city', 'Şehir'],
                ['show_shipping_provider', 'Kargo firması'],
                ['show_tracking_code', 'Takip kodu'],
                ['show_total', 'Toplam tutar'],
                ['show_date', 'Tarih'],
                ['show_items_table', 'Ürün tablosu'],
              ] as [keyof SlipSettings, string][]).map(([key, label]) => (
                <label key={key} style={checkLabelStyle}>
                  <input
                    type="checkbox"
                    checked={slip[key] as boolean}
                    onChange={(e) => setSlip((p) => ({ ...p, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>

            <button
              onClick={() => void (async () => {
                setSaving(true)
                setError('')
                setMessage('')
                try {
                  await saveSiteSetting(token, 'slip_settings', slip, 'Kargo fisi tasarim ve alan ayarlari')
                  setMessage('Kargo fisi ayarlari kaydedildi')
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Kaydedilemedi')
                } finally {
                  setSaving(false)
                }
              })()}
              disabled={saving}
              style={primaryButton}
            >
              {saving ? 'Kaydediliyor...' : 'Kargo fisi ayarlarini kaydet'}
            </button>
          </div>

          {/* SAĞ: Canlı önizleme */}
          <div style={{ position: 'sticky', top: '16px' }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Önizleme</div>
            <div style={{
              background: '#fff',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            }}>
              {/* Fiş önizleme — saf CSS, logo/QR placeholder */}
              <div style={{
                fontFamily: 'Arial, sans-serif',
                fontSize: '11px',
                color: '#111',
                padding: slip.border_enabled ? `${slip.border_padding}px` : '16px',
                border: slip.border_enabled
                  ? `${slip.border_width}px ${slip.border_style} ${slip.border_color}`
                  : 'none',
                borderRadius: slip.border_enabled ? `${slip.border_radius}px` : '0',
                margin: slip.border_enabled ? '8px' : '0',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '8px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {slip.show_logo && (
                      <div style={{ background: '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: `${Math.round(slip.logo_height * 2.2)}px`, height: `${slip.logo_height * 0.5}px`, fontSize: '9px', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>
                        BLAENE LOGO
                      </div>
                    )}
                    {slip.show_site_url && (
                      <span style={{ fontSize: '9px', color: '#666', textAlign: 'center' }}>{slip.site_url || 'www.blaene.com.tr'}</span>
                    )}
                  </div>
                  {slip.show_qr && (
                    <div style={{ background: '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: `${slip.qr_size * 0.4}px`, height: `${slip.qr_size * 0.4}px`, fontSize: '8px', color: '#64748b', flexShrink: 0 }}>
                      QR
                    </div>
                  )}
                </div>
                {/* Meta satırları */}
                <div style={{ marginBottom: '8px', lineHeight: 1.8 }}>
                  {slip.show_order_no && <div><strong>Sipariş:</strong> #BLN-2401</div>}
                  {slip.show_customer_name && <div><strong>Müşteri:</strong> Ahmet Yılmaz</div>}
                  {slip.show_email && <div><strong>E-posta:</strong> ahmet@ornek.com</div>}
                  {slip.show_phone && <div><strong>Telefon:</strong> 0555 000 00 00</div>}
                  {slip.show_address && <div><strong>Adres:</strong> Örnek Mah. No:1</div>}
                  {slip.show_city && <div><strong>Şehir:</strong> İstanbul</div>}
                  {slip.show_shipping_provider && <div><strong>Kargo:</strong> Yurtiçi</div>}
                  {slip.show_tracking_code && <div><strong>Takip:</strong> YK123456</div>}
                  {slip.show_total && <div><strong>Toplam:</strong> 1.250,00 TL</div>}
                  {slip.show_date && <div><strong>Tarih:</strong> {new Date().toLocaleDateString('tr-TR')}</div>}
                </div>
                {/* Ürün tablosu */}
                {slip.show_items_table && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'left' }}>Kod</th>
                        <th style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'left' }}>Ürün</th>
                        <th style={{ border: '1px solid #ddd', padding: '4px 6px' }}>Adet</th>
                        <th style={{ border: '1px solid #ddd', padding: '4px 6px' }}>Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>BLN-001</td>
                        <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>Örnek Ürün</td>
                        <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'center' }}>2</td>
                        <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>1.250 TL</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ─── MANUEL FİŞ ─── */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Anlık Manuel Kargo Fişi Yaz</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <div style={labelStyle}>Müşteri adı</div>
            <input value={manualSlip.customer_name} onChange={(e) => setManualSlip((p) => ({ ...p, customer_name: e.target.value }))} style={inputStyle} placeholder="Ad Soyad" />
          </div>
          <div>
            <div style={labelStyle}>Telefon</div>
            <input value={manualSlip.phone} onChange={(e) => setManualSlip((p) => ({ ...p, phone: e.target.value }))} style={inputStyle} placeholder="0555 000 00 00" />
          </div>
          <div>
            <div style={labelStyle}>Şehir</div>
            <input value={manualSlip.city} onChange={(e) => setManualSlip((p) => ({ ...p, city: e.target.value }))} style={inputStyle} placeholder="İstanbul" />
          </div>
          <div>
            <div style={labelStyle}>Not</div>
            <input value={manualSlip.note} onChange={(e) => setManualSlip((p) => ({ ...p, note: e.target.value }))} style={inputStyle} placeholder="Kırılgan vb." />
          </div>
        </div>
        <div>
          <div style={labelStyle}>Adres</div>
          <textarea value={manualSlip.address} onChange={(e) => setManualSlip((p) => ({ ...p, address: e.target.value }))} style={{ ...inputStyle, width: '100%', minHeight: '56px', resize: 'vertical', marginBottom: '12px' }} placeholder="Mahalle, sokak, bina no..." />
        </div>

        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Ürünler</div>
        {manualSlip.items.map((item, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2.5fr 0.6fr 1fr auto', gap: '8px', marginBottom: '6px' }}>
            <input value={item.name} onChange={(e) => setManualSlip((p) => { const next = [...p.items]; next[idx] = { ...next[idx], name: e.target.value }; return { ...p, items: next } })} style={inputStyle} placeholder="Ürün adı" />
            <input value={item.qty} onChange={(e) => setManualSlip((p) => { const next = [...p.items]; next[idx] = { ...next[idx], qty: e.target.value }; return { ...p, items: next } })} style={inputStyle} placeholder="Adet" />
            <input value={item.price} onChange={(e) => setManualSlip((p) => { const next = [...p.items]; next[idx] = { ...next[idx], price: e.target.value }; return { ...p, items: next } })} style={inputStyle} placeholder="Birim fiyat" />
            <button type="button" onClick={() => setManualSlip((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))} style={dangerMiniStyle} disabled={manualSlip.items.length <= 1}>Sil</button>
          </div>
        ))}
        <button type="button" onClick={() => setManualSlip((p) => ({ ...p, items: [...p.items, { name: '', qty: '1', price: '' }] }))} style={{ ...secondaryButton, marginBottom: '14px' }}>
          + Ürün ekle
        </button>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button type="button" onClick={() => void printManualSlip()} style={{ ...primaryButton, background: '#16a34a' }}>
            Yazdır
          </button>
          <button type="button" onClick={() => void updatePreview()} style={secondaryButton}>
            Önizleme
          </button>
          <button type="button" onClick={() => { setManualSlip(DEFAULT_MANUAL_SLIP); setSlipPreviewHtml('') }} style={dangerMiniStyle}>
            Temizle
          </button>
        </div>

        {slipPreviewHtml && (
          <div style={{ marginTop: '16px', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#0f172a', padding: '6px 12px', fontSize: '11px', color: '#94a3b8' }}>Önizleme (kargo fisi bu sekilde cikacak)</div>
            <iframe
              ref={previewRef}
              srcDoc={slipPreviewHtml}
              style={{ width: '100%', height: '500px', border: 'none', background: '#fff' }}
              title="Fis onizleme"
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => void saveAll()} disabled={saving} style={primaryButton}>
          {saving ? 'Kaydediliyor...' : 'Tum ayarlari kaydet'}
        </button>
        <button onClick={() => void loadSettings()} style={secondaryButton}>
          Yeniden yukle
        </button>
      </div>

      {message && <div style={okStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

const panelStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '18px',
  marginBottom: '16px',
}

const panelTitleStyle: CSSProperties = {
  color: '#fff',
  fontSize: '16px',
  margin: 0,
  marginBottom: '12px',
}

const inputStyle: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '13px',
}

const primaryButton: CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
}

const secondaryButton: CSSProperties = {
  background: '#334155',
  color: '#e2e8f0',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
}

const dangerMiniStyle: CSSProperties = {
  background: '#7f1d1d',
  color: '#fecaca',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
  cursor: 'pointer',
}

const checkLabelStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  alignItems: 'center',
  color: '#cbd5e1',
  fontSize: '12px',
}

const labelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#94a3b8',
  marginBottom: '4px',
  fontWeight: 600,
}

const sectionLabelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#64748b',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '8px',
  marginTop: '4px',
}

const errorStyle: CSSProperties = {
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid #ef4444',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fca5a5',
  fontSize: '12px',
  marginTop: '10px',
}

const okStyle: CSSProperties = {
  background: 'rgba(34, 197, 94, 0.15)',
  border: '1px solid #22c55e',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#86efac',
  fontSize: '12px',
  marginTop: '10px',
}

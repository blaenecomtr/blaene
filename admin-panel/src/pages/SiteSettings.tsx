import { type CSSProperties, useEffect, useState } from 'react'
import { getSiteSetting, saveSiteSetting } from '../lib/siteSettings'

interface ShippingTier {
  min: number
  fee: number
  label: string
}

interface ShippingSettings {
  free_shipping_threshold: number
  base_shipping_fee: number
  tiers: ShippingTier[]
}

interface ContactSettings {
  company_name: string
  email: string
  phone: string
  whatsapp: string
  address: string
}

interface PaymentSettings {
  paytr_enabled: boolean
  iyzico_enabled: boolean
  provider_preference: 'iyzico' | 'paytr'
  paytr_merchant_id: string
  iyzico_api_key: string
  iyzico_secret_key: string
  iyzico_base_url: string
}

const DEFAULT_SHIPPING: ShippingSettings = {
  free_shipping_threshold: 2000,
  base_shipping_fee: 120,
  tiers: [],
}

const DEFAULT_CONTACT: ContactSettings = {
  company_name: 'Blaene',
  email: 'info@blaene.com',
  phone: '',
  whatsapp: '',
  address: '',
}

const DEFAULT_PAYMENT: PaymentSettings = {
  paytr_enabled: false,
  iyzico_enabled: true,
  provider_preference: 'iyzico',
  paytr_merchant_id: '',
  iyzico_api_key: '',
  iyzico_secret_key: '',
  iyzico_base_url: 'https://sandbox-api.iyzipay.com',
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

  const loadSettings = async () => {
    setLoading(true)
    setError('')
    try {
      const [shippingSetting, contactSetting, paymentSetting] = await Promise.all([
        getSiteSetting<ShippingSettings>(token, 'shipping_settings', DEFAULT_SHIPPING),
        getSiteSetting<ContactSettings>(token, 'contact_settings', DEFAULT_CONTACT),
        getSiteSetting<PaymentSettings>(token, 'payment_settings', DEFAULT_PAYMENT),
      ])
      setShipping({ ...DEFAULT_SHIPPING, ...(shippingSetting || {}) })
      setContact({ ...DEFAULT_CONTACT, ...(contactSetting || {}) })
      setPayment({ ...DEFAULT_PAYMENT, ...(paymentSetting || {}) })
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

  const saveAll = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await Promise.all([
        saveSiteSetting(token, 'shipping_settings', shipping, 'Kargo baremleri ve ucretsiz kargo ayarlari'),
        saveSiteSetting(token, 'contact_settings', contact, 'Iletisim bilgileri ve firma metadatasi'),
        saveSiteSetting(token, 'payment_settings', payment, 'Odeme saglayici ve API ayarlari'),
      ])
      setMessage('Site ayarlari kaydedildi')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ayarlar kaydedilemedi'
      setError(msg)
    } finally {
      setSaving(false)
    }
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
        <h3 style={panelTitleStyle}>API / Odeme ayarlari (Iyzico / PayTR)</h3>
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
            placeholder="Iyzico API Key"
            style={inputStyle}
          />
          <input
            value={payment.iyzico_secret_key}
            onChange={(evt) => setPayment((prev) => ({ ...prev, iyzico_secret_key: evt.target.value }))}
            placeholder="Iyzico Secret Key"
            style={inputStyle}
          />
          <input
            value={payment.iyzico_base_url}
            onChange={(evt) => setPayment((prev) => ({ ...prev, iyzico_base_url: evt.target.value }))}
            placeholder="Iyzico Base URL"
            style={inputStyle}
          />
        </div>
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

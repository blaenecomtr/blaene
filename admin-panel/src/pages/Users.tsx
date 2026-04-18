import { type CSSProperties, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface Customer {
  id: string
  username?: string | null
  email: string
  full_name: string
  phone: string | null
  default_address?: string | null
  default_city?: string | null
  customer_type?: string | null
  consent_kvkk?: boolean | null
  consent_terms?: boolean | null
  consent_marketing_email?: boolean | null
  consent_marketing_sms?: boolean | null
  consent_marketing_call?: boolean | null
  created_at?: string
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('tr-TR')
}

function boolLabel(value: boolean | null | undefined) {
  return value ? 'Evet' : 'Hayir'
}

function toCsvCell(value: unknown) {
  const text = String(value ?? '').replace(/"/g, '""')
  return `"${text}"`
}

export default function Users() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const loadCustomers = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page_size', '400')
      if (search.trim()) params.set('search', search.trim())
      const data = await apiRequest<Customer[]>(`/api/admin/customers?${params.toString()}`, { token })
      setCustomers(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Musteriler yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCustomers()
  }, [])

  const exportCustomers = () => {
    if (!customers.length) return
    const headers = [
      'ad_soyad',
      'kullanici_adi',
      'email',
      'telefon',
      'adres',
      'sehir',
      'musteri_tipi',
      'kvkk',
      'sozlesme',
      'mail_izni',
      'sms_izni',
      'arama_izni',
      'kayit_tarihi',
    ]
    const lines = [
      headers.join(','),
      ...customers.map((row) =>
        [
          row.full_name || '',
          row.username || '',
          row.email || '',
          row.phone || '',
          row.default_address || '',
          row.default_city || '',
          row.customer_type || '',
          boolLabel(row.consent_kvkk),
          boolLabel(row.consent_terms),
          boolLabel(row.consent_marketing_email),
          boolLabel(row.consent_marketing_sms),
          boolLabel(row.consent_marketing_call),
          formatDate(row.created_at),
        ]
          .map(toCsvCell)
          .join(',')
      ),
    ]
    const csv = `\uFEFF${lines.join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `musteriler-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Musteriler ve uye izinleri</h2>
      <div style={panelStyle}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            value={search}
            onChange={(evt) => setSearch(evt.target.value)}
            placeholder="Ad, e-posta, telefon veya kullanici adi ara"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={() => void loadCustomers()} style={buttonStyle}>
            Ara
          </button>
          <button onClick={exportCustomers} style={buttonStyle} disabled={!customers.length}>
            CSV indir
          </button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Musteriler yukleniyor...</p>
        ) : !customers.length ? (
          <p style={{ color: '#94a3b8' }}>Kayit bulunamadi.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Ad</th>
                  <th style={thStyle}>Kullanici</th>
                  <th style={thStyle}>E-posta</th>
                  <th style={thStyle}>Telefon</th>
                  <th style={thStyle}>Adres</th>
                  <th style={thStyle}>Sehir</th>
                  <th style={thStyle}>Musteri Tipi</th>
                  <th style={thStyle}>KVKK</th>
                  <th style={thStyle}>Sozlesme</th>
                  <th style={thStyle}>Mail izni</th>
                  <th style={thStyle}>SMS izni</th>
                  <th style={thStyle}>Arama izni</th>
                  <th style={thStyle}>Kayit</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td style={tdStyle}>{customer.full_name || '-'}</td>
                    <td style={tdStyle}>{customer.username || '-'}</td>
                    <td style={tdStyle}>{customer.email || '-'}</td>
                    <td style={tdStyle}>{customer.phone || '-'}</td>
                    <td style={tdStyle}>{customer.default_address || '-'}</td>
                    <td style={tdStyle}>{customer.default_city || '-'}</td>
                    <td style={tdStyle}>{customer.customer_type || '-'}</td>
                    <td style={tdStyle}>{boolLabel(customer.consent_kvkk)}</td>
                    <td style={tdStyle}>{boolLabel(customer.consent_terms)}</td>
                    <td style={tdStyle}>{boolLabel(customer.consent_marketing_email)}</td>
                    <td style={tdStyle}>{boolLabel(customer.consent_marketing_sms)}</td>
                    <td style={tdStyle}>{boolLabel(customer.consent_marketing_call)}</td>
                    <td style={tdStyle}>{formatDate(customer.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const panelStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '18px',
}

const inputStyle: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '13px',
}

const buttonStyle: CSSProperties = {
  background: '#334155',
  color: '#e2e8f0',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
}

const thStyle: CSSProperties = {
  color: '#94a3b8',
  fontWeight: 600,
  fontSize: '12px',
  textAlign: 'left',
  borderBottom: '1px solid #334155',
  padding: '10px 8px',
}

const tdStyle: CSSProperties = {
  color: '#e2e8f0',
  fontSize: '12px',
  borderBottom: '1px solid #1f2937',
  padding: '10px 8px',
}

const errorStyle: CSSProperties = {
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid #ef4444',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fca5a5',
  fontSize: '12px',
  marginBottom: '10px',
}

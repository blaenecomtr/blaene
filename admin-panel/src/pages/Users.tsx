import { type CSSProperties, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface Customer {
  id: string
  email: string
  full_name: string
  phone: string | null
  default_city?: string | null
  created_at?: string
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('tr-TR')
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
      params.set('page_size', '200')
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

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Musteriler</h2>
      <div style={panelStyle}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            value={search}
            onChange={(evt) => setSearch(evt.target.value)}
            placeholder="Ad veya e-posta ara"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={() => void loadCustomers()} style={buttonStyle}>
            Ara
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
                  <th style={thStyle}>E-posta</th>
                  <th style={thStyle}>Telefon</th>
                  <th style={thStyle}>Sehir</th>
                  <th style={thStyle}>Kayit</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td style={tdStyle}>{customer.full_name || '-'}</td>
                    <td style={tdStyle}>{customer.email || '-'}</td>
                    <td style={tdStyle}>{customer.phone || '-'}</td>
                    <td style={tdStyle}>{customer.default_city || '-'}</td>
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

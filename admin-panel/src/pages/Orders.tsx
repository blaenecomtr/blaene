import { type CSSProperties, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface Order {
  id: string
  order_no: string
  customer_name: string
  email: string
  total: number
  payment_status: string
  status: string
  created_at: string
  tracking_code?: string | null
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('tr-TR')
}

export default function Orders() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('all')

  const loadOrders = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page_size', '200')
      if (search.trim()) params.set('search', search.trim())
      if (paymentStatus !== 'all') params.set('status', paymentStatus)
      const data = await apiRequest<Order[]>(`/api/admin/orders?${params.toString()}`, { token })
      setOrders(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Siparisler yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [paymentStatus])

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Siparisler</h2>
      <div style={panelStyle}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            value={search}
            onChange={(evt) => setSearch(evt.target.value)}
            placeholder="Siparis no, e-posta veya ad ile ara"
            style={{ ...inputStyle, flex: 1 }}
          />
          <select value={paymentStatus} onChange={(evt) => setPaymentStatus(evt.target.value)} style={inputStyle}>
            <option value="all">all</option>
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="failed">failed</option>
          </select>
          <button onClick={() => void loadOrders()} style={buttonStyle}>
            Yenile
          </button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Siparisler yukleniyor...</p>
        ) : !orders.length ? (
          <p style={{ color: '#94a3b8' }}>Siparis bulunamadi.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Siparis</th>
                  <th style={thStyle}>Musteri</th>
                  <th style={thStyle}>Toplam</th>
                  <th style={thStyle}>Odeme</th>
                  <th style={thStyle}>Kargo</th>
                  <th style={thStyle}>Tarih</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td style={tdStyle}>{order.order_no}</td>
                    <td style={tdStyle}>
                      <div>{order.customer_name || '-'}</div>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>{order.email || '-'}</div>
                    </td>
                    <td style={tdStyle}>{formatPrice(order.total || 0)}</td>
                    <td style={tdStyle}>{order.payment_status || '-'}</td>
                    <td style={tdStyle}>
                      <div>{order.status || '-'}</div>
                      {order.tracking_code && (
                        <div style={{ color: '#94a3b8', fontSize: '11px' }}>{order.tracking_code}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{formatDate(order.created_at)}</td>
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
  verticalAlign: 'top',
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

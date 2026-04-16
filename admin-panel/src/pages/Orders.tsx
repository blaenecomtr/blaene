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
  shipping_provider?: string | null
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

function paymentLabel(value: string) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'paid') return 'Odendi'
  if (normalized === 'failed') return 'Basarisiz'
  return 'Bekliyor'
}

function workflowLabel(value: string) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'processing') return 'Onaylandi'
  if (normalized === 'shipped') return 'Kargoda'
  if (normalized === 'delivered') return 'Teslim'
  if (normalized === 'cancelled') return 'Reddedildi'
  return 'Beklemede'
}

function statusBadgeStyle(value: string): CSSProperties {
  const normalized = String(value || '').toLowerCase()
  const palette: Record<string, { bg: string; border: string; color: string }> = {
    paid: { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', color: '#86efac' },
    failed: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', color: '#fca5a5' },
    pending: { bg: 'rgba(148,163,184,0.15)', border: '#64748b', color: '#cbd5e1' },
    processing: { bg: 'rgba(59,130,246,0.18)', border: '#3b82f6', color: '#93c5fd' },
    shipped: { bg: 'rgba(168,85,247,0.18)', border: '#a855f7', color: '#d8b4fe' },
    delivered: { bg: 'rgba(16,185,129,0.18)', border: '#10b981', color: '#6ee7b7' },
    cancelled: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', color: '#fca5a5' },
  }
  const selected = palette[normalized] || palette.pending
  return {
    display: 'inline-block',
    border: `1px solid ${selected.border}`,
    color: selected.color,
    background: selected.bg,
    borderRadius: '999px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600,
  }
}

export default function Orders() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('all')
  const [workflowStatus, setWorkflowStatus] = useState('all')
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({})

  const loadOrders = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page_size', '200')
      if (search.trim()) params.set('search', search.trim())
      if (paymentStatus !== 'all') params.set('status', paymentStatus)
      if (workflowStatus !== 'all') params.set('workflow_status', workflowStatus)
      const data = await apiRequest<Order[]>(`/api/admin/orders?${params.toString()}`, { token })
      const nextOrders = Array.isArray(data) ? data : []
      setOrders(nextOrders)
      setTrackingDrafts((prev) => {
        const next: Record<string, string> = {}
        nextOrders.forEach((order) => {
          next[order.id] = prev[order.id] ?? String(order.tracking_code || '')
        })
        return next
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Siparisler yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [paymentStatus, workflowStatus])

  const runAction = async (orderId: string, actionName: string, task: () => Promise<void>) => {
    setActionLoading((prev) => ({ ...prev, [orderId]: actionName }))
    setError('')
    setMessage('')
    try {
      await task()
      await loadOrders()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Islem basarisiz'
      setError(msg)
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[orderId]
        return next
      })
    }
  }

  const updateOrderWorkflow = async (order: Order, nextStatus: string, successMessage: string) => {
    if (!token) return
    await runAction(order.id, nextStatus, async () => {
      await apiRequest('/api/admin/order-status', {
        method: 'POST',
        token,
        body: {
          order_ids: [order.id],
          workflow_status: nextStatus,
        },
      })
      setMessage(`${order.order_no}: ${successMessage}`)
    })
  }

  const saveTrackingCode = async (order: Order) => {
    if (!token) return
    await runAction(order.id, 'tracking', async () => {
      await apiRequest('/api/admin/shipping', {
        method: 'PUT',
        token,
        body: {
          order_id: order.id,
          tracking_code: trackingDrafts[order.id] || '',
        },
      })
      setMessage(`${order.order_no}: takip no kaydedildi`)
    })
  }

  const markAsShipped = async (order: Order) => {
    if (!token) return
    const tracking = String(trackingDrafts[order.id] || '').trim()
    if (!tracking) {
      setError(`${order.order_no}: once takip no girin`)
      return
    }

    await runAction(order.id, 'shipped', async () => {
      await apiRequest('/api/admin/shipping', {
        method: 'PUT',
        token,
        body: {
          order_id: order.id,
          status: 'shipped',
          tracking_code: tracking,
        },
      })
      setMessage(`${order.order_no}: kargoya verildi`)
    })
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Siparisler</h2>
      <div style={panelStyle}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(evt) => setSearch(evt.target.value)}
            placeholder="Siparis no, e-posta veya ad ile ara"
            style={{ ...inputStyle, flex: 1, minWidth: '240px' }}
          />
          <select value={paymentStatus} onChange={(evt) => setPaymentStatus(evt.target.value)} style={inputStyle}>
            <option value="all">Odeme: tumu</option>
            <option value="pending">Odeme: pending</option>
            <option value="paid">Odeme: paid</option>
            <option value="failed">Odeme: failed</option>
          </select>
          <select value={workflowStatus} onChange={(evt) => setWorkflowStatus(evt.target.value)} style={inputStyle}>
            <option value="all">Durum: tumu</option>
            <option value="pending">Durum: pending</option>
            <option value="processing">Durum: processing</option>
            <option value="shipped">Durum: shipped</option>
            <option value="delivered">Durum: delivered</option>
            <option value="cancelled">Durum: cancelled</option>
          </select>
          <button onClick={() => void loadOrders()} style={buttonStyle}>
            Yenile
          </button>
        </div>

        {message && <div style={okStyle}>{message}</div>}
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
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Kargo</th>
                  <th style={thStyle}>Tarih</th>
                  <th style={thStyle}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const busy = Boolean(actionLoading[order.id])
                  return (
                    <tr key={order.id}>
                      <td style={tdStyle}>{order.order_no}</td>
                      <td style={tdStyle}>
                        <div>{order.customer_name || '-'}</div>
                        <div style={{ color: '#94a3b8', fontSize: '11px' }}>{order.email || '-'}</div>
                      </td>
                      <td style={tdStyle}>{formatPrice(order.total || 0)}</td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle(order.payment_status)}>{paymentLabel(order.payment_status)}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle(order.status)}>{workflowLabel(order.status)}</span>
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={trackingDrafts[order.id] || ''}
                          onChange={(evt) =>
                            setTrackingDrafts((prev) => ({ ...prev, [order.id]: evt.target.value }))
                          }
                          placeholder="Takip no"
                          style={{ ...inputStyle, width: '160px' }}
                        />
                        <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '11px' }}>
                          {order.shipping_provider || 'manual'}
                        </div>
                      </td>
                      <td style={tdStyle}>{formatDate(order.created_at)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
                          <button
                            disabled={busy}
                            onClick={() => void updateOrderWorkflow(order, 'processing', 'siparis onaylandi')}
                            style={approveButtonStyle}
                          >
                            {actionLoading[order.id] === 'processing' ? 'Isleniyor...' : 'Onayla'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void updateOrderWorkflow(order, 'cancelled', 'siparis reddedildi')}
                            style={rejectButtonStyle}
                          >
                            {actionLoading[order.id] === 'cancelled' ? 'Isleniyor...' : 'Reddet'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void markAsShipped(order)}
                            style={shipButtonStyle}
                          >
                            {actionLoading[order.id] === 'shipped' ? 'Isleniyor...' : 'Kargoya verildi'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void saveTrackingCode(order)}
                            style={buttonStyle}
                          >
                            {actionLoading[order.id] === 'tracking' ? 'Kaydediliyor...' : 'Takip no kaydet'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
  padding: '8px 10px',
  fontSize: '12px',
  cursor: 'pointer',
}

const approveButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#1d4ed8',
  color: '#dbeafe',
}

const rejectButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#991b1b',
  color: '#fecaca',
}

const shipButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#6d28d9',
  color: '#e9d5ff',
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

const okStyle: CSSProperties = {
  background: 'rgba(34, 197, 94, 0.15)',
  border: '1px solid #22c55e',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#86efac',
  fontSize: '12px',
  marginBottom: '10px',
}

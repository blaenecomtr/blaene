import { type CSSProperties, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface AnalyticsResponse {
  metrics?: {
    paid_revenue?: number
    new_orders?: number
    paid_orders?: number
    active_users?: number
    low_stock_products?: number
    open_support_tickets?: number
  }
}

function card(label: string, value: string, color: string) {
  return (
    <div style={cardStyle}>
      <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metrics, setMetrics] = useState<AnalyticsResponse['metrics']>({})

  const loadMetrics = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest<AnalyticsResponse>('/api/admin/analytics?range=month', { token })
      setMetrics(data?.metrics || {})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dashboard verisi yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMetrics()
  }, [])

  if (loading) {
    return <p style={{ color: '#94a3b8' }}>Dashboard yukleniyor...</p>
  }

  if (error) {
    return <div style={errorStyle}>{error}</div>
  }

  const paidRevenue = Number(metrics?.paid_revenue || 0)
  const revenueLabel = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(paidRevenue)

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Dashboard</h2>
      <div style={gridStyle}>
        {card('Aylik ciro', revenueLabel, '#22c55e')}
        {card('Yeni siparis', String(metrics?.new_orders || 0), '#3b82f6')}
        {card('Odeme alinan', String(metrics?.paid_orders || 0), '#10b981')}
        {card('Aktif kullanici', String(metrics?.active_users || 0), '#38bdf8')}
        {card('Dusuk stok', String(metrics?.low_stock_products || 0), '#f59e0b')}
        {card('Acik destek', String(metrics?.open_support_tickets || 0), '#e879f9')}
      </div>
    </div>
  )
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '15px',
}

const cardStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '20px',
}

const errorStyle: CSSProperties = {
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid #ef4444',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fca5a5',
  fontSize: '12px',
}

import { type CSSProperties, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface TrafficRow {
  count: number
}

interface AnalyticsResponse {
  metrics?: {
    paid_revenue?: number
    new_orders?: number
    paid_orders?: number
    active_users?: number
    low_stock_products?: number
    open_support_tickets?: number
    traffic_page_views?: number
    traffic_clicks?: number
    traffic_unique_visitors?: number
  }
  traffic?: {
    total_views?: number
    total_clicks?: number
    unique_visitors?: number
    top_sources?: Array<TrafficRow & { source: string }>
    top_pages?: Array<TrafficRow & { page: string }>
    top_clicks?: Array<TrafficRow & { label: string }>
    recent_visitors?: Array<{
      at?: string | null
      source?: string | null
      page?: string | null
      ip?: string | null
      referrer?: string | null
    }>
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('tr-TR')
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
  const [traffic, setTraffic] = useState<AnalyticsResponse['traffic']>({})

  const loadMetrics = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest<AnalyticsResponse>('/api/admin/analytics?range=month', { token })
      setMetrics(data?.metrics || {})
      setTraffic(data?.traffic || {})
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

  const topSources = Array.isArray(traffic?.top_sources) ? traffic.top_sources : []
  const topPages = Array.isArray(traffic?.top_pages) ? traffic.top_pages : []
  const topClicks = Array.isArray(traffic?.top_clicks) ? traffic.top_clicks : []
  const recentVisitors = Array.isArray(traffic?.recent_visitors) ? traffic.recent_visitors : []

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

      <h3 style={sectionTitleStyle}>Site trafigi (Son 30 gun)</h3>
      <div style={gridStyle}>
        {card('Sayfa goruntuleme', String(traffic?.total_views || metrics?.traffic_page_views || 0), '#f97316')}
        {card('Tiklama', String(traffic?.total_clicks || metrics?.traffic_clicks || 0), '#14b8a6')}
        {card('Tekil ziyaretci', String(traffic?.unique_visitors || metrics?.traffic_unique_visitors || 0), '#a855f7')}
      </div>

      <div style={trafficGridStyle}>
        <div style={panelStyle}>
          <h4 style={panelTitleStyle}>Baglanti kaynaklari</h4>
          {!topSources.length ? (
            <p style={emptyStyle}>Kayit yok.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Kaynak</th>
                  <th style={thStyle}>Goruntuleme</th>
                </tr>
              </thead>
              <tbody>
                {topSources.map((item) => (
                  <tr key={`source-${item.source}`}>
                    <td style={tdStyle}>{item.source}</td>
                    <td style={tdStyle}>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={panelStyle}>
          <h4 style={panelTitleStyle}>En cok ziyaret edilen sayfalar</h4>
          {!topPages.length ? (
            <p style={emptyStyle}>Kayit yok.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Sayfa</th>
                  <th style={thStyle}>Goruntuleme</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((item) => (
                  <tr key={`page-${item.page}`}>
                    <td style={tdStyle}>{item.page}</td>
                    <td style={tdStyle}>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={trafficGridStyle}>
        <div style={panelStyle}>
          <h4 style={panelTitleStyle}>En cok tiklanan ogeler</h4>
          {!topClicks.length ? (
            <p style={emptyStyle}>Kayit yok.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Oge</th>
                  <th style={thStyle}>Tiklama</th>
                </tr>
              </thead>
              <tbody>
                {topClicks.map((item) => (
                  <tr key={`click-${item.label}`}>
                    <td style={tdStyle}>{item.label}</td>
                    <td style={tdStyle}>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={panelStyle}>
          <h4 style={panelTitleStyle}>Son ziyaretler</h4>
          {!recentVisitors.length ? (
            <p style={emptyStyle}>Kayit yok.</p>
          ) : (
            <div style={{ maxHeight: '290px', overflowY: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Saat</th>
                    <th style={thStyle}>Kaynak</th>
                    <th style={thStyle}>Sayfa</th>
                    <th style={thStyle}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVisitors.map((item, idx) => (
                    <tr key={`recent-${idx}`}>
                      <td style={tdStyle}>{formatDate(item.at)}</td>
                      <td style={tdStyle}>{item.source || 'direct'}</td>
                      <td style={tdStyle}>{item.page || '-'}</td>
                      <td style={tdStyle}>{item.ip || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const sectionTitleStyle: CSSProperties = {
  color: '#fff',
  fontSize: '16px',
  marginTop: '28px',
  marginBottom: '14px',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '15px',
}

const trafficGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '14px',
  marginTop: '14px',
}

const cardStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '20px',
}

const panelStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '16px',
}

const panelTitleStyle: CSSProperties = {
  color: '#fff',
  fontSize: '14px',
  marginTop: 0,
  marginBottom: '10px',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
}

const thStyle: CSSProperties = {
  color: '#94a3b8',
  fontWeight: 600,
  fontSize: '12px',
  textAlign: 'left',
  borderBottom: '1px solid #334155',
  padding: '8px 6px',
}

const tdStyle: CSSProperties = {
  color: '#e2e8f0',
  fontSize: '12px',
  borderBottom: '1px solid #1f2937',
  padding: '8px 6px',
  verticalAlign: 'top',
}

const emptyStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: 0,
}

const errorStyle: CSSProperties = {
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid #ef4444',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fca5a5',
  fontSize: '12px',
}

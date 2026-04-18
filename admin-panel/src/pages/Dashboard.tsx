import { type CSSProperties, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface TrafficRow {
  count: number
}

interface AnalyticsResponse {
  metrics?: {
    paid_revenue?: number
    daily_revenue?: number
    new_orders?: number
    paid_orders?: number
    pending_orders?: number
    active_users?: number
    low_stock_products?: number
    out_of_stock_products?: number
    open_support_tickets?: number
    traffic_page_views?: number
    traffic_clicks?: number
    traffic_unique_visitors?: number
  }
  charts?: {
    daily_sales?: Array<{ date: string; orders: number; paid_revenue: number }>
    payment_distribution?: Record<string, number>
    order_status_distribution?: Record<string, number>
    product_category_distribution?: Record<string, number>
  }
  traffic?: {
    total_views?: number
    total_clicks?: number
    unique_visitors?: number
    top_sources?: Array<TrafficRow & { source: string }>
    top_pages?: Array<TrafficRow & { page: string }>
    top_products?: Array<TrafficRow & { product_id: string }>
    top_clicks?: Array<TrafficRow & { label: string; product_id?: string | null }>
    visitor_by_country?: Array<{ country: string; count: number }>
    visitor_by_city?: Array<{ city: string; count: number }>
    recent_visitors?: Array<{
      at?: string | null
      source?: string | null
      page?: string | null
      ip?: string | null
      referrer?: string | null
      device?: string | null
      country?: string | null
      city?: string | null
    }>
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('tr-TR')
}

function card(label: string, value: string, color: string, onClick?: () => void) {
  return (
    <div style={{ ...cardStyle, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
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
  const [charts, setCharts] = useState<AnalyticsResponse['charts']>({})
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('month')
  const [detailModal, setDetailModal] = useState<{ type: string; data: any } | null>(null)

  const loadMetrics = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest<AnalyticsResponse>(`/api/admin/analytics?range=${dateRange}`, { token })
      setMetrics(data?.metrics || {})
      setTraffic(data?.traffic || {})
      setCharts(data?.charts || {})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dashboard verisi yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMetrics()
  }, [dateRange])

  if (loading) {
    return <p style={{ color: '#94a3b8' }}>Dashboard yukleniyor...</p>
  }

  if (error) {
    return <div style={errorStyle}>{error}</div>
  }

  const paidRevenue = Number(metrics?.paid_revenue || 0)
  const dailyRevenue = Number(metrics?.daily_revenue || 0)
  const revenueLabel = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(paidRevenue)
  const dailyRevenueLabel = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(dailyRevenue)

  const topSources = Array.isArray(traffic?.top_sources) ? traffic.top_sources : []
  const topPages = Array.isArray(traffic?.top_pages) ? traffic.top_pages : []
  const topProducts = Array.isArray(traffic?.top_products) ? traffic.top_products : []
  const topClicks = Array.isArray(traffic?.top_clicks) ? traffic.top_clicks : []
  const recentVisitors = Array.isArray(traffic?.recent_visitors) ? traffic.recent_visitors : []

  const visitorsByCountry = Array.isArray(traffic?.visitor_by_country) ? traffic.visitor_by_country : []
  const visitorsByCity = Array.isArray(traffic?.visitor_by_city) ? traffic.visitor_by_city : []
  const webVisitors = recentVisitors.filter((v) => v.device !== 'mobile')
  const mobileVisitors = recentVisitors.filter((v) => v.device === 'mobile')

  const openDetailModal = (type: string, data: any) => {
    setDetailModal({ type, data })
  }

  const closeDetailModal = () => {
    setDetailModal(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', color: '#fff', margin: 0 }}>Dashboard</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['today', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              style={{
                padding: '6px 12px',
                background: dateRange === range ? '#3b82f6' : '#334155',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: dateRange === range ? 600 : 400,
              }}
            >
              {range === 'today' ? 'Bugün' : range === 'week' ? 'Bu Hafta' : 'Bu Ay'}
            </button>
          ))}
        </div>
      </div>

      <div style={gridStyle}>
        {card('Gunluk ciro', dailyRevenueLabel, '#22c55e', () => openDetailModal('daily_revenue', { value: dailyRevenue }))}
        {card('Bekleyen siparis', String(metrics?.pending_orders || 0), '#f59e0b', () => openDetailModal('pending_orders', { value: metrics?.pending_orders || 0 }))}
        {card('Biten stoklar', String(metrics?.out_of_stock_products || 0), '#ef4444', () => openDetailModal('out_of_stock', { value: metrics?.out_of_stock_products || 0 }))}
        {card('Aylik ciro', revenueLabel, '#16a34a', () => openDetailModal('paid_revenue', { value: paidRevenue }))}
        {card('Yeni siparis', String(metrics?.new_orders || 0), '#3b82f6', () => openDetailModal('new_orders', { value: metrics?.new_orders || 0 }))}
        {card('Odeme alinan', String(metrics?.paid_orders || 0), '#10b981', () => openDetailModal('paid_orders', { value: metrics?.paid_orders || 0 }))}
        {card('Aktif kullanici', String(metrics?.active_users || 0), '#38bdf8', () => openDetailModal('active_users', { value: metrics?.active_users || 0 }))}
        {card('Dusuk stok', String(metrics?.low_stock_products || 0), '#f59e0b', () => openDetailModal('low_stock', { value: metrics?.low_stock_products || 0 }))}
        {card('Acik destek', String(metrics?.open_support_tickets || 0), '#e879f9', () => openDetailModal('support_tickets', { value: metrics?.open_support_tickets || 0 }))}
      </div>

      <h3 style={sectionTitleStyle}>
        Site trafigi (
        {dateRange === 'today' ? 'Bugün' : dateRange === 'week' ? 'Bu Hafta' : 'Son 30 Gün'}
        )
      </h3>
      <div style={gridStyle}>
        {card('Sayfa goruntuleme', String(traffic?.total_views || metrics?.traffic_page_views || 0), '#f97316')}
        {card('Tiklama', String(traffic?.total_clicks || metrics?.traffic_clicks || 0), '#14b8a6')}
        {card('Tekil ziyaretci', String(traffic?.unique_visitors || metrics?.traffic_unique_visitors || 0), '#a855f7')}
      </div>

      {Array.isArray(charts?.daily_sales) && charts.daily_sales.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <h3 style={sectionTitleStyle}>Günlük Satış Eğilimi</h3>
          <div style={panelStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {charts.daily_sales.map((day, idx) => {
                const maxRevenue = Math.max(...charts.daily_sales!.map((d) => d.paid_revenue || 0), 1)
                const barWidth = ((day.paid_revenue || 0) / maxRevenue) * 100
                const revenueLabel = new Intl.NumberFormat('tr-TR', {
                  style: 'currency',
                  currency: 'TRY',
                  maximumFractionDigits: 0,
                }).format(day.paid_revenue || 0)
                return (
                  <div key={`daily-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', minWidth: '80px' }}>{day.date}</div>
                    <div style={{ flex: 1, height: '24px', background: '#334155', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                      <div
                        style={{
                          height: '100%',
                          background: '#10b981',
                          width: `${barWidth}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, minWidth: '100px', textAlign: 'right' }}>
                      {revenueLabel} ({day.orders || 0} sipariş)
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {visitorsByCountry.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <h3 style={sectionTitleStyle}>Ülkelere Göre Ziyaretçiler</h3>
          <div style={panelStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {visitorsByCountry.map((item, idx) => {
                const maxCount = Math.max(...visitorsByCountry.map((v) => v.count), 1)
                const barWidth = (item.count / maxCount) * 100
                return (
                  <div key={`country-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', minWidth: '100px' }}>{item.country || 'Bilinmeyen'}</div>
                    <div style={{ flex: 1, height: '24px', background: '#334155', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                      <div
                        style={{
                          height: '100%',
                          background: '#a855f7',
                          width: `${barWidth}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '12px', color: '#a855f7', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                      {item.count}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {visitorsByCity.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <h3 style={sectionTitleStyle}>Şehirlere Göre Ziyaretçiler</h3>
          <div style={panelStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {visitorsByCity.map((item, idx) => {
                const maxCount = Math.max(...visitorsByCity.map((v) => v.count), 1)
                const barWidth = (item.count / maxCount) * 100
                return (
                  <div key={`city-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', minWidth: '120px' }}>{item.city || 'Bilinmeyen'}</div>
                    <div style={{ flex: 1, height: '24px', background: '#334155', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                      <div
                        style={{
                          height: '100%',
                          background: '#f59e0b',
                          width: `${barWidth}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                      {item.count}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

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

        <div style={panelStyle}>
          <h4 style={panelTitleStyle}>En cok ziyaret edilen urunler</h4>
          {!topProducts.length ? (
            <p style={emptyStyle}>Kayit yok.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topProducts.map((item) => {
                const maxCount = Math.max(...topProducts.map((p) => p.count), 1)
                const barWidth = (item.count / maxCount) * 100
                return (
                  <div key={`product-${item.product_id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', minWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.product_id}
                    </div>
                    <div style={{ flex: 1, height: '20px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          background: '#06b6d4',
                          width: `${barWidth}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '12px', color: '#06b6d4', fontWeight: 600, minWidth: '50px', textAlign: 'right' }}>
                      {item.count}
                    </div>
                  </div>
                )
              })}
            </div>
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
                  <th style={thStyle}>Urun Kodu</th>
                  <th style={thStyle}>Tiklama</th>
                </tr>
              </thead>
              <tbody>
                {topClicks.map((item) => (
                  <tr key={`click-${item.label}`}>
                    <td style={tdStyle}>{item.label}</td>
                    <td style={tdStyle}>{item.product_id || '-'}</td>
                    <td style={tdStyle}>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={panelStyle}>
          <h4 style={panelTitleStyle}>Son Ziyaretler - 💻 Web</h4>
          {!webVisitors.length ? (
            <p style={emptyStyle}>Kayit yok.</p>
          ) : (
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Saat</th>
                    <th style={thStyle}>Kaynak</th>
                    <th style={thStyle}>Sayfa</th>
                    <th style={thStyle}>Ülke</th>
                    <th style={thStyle}>Şehir</th>
                  </tr>
                </thead>
                <tbody>
                  {webVisitors.map((item, idx) => (
                    <tr key={`web-${idx}`}>
                      <td style={tdStyle}>{formatDate(item.at)}</td>
                      <td style={tdStyle}>{item.source || 'direct'}</td>
                      <td style={tdStyle}>{item.page || '-'}</td>
                      <td style={tdStyle}>{item.country || '-'}</td>
                      <td style={tdStyle}>{item.city || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={panelStyle}>
          <h4 style={panelTitleStyle}>Son Ziyaretler - 📱 Mobile</h4>
          {!mobileVisitors.length ? (
            <p style={emptyStyle}>Kayit yok.</p>
          ) : (
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Saat</th>
                    <th style={thStyle}>Kaynak</th>
                    <th style={thStyle}>Sayfa</th>
                    <th style={thStyle}>Ülke</th>
                    <th style={thStyle}>Şehir</th>
                  </tr>
                </thead>
                <tbody>
                  {mobileVisitors.map((item, idx) => (
                    <tr key={`mobile-${idx}`}>
                      <td style={tdStyle}>{formatDate(item.at)}</td>
                      <td style={tdStyle}>{item.source || 'direct'}</td>
                      <td style={tdStyle}>{item.page || '-'}</td>
                      <td style={tdStyle}>{item.country || '-'}</td>
                      <td style={tdStyle}>{item.city || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailModal && (
        <div style={modalOverlayStyle} onClick={closeDetailModal}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Detay</h3>
              <button
                onClick={closeDetailModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ color: '#e2e8f0', fontSize: '14px' }}>
              <p style={{ marginTop: 0 }}>
                <strong>Tür:</strong> {detailModal.type}
              </p>
              <p>
                <strong>Değer:</strong> {detailModal.data?.value}
              </p>
              <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: 0 }}>
                Bu metrik {dateRange === 'today' ? 'bugüne' : dateRange === 'week' ? 'bu haftaya' : 'son 30 güne'} aittir.
              </p>
            </div>
          </div>
        </div>
      )}
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

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalContentStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '24px',
  maxWidth: '400px',
  width: '90%',
}

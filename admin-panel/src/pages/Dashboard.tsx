import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'

interface AnalyticsResponse {
  metrics?: {
    daily_revenue?: number
    total_orders?: number
    new_orders?: number
    paid_orders?: number
    conversion_rate?: number
    average_order_value?: number
  }
  charts?: {
    order_status_distribution?: Record<string, number>
  }
  traffic?: {
    top_product_clicks?: Array<{
      product_id?: string | null
      product_name?: string | null
      count?: number
    }>
    abandoned_customers?: Array<{
      session_id?: string | null
      customer_name?: string | null
      customer_email?: string | null
      product_code?: string | null
      product_name?: string | null
      count?: number
      last_at?: string | null
    }>
  }
}

interface DashboardModalState {
  title: string
  description?: string
  rows: Array<{ label: string; value: string | number }>
}

interface MarketingEmailStatusResponse {
  env?: {
    resend_configured?: boolean
    cron_secret_configured?: boolean
    abandoned_cart_promo_code?: string | null
    product_intro_batch_limit?: number
  }
  summary?: {
    last_7_days?: {
      abandoned_cart?: number
      product_intro?: number
      shipped_manual?: number
    }
    all_time?: {
      abandoned_cart?: number
      product_intro?: number
      shipped_manual?: number
    }
    latest?: {
      abandoned_cart?: string | null
      product_intro?: string | null
      shipped_manual?: string | null
    }
  }
  pending_shipment?: {
    days_filter?: string
    available_day_filters?: string[]
    total?: number
    limit?: number
    items?: Array<{
      order_id?: string | null
      order_no?: string | null
      customer_name?: string | null
      email?: string | null
      status?: string | null
      payment_status?: string | null
      total?: number
      currency?: string | null
      paid_at?: string | null
      created_at?: string | null
      age_days?: number | null
    }>
  }
}

interface MarketingEmailActionResponse {
  action?: string
  mode?: string
  executed_at?: string
  result?: {
    abandoned_cart?: {
      sent?: number
    } | null
    product_intro?: {
      sent?: number
    } | null
  }
  shipped?: {
    sent?: boolean
    order_no?: string | null
    email?: string | null
  }
  status?: MarketingEmailStatusResponse
}

type MarketingActionType = 'send_abandoned' | 'send_product_intro' | 'send_all' | 'send_shipped'
type PendingShipmentDaysOption = 'all' | '7' | '14' | '30' | '90'

const pendingShipmentDayOptions: Array<{ value: PendingShipmentDaysOption; label: string }> = [
  { value: 'all', label: 'Tum tarih' },
  { value: '7', label: 'Son 7 gun' },
  { value: '14', label: 'Son 14 gun' },
  { value: '30', label: 'Son 30 gun' },
  { value: '90', label: 'Son 90 gun' },
]

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('tr-TR')
}

function normalizePendingShipmentDaysOption(value: unknown): PendingShipmentDaysOption {
  const raw = String(value || '').toLowerCase()
  if (raw === 'all' || raw === '7' || raw === '14' || raw === '30' || raw === '90') {
    return raw
  }
  return '30'
}

function workflowStatusLabel(value?: string | null): string {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'pending') return 'Yeni'
  if (normalized === 'processing') return 'Uretimde'
  if (normalized === 'shipped') return 'Kargoda'
  if (normalized === 'delivered') return 'Teslim'
  if (normalized === 'cancelled') return 'Iptal'
  return normalized || '-'
}

export default function Dashboard() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<AnalyticsResponse>({})
  const [detailModal, setDetailModal] = useState<DashboardModalState | null>(null)
  const [marketingStatus, setMarketingStatus] = useState<MarketingEmailStatusResponse | null>(null)
  const [marketingBusyAction, setMarketingBusyAction] = useState<MarketingActionType | ''>('')
  const [marketingMessage, setMarketingMessage] = useState('')
  const [marketingError, setMarketingError] = useState('')
  const [manualShippedOrderNo, setManualShippedOrderNo] = useState('')
  const [pendingShipmentDays, setPendingShipmentDays] = useState<PendingShipmentDaysOption>('30')
  const [selectedPendingOrderNo, setSelectedPendingOrderNo] = useState('')

  const buildMarketingStatusPath = (daysValue: PendingShipmentDaysOption) =>
    `/api/admin/marketing-emails?pending_days=${encodeURIComponent(daysValue)}&pending_limit=80`

  const loadMarketingStatus = async (daysValue: PendingShipmentDaysOption = pendingShipmentDays) => {
    if (!token) return null
    const safeDays = normalizePendingShipmentDaysOption(daysValue)
    const status = await apiRequest<MarketingEmailStatusResponse>(buildMarketingStatusPath(safeDays), { token })
    setMarketingStatus(status || null)
    return status
  }

  const loadDashboard = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const safeDays = normalizePendingShipmentDaysOption(pendingShipmentDays)
      const [response, mailStatus] = await Promise.all([
        apiRequest<AnalyticsResponse>('/api/admin/analytics?range=month', { token }),
        apiRequest<MarketingEmailStatusResponse>(buildMarketingStatusPath(safeDays), { token }).catch(() => null),
      ])
      setData(response || {})
      if (mailStatus) setMarketingStatus(mailStatus)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dashboard verisi yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const metrics = data.metrics || {}
  const orderStatuses = data.charts?.order_status_distribution || {}
  const topProductClicks = Array.isArray(data.traffic?.top_product_clicks) ? data.traffic?.top_product_clicks : []
  const abandonedRows = Array.isArray(data.traffic?.abandoned_customers) ? data.traffic?.abandoned_customers : []
  const emailSummary = marketingStatus?.summary
  const emailEnv = marketingStatus?.env
  const pendingShipment = marketingStatus?.pending_shipment
  const pendingShipmentRows = useMemo(
    () => (Array.isArray(pendingShipment?.items) ? pendingShipment?.items : []),
    [pendingShipment?.items]
  )
  const pendingShipmentTotal = asNumber(pendingShipment?.total, 0)

  useEffect(() => {
    if (!pendingShipmentRows.length) {
      setSelectedPendingOrderNo('')
      return
    }
    setSelectedPendingOrderNo((current) => {
      const exists = pendingShipmentRows.some((row) => String(row?.order_no || '').trim() === current)
      if (exists) return current
      return String(pendingShipmentRows[0]?.order_no || '').trim()
    })
  }, [pendingShipmentRows])

  const runMarketingAction = async (action: MarketingActionType, shippedOrderRef = '') => {
    if (!token) return
    const orderNo = String(shippedOrderRef || '').trim() || manualShippedOrderNo.trim() || selectedPendingOrderNo.trim()
    if (action === 'send_shipped' && !orderNo) {
      setMarketingError('Kargo maili icin siparis secin veya siparis numarasi girin.')
      return
    }

    setMarketingBusyAction(action)
    setMarketingError('')
    setMarketingMessage('')
    try {
      const payload: {
        action: MarketingActionType
        order_no?: string
        pending_days?: PendingShipmentDaysOption
        pending_limit?: number
      } = {
        action,
        pending_days: pendingShipmentDays,
        pending_limit: 80,
      }
      if (action === 'send_shipped') payload.order_no = orderNo

      const response = await apiRequest<MarketingEmailActionResponse>('/api/admin/marketing-emails', {
        method: 'POST',
        token,
        body: payload,
      })

      if (response?.status) setMarketingStatus(response.status)
      if (action === 'send_shipped') {
        const shippedOrderNo = String(response?.shipped?.order_no || orderNo || '-')
        const targetEmail = String(response?.shipped?.email || '').trim()
        setMarketingMessage(
          targetEmail
            ? `Kargo maili gonderildi: ${shippedOrderNo} (${targetEmail})`
            : `Kargo maili gonderildi: ${shippedOrderNo}`
        )
        setManualShippedOrderNo('')
        setSelectedPendingOrderNo('')
      } else {
        const abandonedSent = asNumber(response?.result?.abandoned_cart?.sent, 0)
        const introSent = asNumber(response?.result?.product_intro?.sent, 0)
        if (action === 'send_abandoned') {
          setMarketingMessage(`Sepet mail akisi calisti. Gonderilen: ${abandonedSent}`)
        } else if (action === 'send_product_intro') {
          setMarketingMessage(`Urun tanitim akisi calisti. Gonderilen: ${introSent}`)
        } else {
          setMarketingMessage(`Tum akislari calistirdiniz. Sepet: ${abandonedSent}, Tanitim: ${introSent}`)
        }
      }
      await loadMarketingStatus(pendingShipmentDays)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mail aksiyonu calistirilamadi'
      setMarketingError(msg)
    } finally {
      setMarketingBusyAction('')
    }
  }

  const dailyRevenue = asNumber(metrics.daily_revenue, 0)
  const totalOrders = asNumber(metrics.total_orders ?? metrics.new_orders, 0)
  const conversionRate = asNumber(metrics.conversion_rate, 0)
  const averageBasket = asNumber(metrics.average_order_value, 0)

  const kanbanStages = useMemo(
    () => [
      {
        key: 'new',
        title: 'Yeni Siparis',
        color: '#3b82f6',
        count: asNumber(orderStatuses.pending, 0),
      },
      {
        key: 'production',
        title: 'Uretimde',
        color: '#f59e0b',
        count: asNumber(orderStatuses.processing, 0),
      },
      {
        key: 'quality',
        title: 'Kalite Kontrol',
        color: '#8b5cf6',
        count: asNumber(orderStatuses.shipment, 0),
      },
      {
        key: 'ready',
        title: 'Kargoya Hazir',
        color: '#22c55e',
        count: asNumber(orderStatuses.shipped, 0),
      },
    ],
    [orderStatuses]
  )

  const maxTopClickCount = useMemo(
    () => Math.max(...topProductClicks.map((row) => asNumber(row.count, 0)), 1),
    [topProductClicks]
  )

  const openMetricModal = (title: string, value: string | number, description?: string) => {
    setDetailModal({
      title,
      description,
      rows: [{ label: 'Deger', value }],
    })
  }

  const openKanbanModal = (stageTitle: string, count: number) => {
    setDetailModal({
      title: `${stageTitle} Detayi`,
      description: 'Bu asamadaki siparis sayisi',
      rows: [{ label: stageTitle, value: count }],
    })
  }

  const openProductClickModal = (row: { product_id?: string | null; product_name?: string | null; count?: number }) => {
    const code = String(row.product_id || '-')
    const name = String(row.product_name || '').trim() || '-'
    setDetailModal({
      title: 'Urun Tiklama Detayi',
      rows: [
        { label: 'Urun Kodu', value: code },
        { label: 'Urun Adi', value: name },
        { label: 'Tiklama', value: asNumber(row.count, 0) },
      ],
    })
  }

  if (loading) {
    return <p style={{ color: '#94a3b8' }}>Dashboard yukleniyor...</p>
  }

  if (error) {
    return <div style={errorStyle}>{error}</div>
  }

  return (
    <div>
      <div style={headerRowStyle}>
        <h2 style={pageTitleStyle}>Dashboard</h2>
        <button type="button" onClick={() => void loadDashboard()} style={refreshButtonStyle}>
          Yenile
        </button>
      </div>

      <div style={metricsGridStyle}>
        <button
          type="button"
          style={metricButtonStyle}
          onClick={() => openMetricModal('Gunluk Ciro', formatCurrency(dailyRevenue), 'Bugune ait odeme alinan ciro')}
        >
          <span style={metricLabelStyle}>Gunluk Ciro</span>
          <span style={metricValueStyle}>{formatCurrency(dailyRevenue)}</span>
        </button>
        <button
          type="button"
          style={metricButtonStyle}
          onClick={() => openMetricModal('Toplam Siparis', totalOrders, 'Secili donemde olusan siparis adedi')}
        >
          <span style={metricLabelStyle}>Toplam Siparis</span>
          <span style={metricValueStyle}>{totalOrders}</span>
        </button>
        <button
          type="button"
          style={metricButtonStyle}
          onClick={() => openMetricModal('Donusum Orani', `%${conversionRate.toFixed(2)}`, 'Odeme alinan siparis / toplam siparis')}
        >
          <span style={metricLabelStyle}>Donusum Orani</span>
          <span style={metricValueStyle}>%{conversionRate.toFixed(2)}</span>
        </button>
        <button
          type="button"
          style={metricButtonStyle}
          onClick={() => openMetricModal('Ortalama Sepet Tutari', formatCurrency(averageBasket), 'Odeme alinan siparislerin ortalamasi')}
        >
          <span style={metricLabelStyle}>Ortalama Sepet Tutari</span>
          <span style={metricValueStyle}>{formatCurrency(averageBasket)}</span>
        </button>
      </div>

      <div style={panelStyle}>
        <div style={mailPanelHeaderStyle}>
          <h3 style={panelTitleStyle}>Mail Otomasyon Merkezi</h3>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            style={refreshMiniButtonStyle}
            disabled={marketingBusyAction !== ''}
          >
            Durumu yenile
          </button>
        </div>

        <div style={mailStatusGridStyle}>
          <div style={mailStatusCardStyle}>
            <span style={mailStatusLabelStyle}>Mail Saglayici</span>
            <strong style={mailStatusValueStyle}>
              {emailEnv?.resend_configured ? 'Hazir' : 'Eksik'}
            </strong>
          </div>
          <div style={mailStatusCardStyle}>
            <span style={mailStatusLabelStyle}>Cron Secret</span>
            <strong style={mailStatusValueStyle}>
              {emailEnv?.cron_secret_configured ? 'Hazir' : 'Eksik'}
            </strong>
          </div>
          <div style={mailStatusCardStyle}>
            <span style={mailStatusLabelStyle}>Sepet Maili (7 gun)</span>
            <strong style={mailStatusValueStyle}>{asNumber(emailSummary?.last_7_days?.abandoned_cart, 0)}</strong>
          </div>
          <div style={mailStatusCardStyle}>
            <span style={mailStatusLabelStyle}>Tanitim Maili (7 gun)</span>
            <strong style={mailStatusValueStyle}>{asNumber(emailSummary?.last_7_days?.product_intro, 0)}</strong>
          </div>
          <div style={mailStatusCardStyle}>
            <span style={mailStatusLabelStyle}>Kargo Manual (7 gun)</span>
            <strong style={mailStatusValueStyle}>{asNumber(emailSummary?.last_7_days?.shipped_manual, 0)}</strong>
          </div>
        </div>

        <div style={mailActionRowStyle}>
          <button
            type="button"
            onClick={() => void runMarketingAction('send_abandoned')}
            style={mailPrimaryButtonStyle}
            disabled={marketingBusyAction !== '' || !emailEnv?.resend_configured}
          >
            {marketingBusyAction === 'send_abandoned' ? 'Calisiyor...' : 'Sepette unuttun mailini gonder'}
          </button>
          <button
            type="button"
            onClick={() => void runMarketingAction('send_product_intro')}
            style={mailSecondaryButtonStyle}
            disabled={marketingBusyAction !== '' || !emailEnv?.resend_configured}
          >
            {marketingBusyAction === 'send_product_intro' ? 'Calisiyor...' : 'Urun tanitim maillerini gonder'}
          </button>
          <button
            type="button"
            onClick={() => void runMarketingAction('send_all')}
            style={mailSecondaryButtonStyle}
            disabled={marketingBusyAction !== '' || !emailEnv?.resend_configured}
          >
            {marketingBusyAction === 'send_all' ? 'Calisiyor...' : 'Tum pazarlama maillerini calistir'}
          </button>
        </div>

        <div style={mailActionRowStyle}>
          <select
            value={pendingShipmentDays}
            onChange={(event) => {
              const nextDays = normalizePendingShipmentDaysOption(event.target.value)
              setPendingShipmentDays(nextDays)
              setMarketingError('')
              setMarketingMessage('')
              void loadMarketingStatus(nextDays)
            }}
            style={mailSelectStyle}
          >
            {pendingShipmentDayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={selectedPendingOrderNo}
            onChange={(event) => setSelectedPendingOrderNo(event.target.value)}
            style={mailSelectStyle}
            disabled={!pendingShipmentRows.length}
          >
            {!pendingShipmentRows.length ? (
              <option value="">Odeme alinmis, kargolanmamis siparis yok</option>
            ) : (
              pendingShipmentRows.map((row) => {
                const orderNo = String(row?.order_no || '').trim()
                const orderId = String(row?.order_id || '').trim()
                const customer = String(row?.customer_name || '-').trim() || '-'
                const dateValue = formatDate(row?.paid_at || row?.created_at)
                const statusValue = workflowStatusLabel(row?.status)
                return (
                  <option key={orderId || orderNo || `${customer}-${dateValue}`} value={orderNo}>
                    {`${orderNo} | ${customer} | ${dateValue} | ${statusValue}`}
                  </option>
                )
              })
            )}
          </select>
          <button
            type="button"
            onClick={() => void runMarketingAction('send_shipped', selectedPendingOrderNo)}
            style={mailPrimaryButtonStyle}
            disabled={marketingBusyAction !== '' || !emailEnv?.resend_configured || !selectedPendingOrderNo}
          >
            {marketingBusyAction === 'send_shipped' ? 'Gonderiliyor...' : 'Secilen siparise kargo maili gonder'}
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '8px', marginBottom: 0 }}>
          Odemesi alinmis ve henuz kargolanmamis siparis: {pendingShipmentTotal}
        </p>

        <div style={mailActionRowStyle}>
          <input
            value={manualShippedOrderNo}
            onChange={(event) => setManualShippedOrderNo(event.target.value)}
            placeholder="Manuel siparis no (or: BLN-12345)"
            style={mailInputStyle}
          />
          <button
            type="button"
            onClick={() => void runMarketingAction('send_shipped', manualShippedOrderNo)}
            style={mailPrimaryButtonStyle}
            disabled={marketingBusyAction !== '' || !emailEnv?.resend_configured}
          >
            {marketingBusyAction === 'send_shipped' ? 'Gonderiliyor...' : 'Manuel siparis no ile gonder'}
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '10px', marginBottom: 0 }}>
          Son sepette unuttun maili: {formatDate(emailSummary?.latest?.abandoned_cart)} | Son urun tanitim maili: {formatDate(emailSummary?.latest?.product_intro)}
        </p>
        {marketingMessage && <div style={okStyle}>{marketingMessage}</div>}
        {marketingError && <div style={errorStyle}>{marketingError}</div>}
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Uretim Hunisi (Kanban)</h3>
        <div style={kanbanGridStyle}>
          {kanbanStages.map((stage) => (
            <button
              key={stage.key}
              type="button"
              onClick={() => openKanbanModal(stage.title, stage.count)}
              style={{ ...kanbanCardButtonStyle, borderColor: stage.color }}
            >
              <span style={{ ...kanbanTitleStyle, color: stage.color }}>{stage.title}</span>
              <span style={kanbanCountStyle}>{stage.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Urun Tiklama Grafigi</h3>
        {!topProductClicks.length ? (
          <p style={{ color: '#94a3b8', margin: 0 }}>Urun tiklama verisi henuz yok.</p>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {topProductClicks.map((row, idx) => {
              const clickCount = asNumber(row.count, 0)
              const width = Math.max(6, Math.round((clickCount / maxTopClickCount) * 100))
              const productCode = String(row.product_id || '-')
              const productName = String(row.product_name || '').trim() || '-'
              return (
                <button
                  key={`${productCode}-${idx}`}
                  type="button"
                  onClick={() => openProductClickModal(row)}
                  style={chartRowButtonStyle}
                >
                  <span style={chartLabelStyle}>{productCode}</span>
                  <span style={chartBarTrackStyle}>
                    <span style={{ ...chartBarFillStyle, width: `${width}%` }} />
                  </span>
                  <span style={chartValueStyle}>{clickCount}</span>
                  <span style={chartNameStyle}>{productName}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Kacan Musteriler</h3>
        {!abandonedRows.length ? (
          <p style={{ color: '#94a3b8', margin: 0 }}>Su an sepet terk kaydi bulunmuyor.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Musteri</th>
                  <th style={thStyle}>Urun</th>
                  <th style={thStyle}>Tiklama</th>
                  <th style={thStyle}>Son Hareket</th>
                  <th style={thStyle}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {abandonedRows.map((row, idx) => {
                  const customerLabel = String(row.customer_name || row.customer_email || row.session_id || '-')
                  const productLabel = [row.product_code, row.product_name].filter(Boolean).join(' - ') || '-'
                  return (
                    <tr key={`${row.session_id || 'ab'}-${idx}`}>
                      <td style={tdStyle}>{customerLabel}</td>
                      <td style={tdStyle}>{productLabel}</td>
                      <td style={tdStyle}>{asNumber(row.count, 0)}</td>
                      <td style={tdStyle}>{formatDate(row.last_at)}</td>
                      <td style={tdStyle}>
                        {row.customer_email ? (
                          <button
                            type="button"
                            style={mailButtonStyle}
                            disabled={marketingBusyAction !== '' || !emailEnv?.resend_configured}
                            onClick={() => void runMarketingAction('send_abandoned')}
                          >
                            Tek tik sepet maili
                          </button>
                        ) : (
                          <button type="button" style={disabledButtonStyle} disabled>
                            E-posta yok
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailModal && (
        <div style={modalOverlayStyle} onClick={() => setDetailModal(null)}>
          <div style={modalContentStyle} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h4 style={modalTitleStyle}>{detailModal.title}</h4>
              <button type="button" style={modalCloseStyle} onClick={() => setDetailModal(null)}>
                ×
              </button>
            </div>
            {detailModal.description && <p style={modalDescStyle}>{detailModal.description}</p>}
            <div style={{ display: 'grid', gap: '8px' }}>
              {detailModal.rows.map((row, idx) => (
                <div key={`${row.label}-${idx}`} style={modalRowStyle}>
                  <span style={modalRowLabelStyle}>{row.label}</span>
                  <strong style={modalRowValueStyle}>{row.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const pageTitleStyle: CSSProperties = {
  fontSize: '20px',
  color: '#fff',
  margin: 0,
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
}

const refreshButtonStyle: CSSProperties = {
  background: '#334155',
  color: '#e2e8f0',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
}

const metricsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: '10px',
  marginBottom: '16px',
}

const metricCardStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '14px',
}

const metricButtonStyle: CSSProperties = {
  ...metricCardStyle,
  background: 'transparent',
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  textAlign: 'left',
  cursor: 'pointer',
}

const metricLabelStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: '12px',
  marginBottom: '6px',
}

const metricValueStyle: CSSProperties = {
  color: '#f8fafc',
  fontWeight: 700,
  fontSize: '24px',
}

const panelStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '16px',
  marginBottom: '16px',
}

const panelTitleStyle: CSSProperties = {
  color: '#fff',
  fontSize: '16px',
  marginTop: 0,
  marginBottom: '12px',
}

const kanbanGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '10px',
}

const kanbanCardStyle: CSSProperties = {
  background: '#0f172a',
  borderRadius: '8px',
  padding: '12px',
}

const kanbanCardButtonStyle: CSSProperties = {
  ...kanbanCardStyle,
  background: 'transparent',
  border: '1px solid #334155',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  textAlign: 'left',
  cursor: 'pointer',
}

const kanbanTitleStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  marginBottom: '8px',
}

const kanbanCountStyle: CSSProperties = {
  color: '#f8fafc',
  fontSize: '26px',
  fontWeight: 700,
}

const chartRowButtonStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr 60px minmax(120px, 1fr)',
  alignItems: 'center',
  gap: '10px',
  border: '1px solid #334155',
  borderRadius: '8px',
  background: '#0f172a',
  padding: '8px 10px',
  cursor: 'pointer',
  textAlign: 'left',
}

const chartLabelStyle: CSSProperties = {
  display: 'block',
  color: '#cbd5e1',
  fontSize: '12px',
  fontWeight: 600,
}

const chartBarTrackStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '14px',
  borderRadius: '999px',
  background: '#1f2937',
  overflow: 'hidden',
}

const chartBarFillStyle: CSSProperties = {
  display: 'block',
  height: '100%',
  borderRadius: '999px',
  background: 'linear-gradient(90deg, #2563eb, #22d3ee)',
}

const chartValueStyle: CSSProperties = {
  display: 'block',
  color: '#f8fafc',
  fontSize: '12px',
  fontWeight: 700,
  textAlign: 'right',
}

const chartNameStyle: CSSProperties = {
  display: 'block',
  color: '#94a3b8',
  fontSize: '11px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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

const mailButtonStyle: CSSProperties = {
  display: 'inline-block',
  textDecoration: 'none',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '12px',
  cursor: 'pointer',
}

const mailPanelHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
}

const refreshMiniButtonStyle: CSSProperties = {
  background: '#334155',
  color: '#e2e8f0',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '11px',
  cursor: 'pointer',
}

const mailStatusGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '8px',
  marginBottom: '10px',
}

const mailStatusCardStyle: CSSProperties = {
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '10px',
  background: '#0f172a',
  display: 'grid',
  gap: '5px',
}

const mailStatusLabelStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
}

const mailStatusValueStyle: CSSProperties = {
  color: '#f8fafc',
  fontSize: '16px',
}

const mailActionRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '8px',
}

const mailPrimaryButtonStyle: CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
}

const mailSecondaryButtonStyle: CSSProperties = {
  background: '#334155',
  color: '#e2e8f0',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
}

const mailInputStyle: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '12px',
  minWidth: '280px',
  flex: '1 1 280px',
}

const mailSelectStyle: CSSProperties = {
  ...mailInputStyle,
  minWidth: '260px',
  flex: '1 1 320px',
}

const disabledButtonStyle: CSSProperties = {
  background: '#475569',
  color: '#cbd5e1',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '12px',
  cursor: 'not-allowed',
}

const errorStyle: CSSProperties = {
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid #ef4444',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fca5a5',
  fontSize: '12px',
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

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalContentStyle: CSSProperties = {
  width: 'min(560px, 92vw)',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '14px',
}

const modalHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
}

const modalTitleStyle: CSSProperties = {
  margin: 0,
  color: '#fff',
  fontSize: '16px',
}

const modalCloseStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: '20px',
  cursor: 'pointer',
  lineHeight: 1,
}

const modalDescStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: '10px',
  color: '#94a3b8',
  fontSize: '12px',
}

const modalRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '8px',
  border: '1px solid #1f2937',
  borderRadius: '6px',
}

const modalRowLabelStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: '12px',
}

const modalRowValueStyle: CSSProperties = {
  color: '#f8fafc',
  fontSize: '12px',
}

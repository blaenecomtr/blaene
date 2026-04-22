import { type CSSProperties, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'
import { getSiteSetting } from '../lib/siteSettings'
import { type SlipSettings, DEFAULT_SLIP } from './SiteSettings'

interface OrderItem {
  id: string
  product_code?: string
  product_name?: string
  unit_price?: number
  quantity?: number
  line_total?: number
}

interface Order {
  id: string
  order_no: string
  customer_name: string
  email: string
  phone?: string
  address?: string
  city?: string
  total: number
  payment_status: string
  payment_provider?: string | null
  payment_method?: string | null
  status: string
  created_at: string
  tracking_code?: string | null
  shipping_provider?: string | null
  items?: OrderItem[]
}

interface ShippingProviderInfo {
  provider: string
  configured: boolean
}

interface ReturnRequest {
  id: string
  order_id?: string
  order_no?: string
  customer_name?: string | null
  customer_email?: string | null
  reason?: string | null
  details?: string | null
  status?: string | null
  refund_amount?: number | null
  updated_at?: string | null
  created_at?: string | null
  refunds?: Array<{
    id: string
    amount?: number
    status?: string
    payment_provider?: string | null
    created_at?: string
  }>
}

interface TransferTicket {
  id: string
  subject?: string | null
  status?: string | null
  category?: string | null
  customer_name?: string | null
  customer_email?: string | null
  created_at?: string | null
  updated_at?: string | null
  metadata?: {
    order_no?: string | null
    transfer_amount?: string | null
    transfer_date?: string | null
    transfer_bank?: string | null
    transfer_note?: string | null
  } | null
}

type OrdersTab = 'all' | 'returns' | 'transfers'

const FALLBACK_SHIPPING_PROVIDERS: ShippingProviderInfo[] = [
  { provider: 'yurtici', configured: true },
  { provider: 'mng', configured: true },
  { provider: 'aras', configured: true },
]

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

function normalizePaymentMethod(order: Order) {
  const method = String(order.payment_method || '').toLowerCase().trim()
  if (method === 'bank_transfer' || method === 'havale' || method === 'eft') return 'bank_transfer'
  if (method === 'card' || method === 'credit_card') return 'card'

  const provider = String(order.payment_provider || '').toLowerCase().trim()
  if (provider === 'bank_transfer' || provider === 'havale' || provider === 'eft') return 'bank_transfer'
  if (provider === 'manual') return 'bank_transfer'
  if (provider === 'paytr' || provider === 'iyzico' || provider === 'mock') return 'card'
  return method || provider || 'unknown'
}

function paymentMethodLabel(order: Order) {
  const method = normalizePaymentMethod(order)
  if (method === 'bank_transfer') return 'Havale / EFT'
  if (method === 'card') return 'Kredi Karti'
  return 'Belirtilmedi'
}

function extractOrderNoFromTransfer(ticket: TransferTicket) {
  const fromMeta = String(ticket?.metadata?.order_no || '').trim()
  if (fromMeta) return fromMeta
  const subject = String(ticket?.subject || '')
  const match = subject.match(/siparis\s*#\s*([a-z0-9\-_/]+)/i)
  return match && match[1] ? String(match[1]).trim() : '-'
}

function isTransferTicket(ticket: TransferTicket) {
  const category = String(ticket?.category || '').toLowerCase().trim()
  const subject = String(ticket?.subject || '').toLowerCase()
  return category === 'transfer' || category === 'havale' || subject.includes('havale bildirimi')
}

function workflowLabel(value: string) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'processing') return 'Onaylandi'
  if (normalized === 'shipped') return 'Kargoda'
  if (normalized === 'delivered') return 'Teslim'
  if (normalized === 'cancelled') return 'Reddedildi'
  return 'Beklemede'
}

function shippingProviderLabel(value: string) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'yurtici') return 'Yurtici'
  if (normalized === 'mng') return 'MNG'
  if (normalized === 'aras') return 'Aras'
  if (!normalized) return 'manual'
  return normalized
}

function providerPillStyle(configured: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    border: `1px solid ${configured ? '#10b981' : '#475569'}`,
    background: configured ? 'rgba(16,185,129,0.12)' : 'rgba(71,85,105,0.16)',
    color: configured ? '#6ee7b7' : '#cbd5e1',
    borderRadius: '999px',
    padding: '3px 10px',
    fontSize: '11px',
    fontWeight: 600,
  }
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
    open: { bg: 'rgba(59,130,246,0.18)', border: '#3b82f6', color: '#93c5fd' },
    closed: { bg: 'rgba(16,185,129,0.18)', border: '#10b981', color: '#6ee7b7' },
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

import QRCode from 'qrcode'

async function fetchLogoDataUrl(): Promise<string> {
  try {
    const origin = window.location.origin
    const res = await fetch(`${origin}/logo/blaene-logo.png`)
    if (!res.ok) return ''
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

function buildSlipHtml(order: Order, logoDataUrl: string, qrDataUrl: string, s: SlipSettings) {
  const items = Array.isArray(order.items) ? order.items : []
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td>${item.product_code || '-'}</td>
        <td>${item.product_name || '-'}</td>
        <td>${Number(item.quantity || 0)}</td>
        <td>${formatPrice(Number(item.line_total || 0))}</td>
      </tr>
    `
    )
    .join('')

  const logoBlock = s.show_logo
    ? (logoDataUrl
        ? `<img src="${logoDataUrl}" alt="Blaene" style="height:${s.logo_height}px;width:auto;display:block;" />`
        : `<span style="font-size:24px;font-weight:700;font-family:Arial,sans-serif;display:block;">BLAENE</span>`)
    : ''

  const siteUrlHtml = s.show_site_url
    ? `<span style="font-size:11px;font-family:Arial,sans-serif;color:#444;display:block;width:100%;text-align:center;">${s.site_url || 'www.blaene.com.tr'}</span>`
    : ''

  const qrHtml = (s.show_qr && qrDataUrl)
    ? `<img src="${qrDataUrl}" alt="QR" style="width:${s.qr_size}px;height:${s.qr_size}px;display:block;" />`
    : ''

  const row = (show: boolean, label: string, value: string) =>
    show ? `<p><strong>${label}:</strong> ${value || '-'}</p>` : ''

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Kargo Fisi - ${order.order_no}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
          .header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; border-bottom: 2px solid #111; padding-bottom: 12px; }
          .logo-block { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
          .meta { margin-bottom: 16px; }
          .meta p { margin: 4px 0; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f3f4f6; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-block">
            ${logoBlock}
            ${siteUrlHtml}
          </div>
          ${qrHtml}
        </div>
        <div class="meta">
          ${row(s.show_order_no, 'Siparis', order.order_no)}
          ${row(s.show_customer_name, 'Musteri', order.customer_name || '')}
          ${row(s.show_email, 'E-posta', order.email || '')}
          ${row(s.show_phone, 'Telefon', order.phone || '')}
          ${row(s.show_address, 'Adres', order.address || '')}
          ${row(s.show_city, 'Sehir', order.city || '')}
          ${row(s.show_shipping_provider, 'Kargo', order.shipping_provider || 'manuel')}
          ${row(s.show_tracking_code, 'Takip', order.tracking_code || '')}
          ${row(s.show_total, 'Toplam', formatPrice(order.total || 0))}
          ${row(s.show_date, 'Tarih', formatDate(order.created_at))}
        </div>
        ${s.show_items_table ? `
        <table>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Urun</th>
              <th>Adet</th>
              <th>Tutar</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="4">Satir bulunamadi</td></tr>'}
          </tbody>
        </table>` : ''}
      </body>
    </html>
  `
}

export default function Orders() {
  const token = localStorage.getItem('admin_token')
  const [activeTab, setActiveTab] = useState<OrdersTab>('all')
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [returnsLoading, setReturnsLoading] = useState(false)
  const [returns, setReturns] = useState<ReturnRequest[]>([])
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferTickets, setTransferTickets] = useState<TransferTicket[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('all')
  const [workflowStatus, setWorkflowStatus] = useState('all')
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({})
  const [providerDrafts, setProviderDrafts] = useState<Record<string, string>>({})
  const [shippingProviders, setShippingProviders] = useState<ShippingProviderInfo[]>(FALLBACK_SHIPPING_PROVIDERS)

  const getSelectedProvider = (orderId: string) => {
    return String(providerDrafts[orderId] || '').toLowerCase().trim()
  }

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
      params.set('include_items', 'true')
      const [ordersData, shippingData] = await Promise.all([
        apiRequest<Order[]>(`/api/admin/orders?${params.toString()}`, { token }),
        apiRequest<{ providers?: ShippingProviderInfo[] }>('/api/admin/shipping?page_size=1', { token }).catch(() => null),
      ])
      const nextOrders = Array.isArray(ordersData) ? ordersData : []
      const nextProviders = Array.isArray(shippingData?.providers) && shippingData.providers.length
        ? shippingData.providers
        : FALLBACK_SHIPPING_PROVIDERS
      const firstConfiguredProvider =
        nextProviders.find((item) => item.configured)?.provider || FALLBACK_SHIPPING_PROVIDERS[0].provider

      setShippingProviders(nextProviders)
      setOrders(nextOrders)
      setTrackingDrafts((prev) => {
        const next: Record<string, string> = {}
        nextOrders.forEach((order) => {
          next[order.id] = prev[order.id] ?? String(order.tracking_code || '')
        })
        return next
      })
      setProviderDrafts((prev) => {
        const next: Record<string, string> = {}
        nextOrders.forEach((order) => {
          const provider = String(order.shipping_provider || '').toLowerCase().trim()
          next[order.id] = prev[order.id] || provider || firstConfiguredProvider
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

  const loadReturnRequests = async () => {
    if (!token) return
    setReturnsLoading(true)
    setError('')
    try {
      const data = await apiRequest<ReturnRequest[]>('/api/admin/returns?page_size=300&include_refunds=true', { token })
      setReturns(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Iade talepleri yuklenemedi'
      setError(msg)
    } finally {
      setReturnsLoading(false)
    }
  }

  const loadTransferTickets = async () => {
    if (!token) return
    setTransferLoading(true)
    setError('')
    try {
      const data = await apiRequest<TransferTicket[]>('/api/admin/support-tickets?page_size=500', { token })
      const nextTickets = (Array.isArray(data) ? data : [])
        .filter(isTransferTicket)
        .sort((a, b) => {
          const aTs = new Date(String(a.created_at || 0)).getTime()
          const bTs = new Date(String(b.created_at || 0)).getTime()
          return bTs - aTs
        })
      setTransferTickets(nextTickets)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Havale bildirimleri yuklenemedi'
      setError(msg)
    } finally {
      setTransferLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [paymentStatus, workflowStatus])

  useEffect(() => {
    if (activeTab === 'returns' && !returns.length && !returnsLoading) {
      void loadReturnRequests()
    }
    if (activeTab === 'transfers' && !transferTickets.length && !transferLoading) {
      void loadTransferTickets()
    }
  }, [activeTab, returns.length, returnsLoading, transferTickets.length, transferLoading])

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

  const approveBankTransfer = async (order: Order) => {
    if (!token) return
    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      setMessage(`${order.order_no}: havale odemesi zaten onayli`)
      return
    }
    const confirmApprove = window.confirm(`${order.order_no} icin havale odemesini onaylamak istiyor musunuz?`)
    if (!confirmApprove) return

    await runAction(order.id, 'bank_transfer_approve', async () => {
      await apiRequest('/api/admin/order-status', {
        method: 'POST',
        token,
        body: {
          order_ids: [order.id],
          status: 'paid',
          workflow_status: 'processing',
        },
      })
      setMessage(`${order.order_no}: havale odemesi onaylandi`)
    })
  }

  const rejectOrder = async (order: Order) => {
    const confirmed = window.confirm(`${order.order_no} siparisini iptal etmek istediginize emin misiniz?`)
    if (!confirmed) return
    await updateOrderWorkflow(order, 'cancelled', 'siparis reddedildi')
  }

  const saveTrackingCode = async (order: Order) => {
    if (!token) return
    const provider = getSelectedProvider(order.id)
    await runAction(order.id, 'tracking', async () => {
      await apiRequest('/api/admin/shipping', {
        method: 'PUT',
        token,
        body: {
          order_id: order.id,
          tracking_code: trackingDrafts[order.id] || '',
          provider: provider || undefined,
        },
      })
      setMessage(
        `${order.order_no}: takip no kaydedildi` + (provider ? ` (${shippingProviderLabel(provider)})` : '')
      )
    })
  }

  const markAsShipped = async (order: Order) => {
    if (!token) return
    const provider = getSelectedProvider(order.id)
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
          provider: provider || undefined,
        },
      })
      setMessage(
        `${order.order_no}: kargoya verildi` + (provider ? ` (${shippingProviderLabel(provider)})` : '')
      )
    })
  }

  const createShipment = async (order: Order) => {
    if (!token) return
    const provider = String(providerDrafts[order.id] || '').toLowerCase().trim()
    if (!provider) {
      setError(`${order.order_no}: once kargo firmasi secin`)
      return
    }

    const selectedProvider = shippingProviders.find((item) => item.provider === provider)
    if (selectedProvider && !selectedProvider.configured) {
      setError(`${order.order_no}: secilen kargo firmasi henuz entegre edilmemis`)
      return
    }

    await runAction(order.id, 'shipment', async () => {
      const data = await apiRequest<{ tracking_code?: string; provider?: string }>('/api/admin/shipping', {
        method: 'POST',
        token,
        body: {
          order_id: order.id,
          provider,
        },
      })

      const trackingCode = String(data?.tracking_code || '').trim()
      if (trackingCode) {
        setTrackingDrafts((prev) => ({ ...prev, [order.id]: trackingCode }))
      }
      setMessage(
        `${order.order_no}: ${shippingProviderLabel(provider)} ile kargo olusturuldu` +
          (trackingCode ? ` (${trackingCode})` : '')
      )
    })
  }

  const printShippingSlip = async (order: Order) => {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) {
      setError('Tarayici pop-up engelledi. Lutfen izin verin.')
      return
    }
    const s = await getSiteSetting<SlipSettings>(token, 'slip_settings', DEFAULT_SLIP)
    const slipCfg: SlipSettings = { ...DEFAULT_SLIP, ...s }

    const items = Array.isArray(order.items) ? order.items : []
    const itemLines = items
      .map((it) => `- ${it.product_name || it.product_code || '?'} x${it.quantity || 1}`)
      .join('\n')
    const qrParts = [
      `Ad Soyad: ${order.customer_name || '-'}`,
      `Telefon: ${order.phone || '-'}`,
      `Urunler:`,
      itemLines || '- (urun yok)',
      `Toplam: ${order.total} TL`,
    ]
    const qrData = qrParts.join('\n')

    const [logoDataUrl, qrDataUrl] = await Promise.all([
      slipCfg.show_logo ? fetchLogoDataUrl() : Promise.resolve(''),
      slipCfg.show_qr
        ? QRCode.toDataURL(qrData, { width: slipCfg.qr_size * 2, margin: 1, errorCorrectionLevel: 'M' }).catch(() => '')
        : Promise.resolve(''),
    ])
    win.document.open()
    win.document.write(buildSlipHtml(order, logoDataUrl, qrDataUrl, slipCfg))
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  const updateReturnStatus = async (item: ReturnRequest, status: string, successMessage: string) => {
    if (!token) return
    const key = `return-${item.id}`
    setActionLoading((prev) => ({ ...prev, [key]: status }))
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/returns', {
        method: 'PUT',
        token,
        body: {
          id: item.id,
          status,
          review_note: successMessage,
        },
      })
      setMessage(`${item.order_no || item.id.slice(0, 8)}: ${successMessage}`)
      await loadReturnRequests()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Iade guncellenemedi'
      setError(msg)
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const createRefundForReturn = async (item: ReturnRequest) => {
    if (!token) return
    if (!item.order_id) {
      setError('Iade kaydi icin order_id bulunamadi')
      return
    }
    const amount = Number(item.refund_amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(`${item.order_no || item.id.slice(0, 8)}: once iade tutari belirleyin`)
      return
    }
    const key = `refund-${item.id}`
    setActionLoading((prev) => ({ ...prev, [key]: 'refund' }))
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/refunds', {
        method: 'POST',
        token,
        body: {
          return_request_id: item.id,
          order_id: item.order_id,
          amount,
          reason: item.reason || 'Iade talebi',
        },
      })
      setMessage(`${item.order_no || item.id.slice(0, 8)}: refund islemi kaydedildi`)
      await loadReturnRequests()
      await loadOrders()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Refund basarisiz'
      setError(msg)
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const updateTransferStatus = async (ticket: TransferTicket, status: string, successMessage: string) => {
    if (!token) return
    const key = `transfer-${ticket.id}`
    setActionLoading((prev) => ({ ...prev, [key]: status }))
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/support-tickets', {
        method: 'PUT',
        token,
        body: {
          id: ticket.id,
          status,
        },
      })
      setMessage(`${extractOrderNoFromTransfer(ticket)}: ${successMessage}`)
      await loadTransferTickets()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Havale bildirimi guncellenemedi'
      setError(msg)
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Siparisler</h2>
      <div style={panelStyle}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            style={activeTab === 'all' ? activeTabButton : tabButton}
          >
            Tum Siparisler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('returns')}
            style={activeTab === 'returns' ? activeTabButton : tabButton}
          >
            Iade Talepleri
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transfers')}
            style={activeTab === 'transfers' ? activeTabButton : tabButton}
          >
            Havale Bildirimleri
          </button>
        </div>

        {message && <div style={okStyle}>{message}</div>}
        {error && <div style={errorStyle}>{error}</div>}

        {activeTab === 'all' ? (
          <>
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {shippingProviders.map((item) => (
                <span key={`provider-pill-${item.provider}`} style={providerPillStyle(item.configured)}>
                  {shippingProviderLabel(item.provider)}: {item.configured ? 'hazir' : 'pasif'}
                </span>
              ))}
            </div>

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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={statusBadgeStyle(order.payment_status)}>{paymentLabel(order.payment_status)}</span>
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{paymentMethodLabel(order)}</span>
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span style={statusBadgeStyle(order.status)}>{workflowLabel(order.status)}</span>
                          </td>
                          <td style={tdStyle}>
                            <select
                              value={providerDrafts[order.id] || ''}
                              onChange={(evt) => setProviderDrafts((prev) => ({ ...prev, [order.id]: evt.target.value }))}
                              style={{ ...inputStyle, width: '160px', marginBottom: '6px' }}
                            >
                              {shippingProviders.map((item) => (
                                <option
                                  key={item.provider}
                                  value={item.provider}
                                  disabled={!item.configured}
                                >
                                  {shippingProviderLabel(item.provider)}
                                  {item.configured ? '' : ' (pasif)'}
                                </option>
                              ))}
                            </select>
                            <input
                              value={trackingDrafts[order.id] || ''}
                              onChange={(evt) => setTrackingDrafts((prev) => ({ ...prev, [order.id]: evt.target.value }))}
                              placeholder="Takip no"
                              style={{ ...inputStyle, width: '160px' }}
                            />
                            <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '11px' }}>
                              {shippingProviderLabel(order.shipping_provider || providerDrafts[order.id] || 'manual')}
                            </div>
                          </td>
                          <td style={tdStyle}>{formatDate(order.created_at)}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' }}>
                              {normalizePaymentMethod(order) === 'bank_transfer' ? (
                                <button
                                  disabled={busy || String(order.payment_status || '').toLowerCase() === 'paid'}
                                  onClick={() => void approveBankTransfer(order)}
                                  style={approveButtonStyle}
                                >
                                  {actionLoading[order.id] === 'bank_transfer_approve'
                                    ? 'Isleniyor...'
                                    : String(order.payment_status || '').toLowerCase() === 'paid'
                                      ? 'Havale Onayli'
                                      : 'Havale Onayla'}
                                </button>
                              ) : normalizePaymentMethod(order) === 'card' ? (
                                <span style={statusBadgeStyle('paid')}>
                                  Kredi Karti ile Odendi
                                </span>
                              ) : (
                                <button
                                  disabled={busy}
                                  onClick={() => void updateOrderWorkflow(order, 'processing', 'siparis onaylandi')}
                                  style={approveButtonStyle}
                                >
                                  {actionLoading[order.id] === 'processing' ? 'Isleniyor...' : 'Onayla'}
                                </button>
                              )}
                              <button
                                disabled={busy}
                                onClick={() => void rejectOrder(order)}
                                style={rejectButtonStyle}
                              >
                                {actionLoading[order.id] === 'cancelled' ? 'Isleniyor...' : 'Reddet'}
                              </button>
                              <button disabled={busy} onClick={() => void createShipment(order)} style={shipButtonStyle}>
                                {actionLoading[order.id] === 'shipment' ? 'Olusturuluyor...' : 'Otomatik takip olustur'}
                              </button>
                              <button disabled={busy} onClick={() => void markAsShipped(order)} style={shipButtonStyle}>
                                {actionLoading[order.id] === 'shipped' ? 'Isleniyor...' : 'Manuel kargoya ver'}
                              </button>
                              <button disabled={busy} onClick={() => void saveTrackingCode(order)} style={buttonStyle}>
                                {actionLoading[order.id] === 'tracking' ? 'Kaydediliyor...' : 'Takip no kaydet'}
                              </button>
                              <button type="button" onClick={() => printShippingSlip(order)} style={printButtonStyle}>
                                Kargo fisi yazdir
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
          </>
        ) : activeTab === 'returns' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <p style={{ color: '#94a3b8', margin: 0 }}>
                Iade talepleri musterinin siparisinden olusturulur ve buradan yonetilir.
              </p>
              <button onClick={() => void loadReturnRequests()} style={buttonStyle}>
                Yenile
              </button>
            </div>
            {returnsLoading ? (
              <p style={{ color: '#94a3b8' }}>Iade talepleri yukleniyor...</p>
            ) : !returns.length ? (
              <p style={{ color: '#94a3b8' }}>Iade talebi bulunamadi.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Talep No</th>
                      <th style={thStyle}>Siparis</th>
                      <th style={thStyle}>Musteri</th>
                      <th style={thStyle}>Sebep</th>
                      <th style={thStyle}>Iade Tutari</th>
                      <th style={thStyle}>Durum</th>
                      <th style={thStyle}>Refundlar</th>
                      <th style={thStyle}>Guncel</th>
                      <th style={thStyle}>Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((item) => (
                      <tr key={item.id}>
                        <td style={tdStyle}>{item.id.slice(0, 8)}</td>
                        <td style={tdStyle}>{item.order_no || '-'}</td>
                        <td style={tdStyle}>
                          <div>{item.customer_name || '-'}</div>
                          <div style={{ color: '#94a3b8', fontSize: '11px' }}>{item.customer_email || '-'}</div>
                        </td>
                        <td style={tdStyle}>{item.reason || '-'}</td>
                        <td style={tdStyle}>{formatPrice(Number(item.refund_amount || 0))}</td>
                        <td style={tdStyle}>
                          <span style={statusBadgeStyle(String(item.status || 'pending'))}>{item.status || 'pending'}</span>
                        </td>
                        <td style={tdStyle}>
                          {!Array.isArray(item.refunds) || !item.refunds.length ? (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {item.refunds.slice(0, 3).map((refund) => (
                                <span key={refund.id} style={statusBadgeStyle(String(refund.status || 'pending'))}>
                                  {formatPrice(Number(refund.amount || 0))} / {refund.status || 'pending'}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>{item.updated_at ? formatDate(item.updated_at) : '-'}</td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                            <button
                              type="button"
                              onClick={() => void updateReturnStatus(item, 'approved', 'iade talebi onaylandi')}
                              style={approveButtonStyle}
                              disabled={Boolean(actionLoading[`return-${item.id}`] || actionLoading[`refund-${item.id}`])}
                            >
                              {actionLoading[`return-${item.id}`] === 'approved' ? 'Isleniyor...' : 'Onayla'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateReturnStatus(item, 'rejected', 'iade talebi reddedildi')}
                              style={rejectButtonStyle}
                              disabled={Boolean(actionLoading[`return-${item.id}`] || actionLoading[`refund-${item.id}`])}
                            >
                              {actionLoading[`return-${item.id}`] === 'rejected' ? 'Isleniyor...' : 'Reddet'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void createRefundForReturn(item)}
                              style={shipButtonStyle}
                              disabled={Boolean(actionLoading[`return-${item.id}`] || actionLoading[`refund-${item.id}`])}
                            >
                              {actionLoading[`refund-${item.id}`] ? 'Isleniyor...' : 'Refund Olustur'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <p style={{ color: '#94a3b8', margin: 0 }}>
                Musteriden gelen havale bildirimleri burada gorunur. Kontrol edilen talepleri kapatabilirsiniz.
              </p>
              <button onClick={() => void loadTransferTickets()} style={buttonStyle}>
                Yenile
              </button>
            </div>
            {transferLoading ? (
              <p style={{ color: '#94a3b8' }}>Havale bildirimleri yukleniyor...</p>
            ) : !transferTickets.length ? (
              <p style={{ color: '#94a3b8' }}>Havale bildirimi bulunamadi.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Talep No</th>
                      <th style={thStyle}>Siparis</th>
                      <th style={thStyle}>Musteri</th>
                      <th style={thStyle}>Tutar</th>
                      <th style={thStyle}>Gonderen Banka</th>
                      <th style={thStyle}>Transfer Tarihi</th>
                      <th style={thStyle}>Durum</th>
                      <th style={thStyle}>Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferTickets.map((item) => {
                      const key = `transfer-${item.id}`
                      const isClosed = String(item.status || '').toLowerCase() === 'closed'
                      const amountRaw = String(item.metadata?.transfer_amount || '').trim()
                      const parsedAmount = Number(amountRaw.replace(',', '.'))
                      const amountText =
                        Number.isFinite(parsedAmount) && parsedAmount > 0
                          ? formatPrice(parsedAmount)
                          : amountRaw || '-'
                      const transferDate = String(item.metadata?.transfer_date || '').trim()
                      const transferBank = String(item.metadata?.transfer_bank || '').trim() || '-'
                      return (
                        <tr key={item.id}>
                          <td style={tdStyle}>{item.id.slice(0, 8)}</td>
                          <td style={tdStyle}>{extractOrderNoFromTransfer(item)}</td>
                          <td style={tdStyle}>
                            <div>{item.customer_name || '-'}</div>
                            <div style={{ color: '#94a3b8', fontSize: '11px' }}>{item.customer_email || '-'}</div>
                          </td>
                          <td style={tdStyle}>{amountText}</td>
                          <td style={tdStyle}>{transferBank}</td>
                          <td style={tdStyle}>{transferDate || (item.created_at ? formatDate(item.created_at) : '-')}</td>
                          <td style={tdStyle}>
                            <span style={statusBadgeStyle(String(item.status || 'open'))}>{item.status || 'open'}</span>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                              {isClosed ? (
                                <button
                                  type="button"
                                  onClick={() => void updateTransferStatus(item, 'open', 'havale bildirimi tekrar acildi')}
                                  style={buttonStyle}
                                  disabled={Boolean(actionLoading[key])}
                                >
                                  {actionLoading[key] ? 'Isleniyor...' : 'Tekrar Ac'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const confirmed = window.confirm('Bu havale bildirimini kontrol edildi olarak onaylamak istiyor musunuz?')
                                    if (!confirmed) return
                                    void updateTransferStatus(item, 'closed', 'havale bildirimi onaylandi ve kapatildi')
                                  }}
                                  style={approveButtonStyle}
                                  disabled={Boolean(actionLoading[key])}
                                >
                                  {actionLoading[key] ? 'Isleniyor...' : 'Havale Onayla'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
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

const printButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#0f766e',
  color: '#ccfbf1',
}

const tabButton: CSSProperties = {
  ...buttonStyle,
  padding: '8px 14px',
}

const activeTabButton: CSSProperties = {
  ...tabButton,
  background: '#2563eb',
  color: '#fff',
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

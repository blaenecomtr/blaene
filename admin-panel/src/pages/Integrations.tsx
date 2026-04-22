import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'

interface MarketplaceConnection {
  id: string
  provider: string
  display_name: string
  is_active: boolean
  api_key_hint?: string | null
  credentials_configured?: boolean
  last_sync_at?: string | null
  last_error?: string | null
}

interface MarketplaceSyncItem {
  connection_id: string
  provider: string
  display_name: string
  pushed_stock_count: number
  pulled_order_count: number
  synced_at: string
  status: string
}

interface MarketplaceSyncResponse {
  action: string
  synced_at: string
  results: MarketplaceSyncItem[]
}

const PROVIDER_OPTIONS = [
  { value: 'trendyol', label: 'Trendyol' },
  { value: 'hepsiburada', label: 'Hepsiburada' },
  { value: 'iyzico', label: 'Iyzico' },
  { value: 'paytr', label: 'PayTR' },
]

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('tr-TR')
}

export default function Integrations() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null)
  const [connections, setConnections] = useState<MarketplaceConnection[]>([])
  const [provider, setProvider] = useState('trendyol')
  const [displayName, setDisplayName] = useState('Trendyol')
  const [isActive, setIsActive] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [storeCode, setStoreCode] = useState('')
  const [syncingAction, setSyncingAction] = useState<'push_stock' | 'pull_orders' | 'full_sync' | ''>('')
  const [syncResults, setSyncResults] = useState<MarketplaceSyncItem[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedConnection = useMemo(
    () => connections.find((item) => String(item.provider || '').toLowerCase() === provider),
    [connections, provider]
  )

  const loadConnections = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest<MarketplaceConnection[]>('/api/admin/marketplace-connections?page_size=200', { token })
      setConnections(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Entegrasyonlar yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConnections()
  }, [])

  useEffect(() => {
    const matched = connections.find((item) => String(item.provider || '').toLowerCase() === provider)
    const providerLabel = PROVIDER_OPTIONS.find((item) => item.value === provider)?.label || provider
    setDisplayName(matched?.display_name || providerLabel)
    setIsActive(matched?.is_active !== false)
    setApiKey('')
    setApiSecret('')
    setStoreCode('')
  }, [provider, connections])

  const saveIntegration = async () => {
    if (!token) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        provider,
        display_name: displayName.trim() || provider,
        is_active: isActive,
        credentials: {
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
          store_code: storeCode.trim(),
        },
      }

      if (selectedConnection?.id) {
        await apiRequest('/api/admin/marketplace-connections', {
          method: 'PUT',
          token,
          body: { id: selectedConnection.id, ...payload },
        })
      } else {
        await apiRequest('/api/admin/marketplace-connections', {
          method: 'POST',
          token,
          body: payload,
        })
      }

      setMessage(`${displayName || provider} entegrasyonu kaydedildi`)
      await loadConnections()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Entegrasyon kaydedilemedi'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const runSync = async (action: 'push_stock' | 'pull_orders' | 'full_sync') => {
    if (!token) return
    setError('')
    setMessage('')
    setSyncingAction(action)
    try {
      const data = await apiRequest<MarketplaceSyncResponse>('/api/admin/marketplace-sync', {
        method: 'POST',
        token,
        body: {
          action,
          provider,
          connection_id: selectedConnection?.id || null,
        },
      })
      setSyncResults(Array.isArray(data?.results) ? data.results : [])
      setMessage(
        action === 'push_stock'
          ? 'Stok senkronu tamamlandi'
          : action === 'pull_orders'
            ? 'Siparis cekme senkronu tamamlandi'
            : 'Tam senkron tamamlandi'
      )
      await loadConnections()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Senkron basarisiz'
      setError(msg)
    } finally {
      setSyncingAction('')
    }
  }

  const deleteConnection = async (row: MarketplaceConnection) => {
    if (!token) return
    const id = String(row.id || '').trim()
    if (!id) return

    const label = row.display_name || row.provider || id
    const confirmed = window.confirm(`"${label}" baglantisini silmek istiyor musunuz?\n\nBu islem geri alinmaz.`)
    if (!confirmed) return

    setDeletingConnectionId(id)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/marketplace-connections', {
        method: 'DELETE',
        token,
        body: { id },
      })
      setMessage(`${label} baglantisi silindi`)
      setSyncResults((prev) => prev.filter((item) => item.connection_id !== id))
      await loadConnections()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Baglanti silinemedi'
      setError(msg)
    } finally {
      setDeletingConnectionId(null)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Entegrasyonlar</h2>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Trendyol / Hepsiburada / Odeme saglayicilari</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <select value={provider} onChange={(evt) => setProvider(evt.target.value)} style={inputStyle}>
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={displayName}
            onChange={(evt) => setDisplayName(evt.target.value)}
            placeholder="Gorunen ad"
            style={inputStyle}
          />
          <label style={checkLabelStyle}>
            <input type="checkbox" checked={isActive} onChange={(evt) => setIsActive(evt.target.checked)} />
            Aktif
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <input value={apiKey} onChange={(evt) => setApiKey(evt.target.value)} placeholder="API Key" style={inputStyle} />
          <input
            value={apiSecret}
            onChange={(evt) => setApiSecret(evt.target.value)}
            placeholder="API Secret"
            style={inputStyle}
          />
          <input
            value={storeCode}
            onChange={(evt) => setStoreCode(evt.target.value)}
            placeholder="Magaza/Satici Kodu"
            style={inputStyle}
          />
        </div>

        <button onClick={() => void saveIntegration()} disabled={saving} style={primaryButton}>
          {saving ? 'Kaydediliyor...' : 'Entegrasyonu kaydet'}
        </button>

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => void runSync('push_stock')}
            disabled={!selectedConnection || syncingAction !== ''}
            style={secondaryButton}
          >
            {syncingAction === 'push_stock' ? 'Calisiyor...' : 'Stok gonder'}
          </button>
          <button
            onClick={() => void runSync('pull_orders')}
            disabled={!selectedConnection || syncingAction !== ''}
            style={secondaryButton}
          >
            {syncingAction === 'pull_orders' ? 'Calisiyor...' : 'Siparis cek'}
          </button>
          <button
            onClick={() => void runSync('full_sync')}
            disabled={!selectedConnection || syncingAction !== ''}
            style={secondaryButton}
          >
            {syncingAction === 'full_sync' ? 'Calisiyor...' : 'Tam senkron'}
          </button>
        </div>

        {message && <div style={okStyle}>{message}</div>}
        {error && <div style={errorStyle}>{error}</div>}
      </div>

      {!!syncResults.length && (
        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>Son senkron sonucu</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Saglayici</th>
                  <th style={thStyle}>Stok guncelleme</th>
                  <th style={thStyle}>Siparis cekme</th>
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Zaman</th>
                </tr>
              </thead>
              <tbody>
                {syncResults.map((row) => (
                  <tr key={`${row.connection_id}-${row.synced_at}`}>
                    <td style={tdStyle}>{row.display_name}</td>
                    <td style={tdStyle}>{Number(row.pushed_stock_count || 0)}</td>
                    <td style={tdStyle}>{Number(row.pulled_order_count || 0)}</td>
                    <td style={tdStyle}>{row.status || '-'}</td>
                    <td style={tdStyle}>{formatDate(row.synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Mevcut baglantilar</h3>
        {loading ? (
          <p style={{ color: '#94a3b8' }}>Yukleniyor...</p>
        ) : !connections.length ? (
          <p style={{ color: '#94a3b8' }}>Henuz baglanti yok.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Saglayici</th>
                  <th style={thStyle}>Baglanti</th>
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Son senkron</th>
                  <th style={thStyle}>Hata</th>
                  <th style={thStyle}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{row.provider}</td>
                    <td style={tdStyle}>
                      <div>{row.display_name || '-'}</div>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                        Key: {row.api_key_hint || '-'} | Credentials: {row.credentials_configured ? 'hazir' : 'bos'}
                      </div>
                    </td>
                    <td style={tdStyle}>{row.is_active ? 'Aktif' : 'Pasif'}</td>
                    <td style={tdStyle}>{formatDate(row.last_sync_at)}</td>
                    <td style={tdStyle}>{row.last_error || '-'}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => void deleteConnection(row)}
                        disabled={deletingConnectionId === row.id}
                        style={dangerButton}
                      >
                        {deletingConnectionId === row.id ? 'Siliniyor...' : 'Sil'}
                      </button>
                    </td>
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

const checkLabelStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  alignItems: 'center',
  color: '#cbd5e1',
  fontSize: '12px',
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

const dangerButton: CSSProperties = {
  background: '#7f1d1d',
  color: '#fecaca',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 10px',
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

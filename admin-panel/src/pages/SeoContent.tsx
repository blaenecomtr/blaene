import { type CSSProperties, useEffect, useState } from 'react'
import { getSiteSetting, saveSiteSetting } from '../lib/siteSettings'

interface BlogPost {
  id: string
  title: string
  slug: string
  summary: string
  content: string
  published_at: string
}

interface SeoEntry {
  id: string
  path: string
  title: string
  description: string
  slug: string
}

interface ContractContent {
  kvkk: string
  distance_sales: string
}

function createPost(): BlogPost {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    slug: '',
    summary: '',
    content: '',
    published_at: '',
  }
}

function createSeoEntry(): SeoEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path: '',
    title: '',
    description: '',
    slug: '',
  }
}

const DEFAULT_CONTRACTS: ContractContent = {
  kvkk: '',
  distance_sales: '',
}

export default function SeoContent() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [seoEntries, setSeoEntries] = useState<SeoEntry[]>([])
  const [contracts, setContracts] = useState<ContractContent>(DEFAULT_CONTRACTS)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [postData, seoData, contractData] = await Promise.all([
        getSiteSetting<BlogPost[]>(token, 'blog_posts', []),
        getSiteSetting<SeoEntry[]>(token, 'seo_pages', []),
        getSiteSetting<ContractContent>(token, 'contracts', DEFAULT_CONTRACTS),
      ])
      setPosts(Array.isArray(postData) ? postData : [])
      setSeoEntries(Array.isArray(seoData) ? seoData : [])
      setContracts({ ...DEFAULT_CONTRACTS, ...(contractData || {}) })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'SEO ve icerik verileri yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const saveAll = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await Promise.all([
        saveSiteSetting(token, 'blog_posts', posts, 'Blog ve haber yazilari'),
        saveSiteSetting(token, 'seo_pages', seoEntries, 'Sayfa SEO title/description/slug ayarlari'),
        saveSiteSetting(token, 'contracts', contracts, 'KVKK ve mesafeli satis sozlesmesi metinleri'),
      ])
      setMessage('SEO ve icerik kaydedildi')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'SEO ve icerik kaydedilemedi'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p style={{ color: '#94a3b8' }}>SEO ve icerik yukleniyor...</p>
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>SEO ve Icerik</h2>

      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={panelTitleStyle}>Blog / Haberler</h3>
          <button type="button" onClick={() => setPosts((prev) => [...prev, createPost()])} style={secondaryButton}>
            + Yazi ekle
          </button>
        </div>
        {!posts.length && <p style={{ color: '#94a3b8', marginTop: 0 }}>Blog yazisi bulunmuyor.</p>}
        {posts.map((post, idx) => (
          <div key={post.id} style={itemCardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
              <input
                value={post.title}
                onChange={(evt) =>
                  setPosts((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], title: evt.target.value }
                    return next
                  })
                }
                placeholder="Yazi basligi"
                style={inputStyle}
              />
              <input
                value={post.slug}
                onChange={(evt) =>
                  setPosts((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], slug: evt.target.value }
                    return next
                  })
                }
                placeholder="URL slug"
                style={inputStyle}
              />
              <input
                value={post.published_at}
                onChange={(evt) =>
                  setPosts((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], published_at: evt.target.value }
                    return next
                  })
                }
                placeholder="Yayin tarihi (YYYY-MM-DD)"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setPosts((prev) => prev.filter((item) => item.id !== post.id))}
                style={dangerMiniStyle}
              >
                Sil
              </button>
            </div>
            <input
              value={post.summary}
              onChange={(evt) =>
                setPosts((prev) => {
                  const next = [...prev]
                  next[idx] = { ...next[idx], summary: evt.target.value }
                  return next
                })
              }
              placeholder="Kisa ozet"
              style={{ ...inputStyle, width: '100%', marginBottom: '8px' }}
            />
            <textarea
              value={post.content}
              onChange={(evt) =>
                setPosts((prev) => {
                  const next = [...prev]
                  next[idx] = { ...next[idx], content: evt.target.value }
                  return next
                })
              }
              placeholder="Yazi icerigi"
              style={{ ...inputStyle, width: '100%', minHeight: '92px', resize: 'vertical' }}
            />
          </div>
        ))}
      </div>

      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={panelTitleStyle}>Sayfa SEO Ayarlari</h3>
          <button type="button" onClick={() => setSeoEntries((prev) => [...prev, createSeoEntry()])} style={secondaryButton}>
            + Sayfa SEO ekle
          </button>
        </div>
        {!seoEntries.length && <p style={{ color: '#94a3b8', marginTop: 0 }}>SEO kaydi bulunmuyor.</p>}
        {seoEntries.map((entry, idx) => (
          <div key={entry.id} style={itemCardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
              <input
                value={entry.path}
                onChange={(evt) =>
                  setSeoEntries((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], path: evt.target.value }
                    return next
                  })
                }
                placeholder="Sayfa yolu (or: /bath)"
                style={inputStyle}
              />
              <input
                value={entry.slug}
                onChange={(evt) =>
                  setSeoEntries((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], slug: evt.target.value }
                    return next
                  })
                }
                placeholder="URL slug"
                style={inputStyle}
              />
              <input
                value={entry.title}
                onChange={(evt) =>
                  setSeoEntries((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], title: evt.target.value }
                    return next
                  })
                }
                placeholder="Title"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setSeoEntries((prev) => prev.filter((item) => item.id !== entry.id))}
                style={dangerMiniStyle}
              >
                Sil
              </button>
            </div>
            <textarea
              value={entry.description}
              onChange={(evt) =>
                setSeoEntries((prev) => {
                  const next = [...prev]
                  next[idx] = { ...next[idx], description: evt.target.value }
                  return next
                })
              }
              placeholder="Description"
              style={{ ...inputStyle, width: '100%', minHeight: '72px', resize: 'vertical' }}
            />
          </div>
        ))}
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Sozlesmeler (KVKK / Mesafeli Satis)</h3>
        <textarea
          value={contracts.kvkk}
          onChange={(evt) => setContracts((prev) => ({ ...prev, kvkk: evt.target.value }))}
          placeholder="KVKK metni"
          style={{ ...inputStyle, width: '100%', minHeight: '120px', resize: 'vertical', marginBottom: '10px' }}
        />
        <textarea
          value={contracts.distance_sales}
          onChange={(evt) => setContracts((prev) => ({ ...prev, distance_sales: evt.target.value }))}
          placeholder="Mesafeli satis sozlesmesi metni"
          style={{ ...inputStyle, width: '100%', minHeight: '120px', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => void saveAll()} disabled={saving} style={primaryButton}>
          {saving ? 'Kaydediliyor...' : 'Tum SEO ve icerigi kaydet'}
        </button>
        <button onClick={() => void loadData()} style={secondaryButton}>
          Yeniden yukle
        </button>
      </div>

      {message && <div style={okStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}
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

const itemCardStyle: CSSProperties = {
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '10px',
  marginBottom: '10px',
}

const panelTitleStyle: CSSProperties = {
  color: '#fff',
  fontSize: '16px',
  margin: 0,
}

const inputStyle: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '13px',
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

const dangerMiniStyle: CSSProperties = {
  background: '#7f1d1d',
  color: '#fecaca',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
  cursor: 'pointer',
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

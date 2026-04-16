import { type ChangeEvent, type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../lib/api'

type Category = 'bath' | 'forge' | 'industrial'

interface Product {
  id: string
  code: string
  name: string
  category: Category | string
  price: number | null
  price_visible: boolean
  active: boolean
  images?: string[]
  stock_quantity?: number | null
}

interface BulkResult {
  inserted: number
  updated: number
  total: number
}

const CATEGORY_OPTIONS: Category[] = ['bath', 'forge', 'industrial']

function normalizeCategory(input: string): Category {
  const value = input.trim().toLowerCase()
  if (value === 'forge') return 'forge'
  if (value === 'industrial') return 'industrial'
  return 'bath'
}

function parsePrice(input: string): number | null {
  const cleaned = input.trim().replace(',', '.')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value)
}

function normalizeImages(images: unknown): string[] {
  if (!Array.isArray(images)) return []
  return images
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 24)
}

export default function Products() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | Category>('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({})
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<Category>('bath')
  const [newPrice, setNewPrice] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newVisible, setNewVisible] = useState(true)
  const [newActive, setNewActive] = useState(true)
  const [creating, setCreating] = useState(false)

  const hasChanges = useMemo(() => products.length > 0, [products])

  const loadProducts = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category !== 'all') params.set('category', category)
      params.set('page_size', '1000')
      const query = params.toString()
      const path = query ? `/api/admin/products?${query}` : '/api/admin/products'
      const data = await apiRequest<Product[]>(path, { token })
      const normalized = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        images: normalizeImages(item.images),
      }))
      setProducts(normalized)
      setImageDrafts((prev) => {
        const next: Record<string, string> = {}
        normalized.forEach((item) => {
          next[item.id] = prev[item.id] || ''
        })
        return next
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Urunler yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [category])

  const createProduct = async () => {
    if (!token) return
    setError('')
    setMessage('')

    const code = newCode.trim().toUpperCase()
    const name = newName.trim()
    const price = parsePrice(newPrice)
    const imageUrl = newImageUrl.trim()

    if (!code || !name) {
      setError('Kod ve ad zorunlu')
      return
    }

    setCreating(true)
    try {
      await apiRequest('/api/admin/products', {
        method: 'POST',
        token,
        body: {
          code,
          name,
          category: newCategory,
          price,
          price_visible: newVisible && price !== null,
          active: newActive,
          stock_quantity: 0,
          images: imageUrl ? [imageUrl] : [],
        },
      })

      setNewCode('')
      setNewName('')
      setNewCategory('bath')
      setNewPrice('')
      setNewImageUrl('')
      setNewVisible(true)
      setNewActive(true)
      setMessage('Urun eklendi')
      await loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Urun eklenemedi'
      setError(msg)
    } finally {
      setCreating(false)
    }
  }

  const updateLocalProduct = (id: string, patch: Partial<Product>) => {
    setProducts((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const appendProductImage = (id: string, imageValue: string) => {
    const safe = imageValue.trim()
    if (!safe) return
    setProducts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const current = normalizeImages(item.images)
        if (current.includes(safe)) return item
        return { ...item, images: [...current, safe].slice(0, 24) }
      })
    )
  }

  const removeProductImage = (id: string, index: number) => {
    setProducts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const current = normalizeImages(item.images)
        const filtered = current.filter((_, idx) => idx !== index)
        return { ...item, images: filtered }
      })
    )
  }

  const clearProductImages = (id: string) => {
    setProducts((prev) => prev.map((item) => (item.id === id ? { ...item, images: [] } : item)))
  }

  const saveProduct = async (product: Product) => {
    if (!token) return
    setError('')
    setMessage('')
    setSavingId(product.id)
    try {
      await apiRequest('/api/admin/products', {
        method: 'PUT',
        token,
        body: {
          id: product.id,
          code: product.code?.trim().toUpperCase(),
          name: product.name?.trim(),
          category: normalizeCategory(product.category),
          price: product.price,
          price_visible: Boolean(product.price_visible),
          active: Boolean(product.active),
          stock_quantity: Number(product.stock_quantity || 0),
          images: normalizeImages(product.images),
        },
      })
      setMessage(`${product.code} guncellendi`)
      await loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kayit guncellenemedi'
      setError(msg)
    } finally {
      setSavingId(null)
    }
  }

  const deleteProduct = async (id: string, code: string) => {
    if (!token) return
    if (!window.confirm(`${code} urununu silmek istiyor musunuz?`)) return
    setDeletingId(id)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/products', {
        method: 'DELETE',
        token,
        body: { id },
      })
      setMessage(`${code} silindi`)
      setProducts((prev) => prev.filter((item) => item.id !== id))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Silme islemi basarisiz'
      setError(msg)
    } finally {
      setDeletingId(null)
    }
  }

  const runBulkUpsert = async () => {
    if (!token) return
    setError('')
    setMessage('')
    const lines = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length) {
      setError('Toplu yukleme metni bos')
      return
    }

    const records = lines
      .map((line) => line.split(';').map((part) => part.trim()))
      .filter((parts) => parts.length >= 3)
      .map((parts) => {
        const categoryValue = parts[3] ? normalizeCategory(parts[3]) : 'bath'
        const price = parsePrice(parts[2])
        return {
          code: parts[0].toUpperCase(),
          name: parts[1],
          category: categoryValue,
          price,
          price_visible: price !== null,
          active: true,
        }
      })
      .filter((row) => row.code && row.name)

    if (!records.length) {
      setError('Gecerli satir bulunamadi. Format: KOD;AD;FIYAT;KATEGORI')
      return
    }

    setBulkLoading(true)
    try {
      const result = await apiRequest<BulkResult>('/api/admin/products-bulk', {
        method: 'POST',
        token,
        body: { records },
      })
      setMessage(`Toplu islem tamamlandi. Eklendi: ${result.inserted}, Guncellendi: ${result.updated}`)
      setBulkText('')
      await loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Toplu yukleme basarisiz'
      setError(msg)
    } finally {
      setBulkLoading(false)
    }
  }

  const addImageFromDraft = (productId: string) => {
    const draft = String(imageDrafts[productId] || '').trim()
    if (!draft) return
    appendProductImage(productId, draft)
    setImageDrafts((prev) => ({ ...prev, [productId]: '' }))
  }

  const chooseImageFile = (productId: string) => {
    setUploadTargetId(productId)
    fileInputRef.current?.click()
  }

  const onImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const targetId = uploadTargetId
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!targetId || !file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '').trim()
      if (!result) return
      appendProductImage(targetId, result)
      setMessage('Dosya eklendi. Kaydet butonuna basin.')
    }
    reader.onerror = () => {
      setError('Dosya okunamadi')
    }
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Urun, fiyat ve foto yonetimi</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onImageFileChange}
      />

      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '10px',
          padding: '18px',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '12px' }}>Yeni urun ekle</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 2fr', gap: '10px' }}>
          <input
            value={newCode}
            onChange={(evt) => setNewCode(evt.target.value)}
            placeholder="Kod"
            style={inputStyle}
          />
          <input
            value={newName}
            onChange={(evt) => setNewName(evt.target.value)}
            placeholder="Urun adi"
            style={inputStyle}
          />
          <select
            value={newCategory}
            onChange={(evt) => setNewCategory(normalizeCategory(evt.target.value))}
            style={inputStyle}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            value={newPrice}
            onChange={(evt) => setNewPrice(evt.target.value)}
            placeholder="Fiyat"
            style={inputStyle}
          />
          <input
            value={newImageUrl}
            onChange={(evt) => setNewImageUrl(evt.target.value)}
            placeholder="Ilk foto URL (opsiyonel)"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', gap: '14px', marginTop: '10px', alignItems: 'center' }}>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={newVisible}
              onChange={(evt) => setNewVisible(evt.target.checked)}
            />
            Fiyat gorunsun
          </label>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={newActive}
              onChange={(evt) => setNewActive(evt.target.checked)}
            />
            Aktif
          </label>
          <button onClick={() => void createProduct()} disabled={creating} style={primaryButton}>
            {creating ? 'Ekleniyor...' : 'Urun ekle'}
          </button>
        </div>
      </div>

      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '10px',
          padding: '18px',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '12px' }}>Toplu urun yukle</h3>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '10px' }}>
          Her satir: KOD;AD;FIYAT;KATEGORI
        </p>
        <textarea
          value={bulkText}
          onChange={(evt) => setBulkText(evt.target.value)}
          style={{
            ...inputStyle,
            minHeight: '90px',
            resize: 'vertical',
            width: '100%',
          }}
          placeholder="BTH-001;Sabunluk;399.90;bath"
        />
        <div style={{ marginTop: '10px' }}>
          <button onClick={() => void runBulkUpsert()} disabled={bulkLoading} style={secondaryButton}>
            {bulkLoading ? 'Yukleniyor...' : 'Toplu kaydet'}
          </button>
        </div>
      </div>

      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '10px',
          padding: '18px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            value={search}
            onChange={(evt) => setSearch(evt.target.value)}
            placeholder="Kod veya ad ara"
            style={{ ...inputStyle, flex: 1 }}
          />
          <select
            value={category}
            onChange={(evt) => setCategory(evt.target.value as 'all' | Category)}
            style={inputStyle}
          >
            <option value="all">all</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button onClick={() => void loadProducts()} style={secondaryButton}>
            Listeyi yenile
          </button>
        </div>

        {message && <div style={okAlertStyle}>{message}</div>}
        {error && <div style={errorAlertStyle}>{error}</div>}

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Urunler yukleniyor...</p>
        ) : !hasChanges ? (
          <p style={{ color: '#94a3b8' }}>Urun bulunamadi.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Kod</th>
                  <th style={thStyle}>Ad</th>
                  <th style={thStyle}>Kategori</th>
                  <th style={thStyle}>Fiyat</th>
                  <th style={thStyle}>Fotolar</th>
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const photos = normalizeImages(product.images)
                  return (
                    <tr key={product.id}>
                      <td style={tdStyle}>
                        <input
                          value={product.code || ''}
                          onChange={(evt) => updateLocalProduct(product.id, { code: evt.target.value.toUpperCase() })}
                          style={{ ...inputStyle, width: '110px' }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={product.name || ''}
                          onChange={(evt) => updateLocalProduct(product.id, { name: evt.target.value })}
                          style={{ ...inputStyle, minWidth: '220px' }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={normalizeCategory(product.category)}
                          onChange={(evt) =>
                            updateLocalProduct(product.id, { category: normalizeCategory(evt.target.value) })
                          }
                          style={inputStyle}
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={product.price ?? ''}
                          onChange={(evt) =>
                            updateLocalProduct(product.id, {
                              price: parsePrice(evt.target.value),
                              price_visible: parsePrice(evt.target.value) !== null,
                            })
                          }
                          style={{ ...inputStyle, width: '120px' }}
                        />
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                          {formatPrice(product.price)}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {photos.slice(0, 5).map((src, idx) => (
                            <div key={`${product.id}-img-${idx}`} style={{ position: 'relative' }}>
                              <img src={src} alt={`${product.code}-${idx + 1}`} style={thumbStyle} />
                              <button
                                type="button"
                                onClick={() => removeProductImage(product.id, idx)}
                                style={removeImageButtonStyle}
                                title="Sil"
                              >
                                x
                              </button>
                            </div>
                          ))}
                          {!photos.length && <span style={{ color: '#64748b', fontSize: '11px' }}>Foto yok</span>}
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            value={imageDrafts[product.id] || ''}
                            onChange={(evt) =>
                              setImageDrafts((prev) => ({ ...prev, [product.id]: evt.target.value }))
                            }
                            placeholder="Foto URL"
                            style={{ ...inputStyle, width: '170px' }}
                          />
                          <button type="button" onClick={() => addImageFromDraft(product.id)} style={miniButtonStyle}>
                            URL ekle
                          </button>
                          <button type="button" onClick={() => chooseImageFile(product.id)} style={miniButtonStyle}>
                            Dosya
                          </button>
                          <button type="button" onClick={() => clearProductImages(product.id)} style={dangerMiniStyle}>
                            Temizle
                          </button>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>
                          {photos.length} foto
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <label style={checkLabelStyle}>
                          <input
                            type="checkbox"
                            checked={Boolean(product.active)}
                            onChange={(evt) => updateLocalProduct(product.id, { active: evt.target.checked })}
                          />
                          Aktif
                        </label>
                        <label style={checkLabelStyle}>
                          <input
                            type="checkbox"
                            checked={Boolean(product.price_visible)}
                            onChange={(evt) => updateLocalProduct(product.id, { price_visible: evt.target.checked })}
                          />
                          Fiyat
                        </label>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => void saveProduct(product)}
                            disabled={savingId === product.id}
                            style={secondaryButton}
                          >
                            {savingId === product.id ? 'Kaydediliyor...' : 'Kaydet'}
                          </button>
                          <button
                            onClick={() => void deleteProduct(product.id, product.code)}
                            disabled={deletingId === product.id}
                            style={dangerButton}
                          >
                            {deletingId === product.id ? 'Siliniyor...' : 'Sil'}
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

const miniButtonStyle: CSSProperties = {
  background: '#1d4ed8',
  color: '#dbeafe',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
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

const dangerButton: CSSProperties = {
  background: '#b91c1c',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
}

const thumbStyle: CSSProperties = {
  width: '48px',
  height: '48px',
  objectFit: 'cover',
  borderRadius: '6px',
  border: '1px solid #334155',
  background: '#020617',
}

const removeImageButtonStyle: CSSProperties = {
  position: 'absolute',
  top: '-6px',
  right: '-6px',
  width: '16px',
  height: '16px',
  borderRadius: '999px',
  border: 'none',
  background: '#ef4444',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '10px',
  lineHeight: 1,
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

const okAlertStyle: CSSProperties = {
  background: 'rgba(34, 197, 94, 0.15)',
  border: '1px solid #22c55e',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#86efac',
  fontSize: '12px',
  marginBottom: '10px',
}

const errorAlertStyle: CSSProperties = {
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid #ef4444',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fca5a5',
  fontSize: '12px',
  marginBottom: '10px',
}

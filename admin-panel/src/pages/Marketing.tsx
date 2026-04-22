import { type CSSProperties, type ChangeEvent, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../lib/api'
import { getSiteSetting, saveSiteSetting } from '../lib/siteSettings'

interface Promotion {
  id: string
  code: string
  title: string
  description?: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  usage_limit?: number
  usage_count?: number
  is_active: boolean
}

interface Customer {
  id: string
  email: string
  full_name?: string | null
}

interface BannerItem {
  id: string
  title: string
  description?: string
  image_url: string
  link_url: string
  active: boolean
  text_animation?: boolean
  image_fit?: 'cover' | 'contain' | 'fill'
  image_position?: string
}

interface BroadcastLog {
  at: string
  promotion_code: string
  recipients: number
}

const MAX_UPLOAD_SOURCE_BYTES = 6 * 1024 * 1024
const MAX_SAFE_DATAURL_LENGTH = 3_800_000

function createBanner(): BannerItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    description: '',
    image_url: '',
    link_url: '',
    active: true,
    text_animation: false,
    image_fit: 'cover',
    image_position: 'center',
  }
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(String(value || '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

export default function Marketing() {
  const token = localStorage.getItem('admin_token')
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [banners, setBanners] = useState<BannerItem[]>([])
  const [broadcastLog, setBroadcastLog] = useState<BroadcastLog[]>([])
  const [newCode, setNewCode] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDiscountType, setNewDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [newDiscountValue, setNewDiscountValue] = useState('')
  const [selectedPromotionId, setSelectedPromotionId] = useState('')
  const [bannerUploadTargetId, setBannerUploadTargetId] = useState<string | null>(null)
  const [bannerUploadingId, setBannerUploadingId] = useState<string | null>(null)
  const [customerModal, setCustomerModal] = useState(false)
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set())
  const [customerSearch, setCustomerSearch] = useState('')
  const [loadingCustomers, setLoadingCustomers] = useState(false)

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Dosya okunamadi'))
      reader.readAsDataURL(file)
    })

  const compressImageAsDataUrl = async (file: File, maxSize: number, quality: number) => {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Gorsel islenemedi'))
        img.src = objectUrl
      })

      const scale = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1))
      const width = Math.max(1, Math.round((image.width || 1) * scale))
      const height = Math.max(1, Math.round((image.height || 1) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Gorsel islenemedi')
      ctx.drawImage(image, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), 'image/jpeg', quality)
      })
      if (!blob) throw new Error('Gorsel sikistirilamadi')
      return await readFileAsDataUrl(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const uploadImage = async (file: File, folderKey: string) => {
    if (!token) throw new Error('Oturum yok')
    if (file.size > MAX_UPLOAD_SOURCE_BYTES) {
      throw new Error('Dosya 6MB ustunde. Daha kucuk bir gorsel secin.')
    }
    let dataUrl = await readFileAsDataUrl(file)
    if (dataUrl.length > MAX_SAFE_DATAURL_LENGTH || file.size > 2_600_000) {
      dataUrl = await compressImageAsDataUrl(file, 1800, 0.82)
    }
    if (dataUrl.length > MAX_SAFE_DATAURL_LENGTH) {
      dataUrl = await compressImageAsDataUrl(file, 1400, 0.74)
    }
    if (dataUrl.length > MAX_SAFE_DATAURL_LENGTH) {
      throw new Error('Gorsel cok buyuk. Lutfen daha dusuk cozunurlukte dosya secin.')
    }
    const uploaded = await apiRequest<{ url?: string }>('/api/admin/upload-image', {
      method: 'POST',
      token,
      body: {
        data_url: dataUrl,
        filename: file.name,
        product_code: folderKey,
      },
    })
    if (!uploaded?.url) throw new Error('Yuklenen gorsel URL donmedi')
    return uploaded.url
  }

  const loadData = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [promoData, bannerData, logData] = await Promise.all([
        apiRequest<Promotion[]>('/api/admin/promotions?page_size=200', { token }),
        getSiteSetting<BannerItem[]>(token, 'homepage_banners', []),
        getSiteSetting<BroadcastLog[]>(token, 'coupon_broadcast_log', []),
      ])
      const nextPromos = Array.isArray(promoData) ? promoData : []
      setPromotions(nextPromos)
      setBanners(Array.isArray(bannerData) ? bannerData : [])
      setBroadcastLog(Array.isArray(logData) ? logData : [])
      if (!selectedPromotionId && nextPromos.length) {
        setSelectedPromotionId(nextPromos[0].id)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pazarlama verileri yuklenemedi'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const createPromotion = async () => {
    if (!token) return
    const code = newCode.trim().toUpperCase()
    const title = newTitle.trim()
    const discountValue = parseNumber(newDiscountValue, Number.NaN)
    if (!code || !title || !Number.isFinite(discountValue)) {
      setError('Kupon kodu, baslik ve gecerli indirim degeri girin')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/promotions', {
        method: 'POST',
        token,
        body: {
          code,
          title,
          description: newDescription.trim() || null,
          discount_type: newDiscountType,
          discount_value: discountValue,
          is_active: true,
        },
      })
      setNewCode('')
      setNewTitle('')
      setNewDescription('')
      setNewDiscountType('percent')
      setNewDiscountValue('')
      setMessage('Kupon olusturuldu')
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kupon olusturulamadi'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const savePromotion = async (promotion: Promotion) => {
    if (!token) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/promotions', {
        method: 'PUT',
        token,
        body: {
          id: promotion.id,
          code: promotion.code,
          title: promotion.title,
          description: promotion.description || null,
          discount_type: promotion.discount_type,
          discount_value: promotion.discount_value,
          is_active: promotion.is_active,
          usage_limit: promotion.usage_limit || 0,
        },
      })
      setMessage(`${promotion.code} guncellendi`)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kupon guncellenemedi'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const removePromotion = async (promotion: Promotion) => {
    if (!token) return
    if (!window.confirm(`${promotion.code} kuponunu silmek istiyor musunuz?`)) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/promotions', {
        method: 'DELETE',
        token,
        body: { id: promotion.id },
      })
      setMessage(`${promotion.code} silindi`)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kupon silinemedi'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const saveBanners = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveSiteSetting(token, 'homepage_banners', banners, 'Anasayfa slider/banner yonetimi')
      setMessage('Banner ayarlari kaydedildi')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Banner ayarlari kaydedilemedi'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const chooseBannerFile = (bannerId: string) => {
    setBannerUploadTargetId(bannerId)
    bannerFileInputRef.current?.click()
  }

  const onBannerFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const targetId = bannerUploadTargetId
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!targetId || !file) return

    setBannerUploadingId(targetId)
    setError('')
    setMessage('')
    try {
      const url = await uploadImage(file, `banner-${targetId}`)
      setBanners((prev) => prev.map((item) => (item.id === targetId ? { ...item, image_url: url } : item)))
      setMessage('Banner gorseli yuklendi')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Banner dosyasi yuklenemedi'
      setError(msg)
    } finally {
      setBannerUploadingId(null)
    }
  }

  const openCustomerModal = async () => {
    if (!token) return
    if (!selectedPromotionId) {
      setError('Once kupon secin')
      return
    }
    setCustomerModal(true)
    setCustomerSearch('')
    if (allCustomers.length) return
    setLoadingCustomers(true)
    try {
      const data = await apiRequest<Customer[]>('/api/admin/customers?page_size=2000', { token })
      setAllCustomers((Array.isArray(data) ? data : []).filter((c) => c.email))
    } catch {
      setAllCustomers([])
    } finally {
      setLoadingCustomers(false)
    }
  }

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (filtered: Customer[]) => {
    const allSelected = filtered.every((c) => selectedCustomerIds.has(c.id))
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev)
      if (allSelected) filtered.forEach((c) => next.delete(c.id))
      else filtered.forEach((c) => next.add(c.id))
      return next
    })
  }

  const broadcastCoupon = async () => {
    if (!token) return
    const selectedPromotion = promotions.find((item) => item.id === selectedPromotionId)
    if (!selectedPromotion) return
    if (!selectedCustomerIds.size) {
      setError('En az bir musteri secin')
      return
    }
    setCustomerModal(false)
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await apiRequest<{ sent: number; failed: number; total: number }>(
        '/api/admin/coupon-broadcast',
        {
          method: 'POST',
          token,
          body: {
            promotion_id: selectedPromotion.id,
            customer_ids: Array.from(selectedCustomerIds),
          },
        }
      )
      const sent = result?.sent ?? 0
      const failed = result?.failed ?? 0
      const total = result?.total ?? 0

      const nextLog = [
        {
          at: new Date().toISOString(),
          promotion_code: selectedPromotion.code,
          recipients: sent,
        },
        ...broadcastLog,
      ].slice(0, 100)
      setBroadcastLog(nextLog)
      await saveSiteSetting(token, 'coupon_broadcast_log', nextLog, 'Toplu kupon gonderim gecmisi')
      setSelectedCustomerIds(new Set())
      setMessage(`Gonderim tamamlandi: ${sent}/${total} basarili${failed ? `, ${failed} basarisiz` : ''}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Toplu kupon gonderimi basarisiz'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p style={{ color: '#94a3b8' }}>Pazarlama verileri yukleniyor...</p>
  }

  return (
    <div>
      <style>{`
        @keyframes slideText {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(-8px); opacity: 0.8; }
        }
      `}</style>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Pazarlama / Kampanya</h2>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Indirim kuponu olustur</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <input value={newCode} onChange={(evt) => setNewCode(evt.target.value)} placeholder="Kupon kodu (BLAENE10)" style={inputStyle} />
          <input value={newTitle} onChange={(evt) => setNewTitle(evt.target.value)} placeholder="Kampanya basligi" style={inputStyle} />
          <select value={newDiscountType} onChange={(evt) => setNewDiscountType(evt.target.value as 'percent' | 'fixed')} style={inputStyle}>
            <option value="percent">Yuzde</option>
            <option value="fixed">Sabit</option>
          </select>
          <input value={newDiscountValue} onChange={(evt) => setNewDiscountValue(evt.target.value)} placeholder="Indirim degeri" style={inputStyle} />
        </div>
        <input
          value={newDescription}
          onChange={(evt) => setNewDescription(evt.target.value)}
          placeholder="Aciklama"
          style={{ ...inputStyle, width: '100%', marginBottom: '10px' }}
        />
        <button onClick={() => void createPromotion()} disabled={saving} style={primaryButton}>
          {saving ? 'Isleniyor...' : 'Kuponu kaydet'}
        </button>
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Toplu kupon gonderimi</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={selectedPromotionId} onChange={(evt) => setSelectedPromotionId(evt.target.value)} style={{ ...inputStyle, minWidth: '280px' }}>
            <option value="">Kupon secin</option>
            {promotions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} - {item.title}
              </option>
            ))}
          </select>
          <button onClick={() => void openCustomerModal()} disabled={saving || !selectedPromotionId} style={secondaryButton}>
            Musteri listesini ac ve gonder
          </button>
          {selectedCustomerIds.size > 0 && (
            <span style={{ color: '#86efac', fontSize: '12px' }}>{selectedCustomerIds.size} musteri secildi</span>
          )}
        </div>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '8px' }}>
          Musteri listesinden alici secin, Resend ile email gonderilir.
        </p>
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Mevcut kuponlar</h3>
        {!promotions.length ? (
          <p style={{ color: '#94a3b8' }}>Kupon bulunamadi.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Kod</th>
                  <th style={thStyle}>Baslik</th>
                  <th style={thStyle}>Tip</th>
                  <th style={thStyle}>Deger</th>
                  <th style={thStyle}>Kullanim</th>
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((promotion, idx) => (
                  <tr key={promotion.id}>
                    <td style={tdStyle}>
                      <input
                        value={promotion.code}
                        onChange={(evt) =>
                          setPromotions((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], code: evt.target.value.toUpperCase() }
                            return next
                          })
                        }
                        style={{ ...inputStyle, width: '120px' }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        value={promotion.title}
                        onChange={(evt) =>
                          setPromotions((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], title: evt.target.value }
                            return next
                          })
                        }
                        style={{ ...inputStyle, width: '220px' }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={promotion.discount_type}
                        onChange={(evt) =>
                          setPromotions((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], discount_type: evt.target.value as 'percent' | 'fixed' }
                            return next
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="percent">percent</option>
                        <option value="fixed">fixed</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input
                        value={String(promotion.discount_value ?? 0)}
                        onChange={(evt) =>
                          setPromotions((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], discount_value: parseNumber(evt.target.value, 0) }
                            return next
                          })
                        }
                        style={{ ...inputStyle, width: '110px' }}
                      />
                    </td>
                    <td style={tdStyle}>
                      {Number(promotion.usage_count || 0)} / {Number(promotion.usage_limit || 0)}
                    </td>
                    <td style={tdStyle}>
                      <label style={checkLabelStyle}>
                        <input
                          type="checkbox"
                          checked={promotion.is_active}
                          onChange={(evt) =>
                            setPromotions((prev) => {
                              const next = [...prev]
                              next[idx] = { ...next[idx], is_active: evt.target.checked }
                              return next
                            })
                          }
                        />
                        Aktif
                      </label>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => void savePromotion(promotion)} style={secondaryButton}>
                          Kaydet
                        </button>
                        <button onClick={() => void removePromotion(promotion)} style={dangerMiniStyle}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={panelTitleStyle}>Slider / Banner yonetimi</h3>
          <button type="button" onClick={() => setBanners((prev) => [...prev, createBanner()])} style={secondaryButton}>
            + Banner ekle
          </button>
        </div>
        {banners.map((banner, idx) => (
          <div key={banner.id} style={itemCardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr auto auto auto', gap: '8px' }}>
              <input
                value={banner.title}
                onChange={(evt) =>
                  setBanners((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], title: evt.target.value }
                    return next
                  })
                }
                placeholder="Banner basligi"
                style={inputStyle}
              />
              <input
                value={banner.image_url}
                onChange={(evt) =>
                  setBanners((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], image_url: evt.target.value }
                    return next
                  })
                }
                placeholder="Gorsel URL"
                style={inputStyle}
              />
              <input
                value={banner.link_url}
                onChange={(evt) =>
                  setBanners((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], link_url: evt.target.value }
                    return next
                  })
                }
                placeholder="Yonlendirme URL"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => chooseBannerFile(banner.id)}
                style={secondaryButton}
                disabled={bannerUploadingId === banner.id}
              >
                {bannerUploadingId === banner.id ? 'Yukleniyor...' : 'Dosya'}
              </button>
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={banner.active}
                  onChange={(evt) =>
                    setBanners((prev) => {
                      const next = [...prev]
                      next[idx] = { ...next[idx], active: evt.target.checked }
                      return next
                    })
                  }
                />
                Aktif
              </label>
              <button type="button" onClick={() => setBanners((prev) => prev.filter((item) => item.id !== banner.id))} style={dangerMiniStyle}>
                Sil
              </button>
            </div>
            <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <textarea
                value={String(banner.description || '')}
                onChange={(evt) =>
                  setBanners((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], description: evt.target.value }
                    return next
                  })
                }
                placeholder="Banner aciklamasi"
                style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px' }}>
              <select
                value={banner.image_fit || 'cover'}
                onChange={(evt) =>
                  setBanners((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], image_fit: evt.target.value as 'cover' | 'contain' | 'fill' }
                    return next
                  })
                }
                style={inputStyle}
              >
                <option value="cover">Kapla (cover)</option>
                <option value="contain">Sigt (contain)</option>
                <option value="fill">Doldur (fill)</option>
              </select>
              <input
                value={banner.image_position || 'center'}
                onChange={(evt) =>
                  setBanners((prev) => {
                    const next = [...prev]
                    next[idx] = { ...next[idx], image_position: evt.target.value }
                    return next
                  })
                }
                placeholder="Gorsel konumu (center, top, bottom)"
                style={inputStyle}
              />
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={banner.text_animation || false}
                  onChange={(evt) =>
                    setBanners((prev) => {
                      const next = [...prev]
                      next[idx] = { ...next[idx], text_animation: evt.target.checked }
                      return next
                    })
                  }
                />
                Akan yazı
              </label>
            </div>
            {banner.image_url && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #334155', paddingTop: '12px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '12px', marginBottom: '8px' }}>Onizleme:</p>
                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    height: '160px',
                    backgroundImage: `url(${banner.image_url})`,
                    backgroundSize: banner.image_fit || 'cover',
                    backgroundPosition: banner.image_position || 'center',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      textAlign: 'center',
                      color: '#fff',
                      textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
                      animation: banner.text_animation ? 'slideText 8s ease-in-out infinite' : 'none',
                    } as CSSProperties}
                  >
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{banner.title}</div>
                    {banner.description && <div style={{ fontSize: '13px', marginTop: '4px' }}>{banner.description}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        <input
          ref={bannerFileInputRef}
          type="file"
          accept="image/*"
          onChange={(evt) => void onBannerFileChange(evt)}
          style={{ display: 'none' }}
        />
        <button onClick={() => void saveBanners()} disabled={saving} style={primaryButton}>
          Bannerlari kaydet
        </button>
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Kupon gonderim gecmisi</h3>
        {!broadcastLog.length ? (
          <p style={{ color: '#94a3b8' }}>Kayit yok.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', fontSize: '12px' }}>
            {broadcastLog.slice(0, 20).map((item, idx) => (
              <li key={`${item.at}-${idx}`} style={{ marginBottom: '4px' }}>
                {new Date(item.at).toLocaleString('tr-TR')} - {item.promotion_code} - {item.recipients} alici
              </li>
            ))}
          </ul>
        )}
      </div>

      {message && <div style={okStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      {customerModal && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: '#fff', fontSize: '16px', margin: 0 }}>Alici secin</h3>
              <button onClick={() => setCustomerModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Ada veya email gore ara..."
              style={{ ...inputStyle, width: '100%', marginBottom: '10px' }}
            />
            {loadingCustomers ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Yukleniyor...</p>
            ) : (() => {
              const filtered = allCustomers.filter((c) => {
                if (!customerSearch) return true
                const q = customerSearch.toLowerCase()
                return (
                  (c.email || '').toLowerCase().includes(q) ||
                  (c.full_name || '').toLowerCase().includes(q)
                )
              })
              const allSelected = filtered.length > 0 && filtered.every((c) => selectedCustomerIds.has(c.id))
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ ...checkLabelStyle, cursor: 'pointer' }}>
                      <input type="checkbox" checked={allSelected} onChange={() => toggleAll(filtered)} />
                      Tumunu sec ({filtered.length})
                    </label>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>{selectedCustomerIds.size} secildi</span>
                  </div>
                  <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '6px' }}>
                    {filtered.length === 0 ? (
                      <p style={{ color: '#94a3b8', padding: '16px', textAlign: 'center' }}>Musteri bulunamadi</p>
                    ) : filtered.map((c) => (
                      <label key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #1e293b', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedCustomerIds.has(c.id)} onChange={() => toggleCustomer(c.id)} />
                        <div>
                          <div style={{ color: '#e2e8f0', fontSize: '13px' }}>{c.full_name || '—'}</div>
                          <div style={{ color: '#94a3b8', fontSize: '11px' }}>{c.email}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setCustomerModal(false)} style={secondaryButton}>Iptal</button>
                    <button
                      onClick={() => void broadcastCoupon()}
                      disabled={selectedCustomerIds.size === 0 || saving}
                      style={{ ...primaryButton, opacity: selectedCustomerIds.size === 0 ? 0.5 : 1 }}
                    >
                      {saving ? 'Gonderiliyor...' : `${selectedCustomerIds.size} kişiye gonder`}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
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
}

const itemCardStyle: CSSProperties = {
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '10px',
  marginBottom: '10px',
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

const checkLabelStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  alignItems: 'center',
  color: '#cbd5e1',
  fontSize: '12px',
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

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalBoxStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '24px',
  width: '520px',
  maxWidth: '95vw',
  maxHeight: '90vh',
  overflowY: 'auto',
}

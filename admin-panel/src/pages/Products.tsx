import { type ChangeEvent, type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../lib/api'

type Category = 'bath' | 'forge' | 'industrial'

interface ProductVariant {
  id: string
  product_id: string
  label: string
  color?: string | null
  images?: string[]
  stock?: number | null
  active?: boolean
}

interface Product {
  id: string
  code: string
  name: string
  description?: string | null
  category: Category | string
  price: number | null
  price_visible: boolean
  active: boolean
  images?: string[]
  stock_quantity?: number | null
  seo_title?: string | null
  seo_description?: string | null
  seo_slug?: string | null
  variants?: ProductVariant[]
}

interface UploadImageResult {
  url: string
}

interface ColorDraft {
  id: string
  color: string
  color2: string
  label: string
  imageUrl: string
  file: File | null
}

interface VariantDraft {
  color: string
  color2: string
  label: string
  imageUrl: string
  file: File | null
}

interface PriceBulkResult {
  updated: number
}

const CATEGORY_OPTIONS: Category[] = ['bath', 'forge', 'industrial']
const MAX_UPLOAD_SOURCE_BYTES = 6 * 1024 * 1024
const MAX_SAFE_DATAURL_LENGTH = 3_800_000

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

function parseStock(input: string): number {
  const parsed = Number(String(input || '').trim())
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
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

function normalizeVariants(variants: unknown): ProductVariant[] {
  if (!Array.isArray(variants)) return []
  return variants
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        id: String(row.id || ''),
        product_id: String(row.product_id || ''),
        label: String(row.label || ''),
        color: row.color ? String(row.color) : null,
        images: normalizeImages(row.images),
        stock: typeof row.stock === 'number' ? row.stock : Number(row.stock || 0),
        active: row.active !== false,
      }
    })
    .filter((item): item is ProductVariant => Boolean(item?.id))
}

function createEmptyColorDraft(): ColorDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    color: '',
    color2: '',
    label: '',
    imageUrl: '',
    file: null,
  }
}

function getVariantLabel(variant: ProductVariant): string {
  return String(variant.color || variant.label || '').trim() || 'Renk'
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
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({})
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null)
  const [savingImageId, setSavingImageId] = useState<string | null>(null)
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>({})
  const [variantActionLoading, setVariantActionLoading] = useState<string | null>(null)
  const [bulkPriceMode, setBulkPriceMode] = useState<'set' | 'increase_percent' | 'increase_fixed'>('increase_percent')
  const [bulkPriceAmount, setBulkPriceAmount] = useState('')
  const [bulkPriceCategory, setBulkPriceCategory] = useState<'all' | Category>('all')
  const [bulkPriceLoading, setBulkPriceLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState<Category>('bath')
  const [newPrice, setNewPrice] = useState('')
  const [newStockQuantity, setNewStockQuantity] = useState('0')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newImageFile, setNewImageFile] = useState<File | null>(null)
  const [newSeoTitle, setNewSeoTitle] = useState('')
  const [newSeoDescription, setNewSeoDescription] = useState('')
  const [newSeoSlug, setNewSeoSlug] = useState('')
  const [newVisible, setNewVisible] = useState(true)
  const [newActive, setNewActive] = useState(true)
  const [newColorDrafts, setNewColorDrafts] = useState<ColorDraft[]>([createEmptyColorDraft()])
  const [creating, setCreating] = useState(false)
  const [newImageDropActive, setNewImageDropActive] = useState(false)
  const [productImageDropActiveId, setProductImageDropActiveId] = useState<string | null>(null)

  const hasProducts = useMemo(() => products.length > 0, [products])

  const loadProducts = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category !== 'all') params.set('category', category)
      params.set('page_size', '1000')
      params.set('_t', String(Date.now()))
      const path = `/api/admin/products?${params.toString()}`
      const data = await apiRequest<Product[]>(path, { token })
      const normalized = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        images: normalizeImages(item.images),
        variants: normalizeVariants(item.variants),
      }))
      setProducts(normalized)

      setImageDrafts((prev) => {
        const next: Record<string, string> = {}
        normalized.forEach((item) => {
          next[item.id] = prev[item.id] || ''
        })
        return next
      })

      setVariantDrafts((prev) => {
        const next: Record<string, VariantDraft> = {}
        normalized.forEach((item) => {
          next[item.id] = prev[item.id] || { color: '', color2: '', label: '', imageUrl: '', file: null }
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

  const uploadImage = async (file: File, productCode: string) => {
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
    const uploaded = await apiRequest<UploadImageResult>('/api/admin/upload-image', {
      method: 'POST',
      token,
      body: {
        data_url: dataUrl,
        filename: file.name,
        product_code: productCode,
      },
    })
    if (!uploaded?.url) {
      throw new Error('Yuklenen dosya URL donmedi')
    }
    return uploaded.url
  }

  const resetNewProductForm = () => {
    setNewCode('')
    setNewName('')
    setNewDescription('')
    setNewCategory('bath')
    setNewPrice('')
    setNewStockQuantity('0')
    setNewImageUrl('')
    setNewImageFile(null)
    setNewSeoTitle('')
    setNewSeoDescription('')
    setNewSeoSlug('')
    setNewVisible(true)
    setNewActive(true)
    setNewColorDrafts([createEmptyColorDraft()])
  }

  const createProduct = async () => {
    if (!token) return
    setError('')
    setMessage('')

    const code = newCode.trim().toUpperCase()
    const name = newName.trim()
    const description = newDescription.trim()
    const price = parsePrice(newPrice)
    const imageUrl = newImageUrl.trim()

    if (!code || !name) {
      setError('Kod ve ad zorunlu')
      return
    }

    setCreating(true)
    let created: Product | null = null
    try {
      const images: string[] = []
      if (imageUrl) images.push(imageUrl)
      if (newImageFile) {
        const uploadedUrl = await uploadImage(newImageFile, code)
        images.push(uploadedUrl)
      }

      try {
        created = await apiRequest<Product>('/api/admin/products', {
          method: 'POST',
          token,
          body: {
            code,
            name,
            description: description || null,
            category: newCategory,
            price,
            price_visible: newVisible && price !== null,
            active: newActive,
            stock_quantity: parseStock(newStockQuantity),
            images,
            seo_title: newSeoTitle.trim() || null,
            seo_description: newSeoDescription.trim() || null,
            seo_slug: newSeoSlug.trim() || null,
          },
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Urun eklenemedi'
        setError(msg)
        return
      }

      const productId = String(created?.id || '').trim()
      const targetDrafts = newColorDrafts.filter((draft) => {
        const colorCombined = [draft.color.trim(), draft.color2.trim()].filter(Boolean).join(' / ')
        const label = draft.label.trim() || colorCombined
        return Boolean(colorCombined || label)
      })

      let createdColorCount = 0
      const variantFailures: string[] = []
      if (productId) {
        for (const draft of targetDrafts) {
          const colorPrimary = draft.color.trim()
          const colorSecondary = draft.color2.trim()
          const colorCombined = [colorPrimary, colorSecondary].filter(Boolean).join(' / ')
          const label = draft.label.trim() || colorCombined
          const url = draft.imageUrl.trim()
          try {
            let variantImageUrl = url
            if (draft.file) {
              variantImageUrl = await uploadImage(draft.file, code)
            }
            await apiRequest('/api/admin/product-variants', {
              method: 'POST',
              token,
              body: {
                product_id: productId,
                label: label || 'Renk',
                color: colorCombined || null,
                images: variantImageUrl ? [variantImageUrl] : [],
                stock: 0,
                active: true,
              },
            })
            createdColorCount += 1
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'bilinmeyen hata'
            variantFailures.push(`${label || colorCombined || 'Renk'}: ${msg}`)
          }
        }
      }

      resetNewProductForm()
      if (variantFailures.length > 0) {
        setError(`Urun eklendi ama ${variantFailures.length} renk kaydedilemedi: ${variantFailures.join('; ')}`)
        setMessage(`Urun eklendi. ${createdColorCount}/${targetDrafts.length} renk kaydedildi.`)
      } else {
        setMessage(createdColorCount > 0 ? `Urun eklendi. ${createdColorCount} renk secenegi kaydedildi.` : 'Urun eklendi')
      }
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

  const persistProductImages = async (product: Product, images: string[]) => {
    if (!token) return
    const sanitized = normalizeImages(images)
    setSavingImageId(product.id)
    setError('')
    try {
      await apiRequest('/api/admin/products', {
        method: 'PUT',
        token,
        body: {
          id: product.id,
          images: sanitized,
        },
      })
      setProducts((prev) => prev.map((item) => (item.id === product.id ? { ...item, images: sanitized } : item)))
      setMessage(`${product.code} fotograflari kaydedildi`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Foto kaydedilemedi'
      setError(msg)
      await loadProducts()
      throw err
    } finally {
      setSavingImageId(null)
    }
  }

  const appendImageToProduct = async (product: Product, imageValue: string) => {
    const safe = imageValue.trim()
    if (!safe) return
    const current = normalizeImages(product.images)
    if (current.includes(safe)) return
    const next = [...current, safe].slice(0, 24)
    setProducts((prev) => prev.map((item) => (item.id === product.id ? { ...item, images: next } : item)))
    await persistProductImages(product, next)
  }

  const removeProductImage = async (product: Product, index: number) => {
    const current = normalizeImages(product.images)
    const filtered = current.filter((_, idx) => idx !== index)
    setProducts((prev) => prev.map((item) => (item.id === product.id ? { ...item, images: filtered } : item)))
    try {
      await persistProductImages(product, filtered)
    } catch {
      // handled in persistProductImages
    }
  }

  const clearProductImages = async (product: Product) => {
    setProducts((prev) => prev.map((item) => (item.id === product.id ? { ...item, images: [] } : item)))
    try {
      await persistProductImages(product, [])
    } catch {
      // handled in persistProductImages
    }
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
          description: String(product.description || '').trim() || null,
          category: normalizeCategory(product.category),
          price: product.price,
          price_visible: Boolean(product.price_visible),
          active: Boolean(product.active),
          stock_quantity: Number(product.stock_quantity || 0),
          images: normalizeImages(product.images),
          seo_title: String(product.seo_title || '').trim() || null,
          seo_description: String(product.seo_description || '').trim() || null,
          seo_slug: String(product.seo_slug || '').trim() || null,
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

  const addImageFromDraft = async (productId: string) => {
    const draft = String(imageDrafts[productId] || '').trim()
    if (!draft) return
    const product = products.find((item) => item.id === productId)
    if (!product) return
    setError('')
    setMessage('')
    setImageDrafts((prev) => ({ ...prev, [productId]: '' }))
    try {
      await appendImageToProduct(product, draft)
    } catch {
      // handled in persistProductImages
    }
  }

  const chooseImageFile = (productId: string) => {
    setUploadTargetId(productId)
    fileInputRef.current?.click()
  }

  const onImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const targetId = uploadTargetId
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!targetId || !file) return

    const product = products.find((item) => item.id === targetId)
    if (!product) return

    setUploadingImageId(targetId)
    setError('')
    setMessage('')
    try {
      const url = await uploadImage(file, product.code)
      await appendImageToProduct(product, url)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dosya yuklenemedi'
      setError(msg)
    } finally {
      setUploadingImageId(null)
    }
  }

  const getDroppedImageFile = (event: DragEvent<HTMLElement>) => {
    const file = event.dataTransfer?.files?.[0]
    if (!file) return null
    if (!String(file.type || '').startsWith('image/')) return null
    return file
  }

  const onNewProductImageDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setNewImageDropActive(false)
    const file = getDroppedImageFile(event)
    if (!file) {
      setError('Lutfen bir gorsel dosyasi birakin')
      return
    }
    setNewImageFile(file)
    setMessage(`Yeni urun icin dosya secildi: ${file.name}`)
  }

  const onExistingProductImageDrop = async (event: DragEvent<HTMLElement>, product: Product) => {
    event.preventDefault()
    setProductImageDropActiveId(null)
    const file = getDroppedImageFile(event)
    if (!file) {
      setError('Lutfen bir gorsel dosyasi birakin')
      return
    }
    setUploadingImageId(product.id)
    setError('')
    setMessage('')
    try {
      const url = await uploadImage(file, product.code)
      await appendImageToProduct(product, url)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dosya yuklenemedi'
      setError(msg)
    } finally {
      setUploadingImageId(null)
    }
  }

  const updateVariantDraft = (productId: string, patch: Partial<VariantDraft>) => {
    setVariantDrafts((prev) => ({
      ...prev,
      [productId]: {
        color: prev[productId]?.color || '',
        color2: prev[productId]?.color2 || '',
        label: prev[productId]?.label || '',
        imageUrl: prev[productId]?.imageUrl || '',
        file: prev[productId]?.file || null,
        ...patch,
      },
    }))
  }

  const addVariantForProduct = async (product: Product) => {
    if (!token) return
    const draft = variantDrafts[product.id] || { color: '', color2: '', label: '', imageUrl: '', file: null }
    const colorPrimary = draft.color.trim()
    const colorSecondary = draft.color2.trim()
    const colorCombined = [colorPrimary, colorSecondary].filter(Boolean).join(' / ')
    const label = draft.label.trim() || colorCombined
    if (!colorCombined && !label) {
      setError('Renk adi veya etiket girin')
      return
    }

    setVariantActionLoading(product.id)
    setError('')
    setMessage('')
    try {
      let imageUrl = draft.imageUrl.trim()
      if (draft.file) {
        imageUrl = await uploadImage(draft.file, product.code)
      }
      await apiRequest('/api/admin/product-variants', {
        method: 'POST',
        token,
        body: {
          product_id: product.id,
          label: label || 'Renk',
          color: colorCombined || null,
          images: imageUrl ? [imageUrl] : [],
          stock: 0,
          active: true,
        },
      })
      updateVariantDraft(product.id, { color: '', color2: '', label: '', imageUrl: '', file: null })
      setMessage(`${product.code} icin yeni renk eklendi`)
      await loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Renk eklenemedi'
      setError(msg)
    } finally {
      setVariantActionLoading(null)
    }
  }

  const removeVariant = async (variantId: string, productCode: string) => {
    if (!token) return
    if (!window.confirm('Bu renk secenegini silmek istiyor musunuz?')) return
    setVariantActionLoading(variantId)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/product-variants', {
        method: 'DELETE',
        token,
        body: { id: variantId },
      })
      setMessage(`${productCode} renk secenegi silindi`)
      await loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Renk silinemedi'
      setError(msg)
    } finally {
      setVariantActionLoading(null)
    }
  }

  const runBulkPriceUpdate = async () => {
    if (!token) return
    const amount = parsePrice(bulkPriceAmount)
    if (amount === null) {
      setError('Toplu fiyat islemi icin gecerli tutar girin')
      return
    }
    setBulkPriceLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await apiRequest<PriceBulkResult>('/api/admin/products-price-bulk', {
        method: 'POST',
        token,
        body: {
          mode: bulkPriceMode,
          amount,
          category: bulkPriceCategory,
        },
      })
      setMessage(`Toplu fiyat guncelleme tamamlandi. Guncellenen urun: ${Number(result?.updated || 0)}`)
      await loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Toplu fiyat guncelleme basarisiz'
      setError(msg)
    } finally {
      setBulkPriceLoading(false)
    }
  }

  const addColorDraftRow = () => {
    setNewColorDrafts((prev) => [...prev, createEmptyColorDraft()])
  }

  const updateColorDraft = (draftId: string, patch: Partial<ColorDraft>) => {
    setNewColorDrafts((prev) => prev.map((item) => (item.id === draftId ? { ...item, ...patch } : item)))
  }

  const removeColorDraft = (draftId: string) => {
    setNewColorDrafts((prev) => {
      if (prev.length <= 1) return prev.map((item) => (item.id === draftId ? createEmptyColorDraft() : item))
      return prev.filter((item) => item.id !== draftId)
    })
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>
        Urun, renk, fiyat, SEO ve foto yonetimi
      </h2>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onImageFileChange}
      />

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Yeni urun ekle</h3>
        <div style={newGridStyle}>
          <input value={newCode} onChange={(evt) => setNewCode(evt.target.value)} placeholder="Kod" style={inputStyle} />
          <input value={newName} onChange={(evt) => setNewName(evt.target.value)} placeholder="Urun adi" style={inputStyle} />
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
          <input value={newPrice} onChange={(evt) => setNewPrice(evt.target.value)} placeholder="Fiyat" style={inputStyle} />
          <input
            value={newStockQuantity}
            onChange={(evt) => setNewStockQuantity(String(parseStock(evt.target.value)))}
            placeholder="Stok adedi"
            type="number"
            min={0}
            style={inputStyle}
          />
          <input
            value={newImageUrl}
            onChange={(evt) => setNewImageUrl(evt.target.value)}
            placeholder="Ilk foto URL (opsiyonel)"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
          <input
            value={newSeoTitle}
            onChange={(evt) => setNewSeoTitle(evt.target.value)}
            placeholder="SEO Title"
            style={inputStyle}
          />
          <input
            value={newSeoDescription}
            onChange={(evt) => setNewSeoDescription(evt.target.value)}
            placeholder="SEO Description"
            style={inputStyle}
          />
          <input
            value={newSeoSlug}
            onChange={(evt) => setNewSeoSlug(evt.target.value)}
            placeholder="URL Slug (or: bth-001-sabunluk)"
            style={inputStyle}
          />
        </div>

        <textarea
          value={newDescription}
          onChange={(evt) => setNewDescription(evt.target.value)}
          placeholder="Urun aciklamasi (opsiyonel)"
          style={{ ...inputStyle, width: '100%', minHeight: '78px', resize: 'vertical', marginTop: '10px' }}
        />

        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label style={checkLabelStyle}>
            Ilk foto dosya:
            <input
              type="file"
              accept="image/*"
              onChange={(evt) => setNewImageFile(evt.target.files?.[0] || null)}
              style={{ marginLeft: '6px' }}
            />
          </label>
          {newImageFile && <span style={mutedMiniText}>{newImageFile.name}</span>}
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setNewImageDropActive(true)
          }}
          onDragLeave={() => setNewImageDropActive(false)}
          onDrop={onNewProductImageDrop}
          style={{
            marginTop: '10px',
            border: `1px dashed ${newImageDropActive ? '#60a5fa' : '#334155'}`,
            background: newImageDropActive ? 'rgba(59,130,246,0.12)' : 'rgba(15,23,42,0.45)',
            borderRadius: '8px',
            padding: '10px',
            color: '#93c5fd',
            fontSize: '12px',
          }}
        >
          Dosya surukle-birak: yeni urun ana fotografi
        </div>

        <div style={{ marginTop: '14px', border: '1px dashed #334155', borderRadius: '8px', padding: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: '13px' }}>Renk secenekleri ve renge gore foto</h4>
            <button type="button" onClick={addColorDraftRow} style={miniButtonStyle}>
              + Renk satiri
            </button>
          </div>
          {newColorDrafts.map((draft) => (
            <div key={draft.id} style={colorRowStyle}>
              <input
                value={draft.color}
                onChange={(evt) => updateColorDraft(draft.id, { color: evt.target.value })}
                placeholder="Renk (or: Siyah)"
                style={inputStyle}
              />
              <input
                value={draft.color2}
                onChange={(evt) => updateColorDraft(draft.id, { color2: evt.target.value })}
                placeholder="2. Renk (opsiyonel, or: Gri)"
                style={inputStyle}
              />
              <input
                value={draft.label}
                onChange={(evt) => updateColorDraft(draft.id, { label: evt.target.value })}
                placeholder="Etiket (opsiyonel)"
                style={inputStyle}
              />
              <input
                value={draft.imageUrl}
                onChange={(evt) => updateColorDraft(draft.id, { imageUrl: evt.target.value })}
                placeholder="Renk foto URL (opsiyonel)"
                style={inputStyle}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(evt) => updateColorDraft(draft.id, { file: evt.target.files?.[0] || null })}
                style={inputStyle}
              />
              <button type="button" onClick={() => removeColorDraft(draft.id)} style={dangerMiniStyle}>
                Kaldir
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '14px', marginTop: '10px', alignItems: 'center' }}>
          <label style={checkLabelStyle}>
            <input type="checkbox" checked={newVisible} onChange={(evt) => setNewVisible(evt.target.checked)} />
            Fiyat gorunsun
          </label>
          <label style={checkLabelStyle}>
            <input type="checkbox" checked={newActive} onChange={(evt) => setNewActive(evt.target.checked)} />
            Aktif
          </label>
          <button onClick={() => void createProduct()} disabled={creating} style={primaryButton}>
            {creating ? 'Ekleniyor...' : 'Urun ekle'}
          </button>
        </div>
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Toplu fiyat guncelle</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
          <select value={bulkPriceMode} onChange={(evt) => setBulkPriceMode(evt.target.value as typeof bulkPriceMode)} style={inputStyle}>
            <option value="increase_percent">Yuzde artir / azalt</option>
            <option value="increase_fixed">Sabit tutar artir / azalt</option>
            <option value="set">Direkt fiyata cek</option>
          </select>
          <input
            value={bulkPriceAmount}
            onChange={(evt) => setBulkPriceAmount(evt.target.value)}
            placeholder={bulkPriceMode === 'increase_percent' ? 'Oran (or: 10 veya -5)' : 'Tutar (or: 100)'}
            style={inputStyle}
          />
          <select
            value={bulkPriceCategory}
            onChange={(evt) => setBulkPriceCategory(evt.target.value as 'all' | Category)}
            style={inputStyle}
          >
            <option value="all">Tum kategoriler</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button onClick={() => void runBulkPriceUpdate()} disabled={bulkPriceLoading} style={secondaryButton}>
            {bulkPriceLoading ? 'Guncelleniyor...' : 'Toplu fiyat uygula'}
          </button>
        </div>
      </div>

      <div style={panelStyle}>
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
        ) : !hasProducts ? (
          <p style={{ color: '#94a3b8' }}>Urun bulunamadi.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Urun</th>
                  <th style={thStyle}>Fiyat ve SEO</th>
                  <th style={thStyle}>Fotolar</th>
                  <th style={thStyle}>Renkler</th>
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const photos = normalizeImages(product.images)
                  const variants = normalizeVariants(product.variants)
                  const variantDraft = variantDrafts[product.id] || { color: '', color2: '', label: '', imageUrl: '', file: null }
                  return (
                    <tr key={product.id}>
                      <td style={tdStyle}>
                        <input
                          value={product.code || ''}
                          onChange={(evt) => updateLocalProduct(product.id, { code: evt.target.value.toUpperCase() })}
                          style={{ ...inputStyle, width: '120px', marginBottom: '6px' }}
                        />
                        <input
                          value={product.name || ''}
                          onChange={(evt) => updateLocalProduct(product.id, { name: evt.target.value })}
                          style={{ ...inputStyle, width: '230px', marginBottom: '6px' }}
                        />
                        <select
                          value={normalizeCategory(product.category)}
                          onChange={(evt) => updateLocalProduct(product.id, { category: normalizeCategory(evt.target.value) })}
                          style={{ ...inputStyle, width: '120px', marginBottom: '6px' }}
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={String(product.description || '')}
                          onChange={(evt) => updateLocalProduct(product.id, { description: evt.target.value })}
                          style={{ ...inputStyle, width: '240px', minHeight: '64px', resize: 'vertical' }}
                        />
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
                          style={{ ...inputStyle, width: '120px', marginBottom: '6px' }}
                        />
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px' }}>
                          {formatPrice(product.price)}
                        </div>
                        <input
                          value={Number(product.stock_quantity || 0)}
                          onChange={(evt) =>
                            updateLocalProduct(product.id, {
                              stock_quantity: parseStock(evt.target.value),
                            })
                          }
                          placeholder="Stok"
                          type="number"
                          min={0}
                          style={{ ...inputStyle, width: '120px', marginBottom: '6px' }}
                        />
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px' }}>
                          Stok: {Number(product.stock_quantity || 0)}
                        </div>
                        <input
                          value={String(product.seo_slug || '')}
                          onChange={(evt) => updateLocalProduct(product.id, { seo_slug: evt.target.value })}
                          placeholder="URL slug"
                          style={{ ...inputStyle, width: '220px', marginBottom: '6px' }}
                        />
                        <input
                          value={String(product.seo_title || '')}
                          onChange={(evt) => updateLocalProduct(product.id, { seo_title: evt.target.value })}
                          placeholder="SEO title"
                          style={{ ...inputStyle, width: '220px', marginBottom: '6px' }}
                        />
                        <textarea
                          value={String(product.seo_description || '')}
                          onChange={(evt) => updateLocalProduct(product.id, { seo_description: evt.target.value })}
                          placeholder="SEO description"
                          style={{ ...inputStyle, width: '220px', minHeight: '58px', resize: 'vertical' }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {photos.slice(0, 8).map((src, idx) => (
                            <div key={`${product.id}-img-${idx}`} style={{ position: 'relative' }}>
                              <img src={src} alt={`${product.code}-${idx + 1}`} style={thumbStyle} />
                              <button
                                type="button"
                                onClick={() => void removeProductImage(product, idx)}
                                style={removeImageButtonStyle}
                                title="Sil"
                                disabled={uploadingImageId === product.id || savingImageId === product.id}
                              >
                                x
                              </button>
                            </div>
                          ))}
                          {!photos.length && <span style={{ color: '#64748b', fontSize: '11px' }}>Foto yok</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <input
                            value={imageDrafts[product.id] || ''}
                            onChange={(evt) => setImageDrafts((prev) => ({ ...prev, [product.id]: evt.target.value }))}
                            placeholder="Foto URL"
                            style={{ ...inputStyle, width: '170px' }}
                          />
                          <button
                            type="button"
                            onClick={() => void addImageFromDraft(product.id)}
                            style={miniButtonStyle}
                            disabled={uploadingImageId === product.id || savingImageId === product.id}
                          >
                            URL ekle
                          </button>
                          <button
                            type="button"
                            onClick={() => chooseImageFile(product.id)}
                            style={miniButtonStyle}
                            disabled={uploadingImageId === product.id || savingImageId === product.id}
                          >
                            {uploadingImageId === product.id ? 'Yukleniyor...' : 'Dosya'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void clearProductImages(product)}
                            style={dangerMiniStyle}
                            disabled={uploadingImageId === product.id || savingImageId === product.id}
                          >
                            Temizle
                          </button>
                        </div>
                        <div
                          onDragOver={(event) => {
                            event.preventDefault()
                            setProductImageDropActiveId(product.id)
                          }}
                          onDragLeave={() => setProductImageDropActiveId((prev) => (prev === product.id ? null : prev))}
                          onDrop={(event) => void onExistingProductImageDrop(event, product)}
                          style={{
                            marginTop: '8px',
                            border: `1px dashed ${productImageDropActiveId === product.id ? '#60a5fa' : '#334155'}`,
                            background: productImageDropActiveId === product.id ? 'rgba(59,130,246,0.12)' : 'rgba(15,23,42,0.45)',
                            borderRadius: '6px',
                            padding: '8px',
                            color: '#93c5fd',
                            fontSize: '11px',
                          }}
                        >
                          Bu urune foto eklemek icin dosyayi buraya birakin
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>
                          {photos.length} foto {savingImageId === product.id ? '(kaydediliyor...)' : ''}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {variants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => void removeVariant(variant.id, product.code)}
                              style={variantTagStyle}
                              title="Sil"
                            >
                              {getVariantLabel(variant)} x
                            </button>
                          ))}
                          {!variants.length && <span style={{ color: '#64748b', fontSize: '11px' }}>Renk yok</span>}
                        </div>
                        <input
                          value={variantDraft.color}
                          onChange={(evt) => updateVariantDraft(product.id, { color: evt.target.value })}
                          placeholder="Renk adi"
                          style={{ ...inputStyle, width: '160px', marginBottom: '6px' }}
                        />
                        <input
                          value={variantDraft.color2}
                          onChange={(evt) => updateVariantDraft(product.id, { color2: evt.target.value })}
                          placeholder="2. renk (opsiyonel)"
                          style={{ ...inputStyle, width: '160px', marginBottom: '6px' }}
                        />
                        <input
                          value={variantDraft.label}
                          onChange={(evt) => updateVariantDraft(product.id, { label: evt.target.value })}
                          placeholder="Etiket (opsiyonel)"
                          style={{ ...inputStyle, width: '160px', marginBottom: '6px' }}
                        />
                        <input
                          value={variantDraft.imageUrl}
                          onChange={(evt) => updateVariantDraft(product.id, { imageUrl: evt.target.value })}
                          placeholder="Renk foto URL"
                          style={{ ...inputStyle, width: '160px', marginBottom: '6px' }}
                        />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(evt) => updateVariantDraft(product.id, { file: evt.target.files?.[0] || null })}
                          style={{ ...inputStyle, width: '170px', marginBottom: '6px' }}
                        />
                        <button
                          type="button"
                          onClick={() => void addVariantForProduct(product)}
                          style={miniButtonStyle}
                          disabled={variantActionLoading === product.id}
                        >
                          {variantActionLoading === product.id ? 'Ekleniyor...' : 'Renk ekle'}
                        </button>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button onClick={() => void saveProduct(product)} disabled={savingId === product.id} style={secondaryButton}>
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

const newGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 2fr',
  gap: '10px',
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

const colorRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr 1.4fr 1.2fr auto',
  gap: '8px',
  marginBottom: '8px',
}

const variantTagStyle: CSSProperties = {
  background: '#1e3a8a',
  color: '#bfdbfe',
  border: '1px solid #3b82f6',
  borderRadius: '999px',
  padding: '4px 8px',
  fontSize: '11px',
  cursor: 'pointer',
}

const mutedMiniText: CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
}

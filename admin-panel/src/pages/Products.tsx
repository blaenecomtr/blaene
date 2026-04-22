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
  material?: string | null
  thickness?: string | null
  dims?: string | null
  description?: string | null
  category: Category | string
  price: number | null
  price_visible: boolean
  active: boolean
  archived?: boolean
  images?: string[]
  stock_quantity?: number | null
  seo_title?: string | null
  seo_description?: string | null
  seo_slug?: string | null
  variants?: ProductVariant[]
  discount_percent?: number | null
  discount_promo_id?: string | null
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
  files: File[]
}

interface VariantDraft {
  color: string
  color2: string
  label: string
  imageUrl: string
  file: File | null
  files: File[]
  existingImages: string[]
  editingVariantId: string | null
}

interface PriceBulkResult {
  updated: number
}

interface PromotionRow {
  id: string
  code?: string | null
  target_scope?: string | null
  target_value?: string | null
  discount_type?: string | null
  discount_value?: number | string | null
  is_active?: boolean
}

const CATEGORY_OPTIONS: Category[] = ['bath', 'forge', 'industrial']
const MATERIAL_OPTIONS = ['304 Paslanmaz Krom', 'Dkp', 'Galvaniz Çelik']
const THICKNESS_OPTIONS = ['1mm', '1.2mm', '1.5mm', '2mm', '2.5mm', '3mm', '4mm']
const COLOR_OPTIONS = ['Inox', 'Beyaz', 'Siyah']
const MAX_UPLOAD_SOURCE_BYTES = 6 * 1024 * 1024
const MAX_SAFE_DATAURL_LENGTH = 3_800_000

function normalizeCategory(input: string): Category {
  const value = input.trim().toLowerCase()
  if (value === 'forge') return 'forge'
  if (value === 'industrial') return 'industrial'
  return 'bath'
}

function optionListWithCurrent(options: string[], current: string): string[] {
  const value = String(current || '').trim()
  if (!value) return options
  const exists = options.some((option) => option.toLowerCase() === value.toLowerCase())
  return exists ? options : [value, ...options]
}

function parseColorPrimary(input: string): string {
  const parts = String(input || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
  return parts[0] || ''
}

function parsePrice(input: string): number | null {
  const cleaned = input.trim().replace(',', '.')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePriceValue(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null
  const parsed = Number(String(input).trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseBooleanValue(input: unknown, fallback = false): boolean {
  if (typeof input === 'boolean') return input
  if (typeof input === 'number') return input !== 0
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return fallback
}

function parseStock(input: string): number {
  const parsed = Number(String(input || '').trim())
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

function parseStockDraftValue(input: string): number | null {
  const cleaned = String(input || '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  if (parsed < 0) return null
  return Math.floor(parsed)
}

function normalizeDiscountPercent(input: unknown): number | null {
  const parsed = Number(String(input ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(parsed)) return null
  if (parsed <= 0) return null
  return Math.min(95, Math.max(0, Math.round(parsed * 100) / 100))
}

function calculateDiscountedPrice(price: number | null, discountPercent: number | null): number | null {
  if (!Number.isFinite(Number(price)) || Number(price) <= 0) return null
  const percent = normalizeDiscountPercent(discountPercent)
  if (!percent) return null
  const discounted = Number(price) * (1 - percent / 100)
  return Math.max(0, Math.round(discounted * 100) / 100)
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
    files: [],
  }
}

function buildProductDiscountMap(rows: PromotionRow[]): Record<string, { id: string; percent: number }> {
  const map: Record<string, { id: string; percent: number }> = {}
  for (const row of rows || []) {
    if (!row || row.is_active === false) continue
    if (String(row.discount_type || '').toLowerCase() !== 'percent') continue
    const percent = normalizeDiscountPercent(row.discount_value)
    if (!percent) continue

    const scope = String(row.target_scope || '').trim().toLowerCase()
    const targetValue = String(row.target_value || '').trim().toUpperCase()
    const codeValue = String(row.code || '').trim().toUpperCase()

    let key = ''
    if (scope === 'product_code' && targetValue) {
      key = targetValue
    } else if (codeValue.startsWith('PRD-')) {
      key = codeValue.replace(/^PRD-/, '')
    }
    if (!key) continue

    if (!map[key]) {
      map[key] = { id: String(row.id || ''), percent }
    }
  }
  return map
}

function createEmptyVariantDraft(): VariantDraft {
  return {
    color: '',
    color2: '',
    label: '',
    imageUrl: '',
    file: null,
    files: [],
    existingImages: [],
    editingVariantId: null,
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
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [listPriceDrafts, setListPriceDrafts] = useState<Record<string, string>>({})
  const [listStockDrafts, setListStockDrafts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
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
  const [newMaterial, setNewMaterial] = useState('')
  const [newThickness, setNewThickness] = useState('')
  const [newDims, setNewDims] = useState('')
  const [newCategory, setNewCategory] = useState<Category | ''>('')
  const [newPrice, setNewPrice] = useState('')
  const [newStockQuantity, setNewStockQuantity] = useState('0')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newImageFile, setNewImageFile] = useState<File | null>(null)
  const [newMainImageColor, setNewMainImageColor] = useState('')
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
    if (category === '') {
      setProducts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      params.set('category', category)
      if (showArchived) params.set('archived', 'true')
      params.set('page_size', '1000')
      params.set('_t', String(Date.now()))
      const path = `/api/admin/products?${params.toString()}`
      const data = await apiRequest<Product[]>(path, { token })
      let discountMap: Record<string, { id: string; percent: number }> = {}
      try {
        const promotions = await apiRequest<PromotionRow[]>('/api/admin/promotions?page_size=5000', { token })
        discountMap = buildProductDiscountMap(Array.isArray(promotions) ? promotions : [])
      } catch {
        discountMap = {}
      }

      const normalized = (Array.isArray(data) ? data : []).map((item) => {
        const normalizedPrice = parsePriceValue(item.price)
        const codeKey = String(item.code || '').trim().toUpperCase()
        const discountEntry = discountMap[codeKey]
        return {
          ...item,
          price: normalizedPrice,
          price_visible: normalizedPrice !== null && parseBooleanValue(item.price_visible, false),
          active: parseBooleanValue(item.active, true),
          images: normalizeImages(item.images),
          variants: normalizeVariants(item.variants),
          discount_percent: discountEntry?.percent ?? null,
          discount_promo_id: discountEntry?.id || null,
        }
      })
      setProducts(normalized)
      setListPriceDrafts(() => {
        const next: Record<string, string> = {}
        normalized.forEach((item) => {
          next[item.id] = item.price === null || item.price === undefined ? '' : String(item.price)
        })
        return next
      })
      setListStockDrafts(() => {
        const next: Record<string, string> = {}
        normalized.forEach((item) => {
          next[item.id] = String(Number(item.stock_quantity || 0))
        })
        return next
      })

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
          next[item.id] = prev[item.id] || createEmptyVariantDraft()
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
  }, [category, showArchived])

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
    setNewMaterial('')
    setNewThickness('')
    setNewDims('')
    setNewCategory('')
    setNewPrice('')
    setNewStockQuantity('0')
    setNewImageUrl('')
    setNewImageFile(null)
    setNewMainImageColor('')
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
    const material = newMaterial.trim()
    const thickness = newThickness.trim()
    const dims = newDims.trim()
    const price = parsePrice(newPrice)
    const imageUrl = newImageUrl.trim()
    const mainImageColor = newMainImageColor.trim()

    if (!code || !name || !material || !thickness || !dims || !newCategory) {
      setError('Kod, urun, malzeme, kalinlik, olculer ve kategori zorunlu')
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
            material,
            thickness,
            dims,
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
        const colorName = draft.color.trim()
        return Boolean(colorName)
      })

      if (images.length > 0 && mainImageColor) {
        const hasMainColorDraft = targetDrafts.some((draft) => {
          const colorName = draft.color.trim().toLowerCase()
          const probe = mainImageColor.toLowerCase()
          return colorName === probe
        })
        if (!hasMainColorDraft) {
          targetDrafts.unshift({
            id: `main-image-${Date.now()}`,
            color: mainImageColor,
            color2: '',
            label: mainImageColor,
            imageUrl: images[0],
            file: null,
            files: [],
          })
        } else {
          targetDrafts.forEach((draft) => {
            const colorName = draft.color.trim().toLowerCase()
            const probe = mainImageColor.toLowerCase()
            const isTarget = colorName === probe
            if (isTarget && !draft.file && !(draft.files || []).length && !draft.imageUrl.trim()) {
              draft.imageUrl = images[0]
            }
          })
        }
      }

      let createdColorCount = 0
      const variantFailures: string[] = []
      if (productId) {
        for (const draft of targetDrafts) {
          const colorName = draft.color.trim()
          const url = draft.imageUrl.trim()
          try {
            const variantImages: string[] = []
            if (url) variantImages.push(url)
            const filesToUpload = (draft.files || []).length > 0
              ? (draft.files || [])
              : draft.file
                ? [draft.file]
                : []
            for (const item of filesToUpload) {
              const uploaded = await uploadImage(item, code)
              variantImages.push(uploaded)
            }
            const mergedImages = Array.from(new Set(variantImages.filter(Boolean))).slice(0, 24)
            if (!mergedImages.length) {
              throw new Error('Foto gerekli')
            }
            await apiRequest('/api/admin/product-variants', {
              method: 'POST',
              token,
              body: {
                product_id: productId,
                label: colorName || 'Renk',
                color: colorName || null,
                images: mergedImages,
                stock: 0,
                active: true,
              },
            })
            createdColorCount += 1
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'bilinmeyen hata'
            variantFailures.push(`${colorName || 'Renk'}: ${msg}`)
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

  const getListPriceDraft = (product: Product) => {
    if (Object.prototype.hasOwnProperty.call(listPriceDrafts, product.id)) {
      return String(listPriceDrafts[product.id] || '')
    }
    return product.price === null || product.price === undefined ? '' : String(product.price)
  }

  const getListStockDraft = (product: Product) => {
    if (Object.prototype.hasOwnProperty.call(listStockDrafts, product.id)) {
      return String(listStockDrafts[product.id] || '')
    }
    return String(Number(product.stock_quantity || 0))
  }

  const isListRowDirty = (product: Product) => {
    const priceDraft = getListPriceDraft(product).trim()
    const stockDraft = getListStockDraft(product).trim()

    const priceDirty = priceDraft
      ? (() => {
          const parsed = parsePrice(priceDraft)
          return parsed !== null && parsed !== product.price
        })()
      : product.price !== null

    const parsedStock = parseStockDraftValue(stockDraft)
    const currentStock = Number(product.stock_quantity || 0)
    const stockDirty = parsedStock !== null && parsedStock !== currentStock
    return priceDirty || stockDirty
  }

  const saveListPrice = async (product: Product) => {
    const rawPriceDraft = getListPriceDraft(product).trim()
    const parsedPrice = parsePrice(rawPriceDraft)
    if (rawPriceDraft && parsedPrice === null) {
      setError(`${product.code} icin gecersiz fiyat`)
      return
    }
    const rawStockDraft = getListStockDraft(product).trim()
    const parsedStock = parseStockDraftValue(rawStockDraft)
    if (parsedStock === null) {
      setError(`${product.code} icin gecersiz stok`)
      return
    }
    const patched: Product = {
      ...product,
      price: parsedPrice,
      price_visible: parsedPrice !== null,
      stock_quantity: parsedStock,
    }
    await saveProduct(patched)
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

  const upsertProductDiscount = async (product: Product, code: string, name: string) => {
    if (!token) return
    const discountPercent = normalizeDiscountPercent(product.discount_percent)
    const promoId = String(product.discount_promo_id || '').trim()

    if (!discountPercent) {
      if (promoId) {
        await apiRequest('/api/admin/promotions', {
          method: 'DELETE',
          token,
          body: { id: promoId },
        })
      }
      return
    }

    const payload = {
      code: `PRD-${code}`,
      title: `${name} urun indirimi`,
      description: `${code} urunu icin otomatik tanimlanan indirim`,
      discount_type: 'percent',
      discount_value: discountPercent,
      is_active: true,
      target_scope: 'product_code',
      target_value: code,
    }

    if (promoId) {
      await apiRequest('/api/admin/promotions', {
        method: 'PUT',
        token,
        body: {
          id: promoId,
          ...payload,
        },
      })
      return
    }

    const created = await apiRequest<PromotionRow>('/api/admin/promotions', {
      method: 'POST',
      token,
      body: payload,
    })
    if (created?.id) {
      updateLocalProduct(product.id, { discount_promo_id: String(created.id) })
    }
  }

  const saveProduct = async (product: Product) => {
    if (!token) return
    setError('')
    setMessage('')

    const requiredFieldState = {
      code: String(product.code || '').trim().toUpperCase(),
      name: String(product.name || '').trim(),
      material: String(product.material || '').trim(),
      thickness: String(product.thickness || '').trim(),
      dims: String(product.dims || '').trim(),
      category: normalizeCategory(String(product.category || '')),
    }

    if (!requiredFieldState.code || !requiredFieldState.name || !requiredFieldState.material || !requiredFieldState.thickness || !requiredFieldState.dims) {
      setError(`${String(product.code || '').trim() || 'Urun'} icin urun, malzeme, kalinlik, olculer ve kategori zorunlu`)
      return
    }

    setSavingId(product.id)
    try {
      await apiRequest('/api/admin/products', {
        method: 'PUT',
        token,
        body: {
          id: product.id,
          code: requiredFieldState.code,
          name: requiredFieldState.name,
          material: requiredFieldState.material,
          thickness: requiredFieldState.thickness,
          dims: requiredFieldState.dims,
          category: requiredFieldState.category,
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

      let discountSaveError = ''
      try {
        await upsertProductDiscount(product, requiredFieldState.code, requiredFieldState.name)
      } catch (discountErr: unknown) {
        discountSaveError = discountErr instanceof Error ? discountErr.message : 'indirim kaydedilemedi'
      }

      if (discountSaveError) {
        setError(`${requiredFieldState.code} guncellendi, fakat indirim kaydi basarisiz: ${discountSaveError}`)
      } else {
        setMessage(`${requiredFieldState.code} guncellendi`)
      }
      if (editingProductId === product.id) setEditingProductId(null)
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

  const restoreProduct = async (id: string, code: string) => {
    if (!token) return
    setDeletingId(id)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/admin/products', {
        method: 'PUT',
        token,
        body: { id, archived: false },
      })
      setMessage(`${code} canliya alindi`)
      setProducts((prev) => prev.filter((item) => item.id !== id))
      void loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Canliya alma islemi basarisiz'
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
        files: prev[productId]?.files || [],
        existingImages: prev[productId]?.existingImages || [],
        editingVariantId: prev[productId]?.editingVariantId || null,
        ...patch,
      },
    }))
  }

  const startVariantEdit = (product: Product, variant: ProductVariant) => {
    const colorPrimary = parseColorPrimary(String(variant.color || ''))
    const existingImages = normalizeImages(variant.images)
    const imageUrl = existingImages[0] || ''
    updateVariantDraft(product.id, {
      color: colorPrimary,
      color2: '',
      label: colorPrimary || String(variant.label || '').trim(),
      imageUrl,
      file: null,
      files: [],
      existingImages,
      editingVariantId: variant.id,
    })
    setEditingProductId(product.id)
    setMessage(`${product.code} icin ${getVariantLabel(variant)} duzenleme moduna alindi`)
  }

  const clearVariantDraft = (productId: string) => {
    updateVariantDraft(productId, createEmptyVariantDraft())
  }

  const addVariantForProduct = async (product: Product) => {
    if (!token) return
    const draft = variantDrafts[product.id] || createEmptyVariantDraft()
    const colorName = draft.color.trim()
    const isEditMode = Boolean(draft.editingVariantId)
    if (!colorName) {
      setError('Lutfen en az bir renk secin')
      return
    }

    setVariantActionLoading(product.id)
    setError('')
    setMessage('')
    try {
      const imageUrls: string[] = []
      if (isEditMode) {
        imageUrls.push(...normalizeImages(draft.existingImages))
      }

      const manualUrl = draft.imageUrl.trim()
      if (manualUrl) {
        imageUrls.push(manualUrl)
      }

      const filesToUpload = (draft.files || []).length > 0
        ? (draft.files || [])
        : draft.file
          ? [draft.file]
          : []
      for (const item of filesToUpload) {
        const uploaded = await uploadImage(item, product.code)
        imageUrls.push(uploaded)
      }

      const mergedImages = Array.from(new Set(imageUrls.filter(Boolean))).slice(0, 24)
      if (!mergedImages.length) {
        setError('Renk icin foto ekleyin')
        return
      }
      await apiRequest('/api/admin/product-variants', {
        method: isEditMode ? 'PUT' : 'POST',
        token,
        body: isEditMode
          ? {
              id: draft.editingVariantId,
              label: colorName || 'Renk',
              color: colorName || null,
              images: mergedImages,
              active: true,
            }
          : {
              product_id: product.id,
              label: colorName || 'Renk',
              color: colorName || null,
              images: mergedImages,
              stock: 0,
              active: true,
            },
      })
      clearVariantDraft(product.id)
      setMessage(isEditMode ? `${product.code} renk secenegi guncellendi` : `${product.code} icin yeni renk kaydedildi`)
      await loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (isEditMode ? 'Renk guncellenemedi' : 'Renk eklenemedi')
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

  const handleSaveAll = async () => {
    if (!editingProductId) {
      setMessage('Duzenlenecek urun secin')
      return
    }
    const editingProduct = products.find((p) => p.id === editingProductId)
    if (!editingProduct) return

    setError('')
    setMessage('')
    const variantDraft = variantDrafts[editingProduct.id]
    const hasPendingVariant = variantDraft && variantDraft.color.trim()

    try {
      // Save product first
      await saveProduct(editingProduct)

      // Save pending variant if exists
      if (hasPendingVariant) {
        await addVariantForProduct(editingProduct)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kayit islemi basarisiz'
      setError(msg)
    }
  }

  const openProductDetail = (product: Product) => {
    setSelectedProductId(product.id)
    setEditingProductId(product.id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', margin: 0, color: '#fff' }}>
          Urun, renk, fiyat, SEO ve foto yonetimi
        </h2>
        {editingProductId && (
          <button
            onClick={handleSaveAll}
            style={{
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Tumunu Kaydet
          </button>
        )}
      </div>

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
          <input value={newCode} onChange={(evt) => setNewCode(evt.target.value)} placeholder="Kod *" style={inputStyle} />
          <input value={newName} onChange={(evt) => setNewName(evt.target.value)} placeholder="Urun *" style={inputStyle} />
          <select
            value={newMaterial}
            onChange={(evt) => setNewMaterial(evt.target.value)}
            style={inputStyle}
          >
            <option value="">Malzeme secin *</option>
            {MATERIAL_OPTIONS.map((option) => (
              <option key={`new-material-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={newThickness}
            onChange={(evt) => setNewThickness(evt.target.value)}
            style={inputStyle}
          >
            <option value="">Kalinlik secin *</option>
            {THICKNESS_OPTIONS.map((option) => (
              <option key={`new-thickness-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            value={newDims}
            onChange={(evt) => setNewDims(evt.target.value)}
            placeholder="Olculer *"
            style={inputStyle}
          />
          <select
            value={newCategory}
            onChange={(evt) => setNewCategory(evt.target.value ? normalizeCategory(evt.target.value) : '')}
            style={inputStyle}
          >
            <option value="">Kategori secin *</option>
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
          <select
            value={newMainImageColor}
            onChange={(evt) => setNewMainImageColor(evt.target.value)}
            style={{ ...inputStyle, minWidth: '170px' }}
          >
            <option value="">Ilk fotonun rengi (opsiyonel)</option>
            {COLOR_OPTIONS.map((option) => (
              <option key={`main-color-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
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
            <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: '13px' }}>Renk sec + Foto ekle</h4>
            <button type="button" onClick={addColorDraftRow} style={miniButtonStyle}>
              + Renk satiri
            </button>
          </div>
          <div style={{ ...mutedMiniText, marginBottom: '8px' }}>
            Not: Bir renk icin birden fazla foto secmek icin dosya secicisinde coklu secim yapabilirsiniz.
          </div>
          {newColorDrafts.map((draft) => (
            <div key={draft.id} style={colorRowStyle}>
              <select
                value={draft.color}
                onChange={(evt) => updateColorDraft(draft.id, { color: evt.target.value })}
                style={inputStyle}
              >
                <option value="">Renk sec *</option>
                {COLOR_OPTIONS.map((option) => (
                  <option key={`${draft.id}-color-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(evt) =>
                  updateColorDraft(draft.id, {
                    file: evt.target.files?.[0] || null,
                    files: Array.from(evt.target.files || []),
                  })
                }
                style={inputStyle}
              />
              <div style={mutedMiniText}>
                {draft.files?.length ? `${draft.files.length} foto secildi` : 'Foto ekle *'}
              </div>
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
            onChange={(evt) => setCategory(evt.target.value as Category | '')}
            style={inputStyle}
          >
            <option value="">Kategori seçin</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button onClick={() => void loadProducts()} style={secondaryButton}>
            Listeyi yenile
          </button>
          <button
            onClick={() => setShowArchived(false)}
            style={{
              ...secondaryButton,
              background: !showArchived ? '#0f766e' : '#475569',
            }}
          >
            Aktif
          </button>
          <button
            onClick={() => setShowArchived(true)}
            style={{
              ...secondaryButton,
              background: showArchived ? '#7c2d12' : '#475569',
            }}
          >
            Arsiv
          </button>
        </div>

        {message && <div style={okAlertStyle}>{message}</div>}
        {error && <div style={errorAlertStyle}>{error}</div>}

        {category === '' ? (
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Lutfen kategori seciniz</p>
        ) : selectedProductId === null
          ? loading ? (
            <p style={{ color: '#94a3b8' }}>Urunler yukleniyor...</p>
          ) : !hasProducts ? (
            <p style={{ color: '#94a3b8' }}>Urun bulunamadi.</p>
          ) : (
            <div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={saveColumnHeaderStyle}>Kaydet</th>
                  <th style={thStyle}>Foto</th>
                  <th style={thStyle}>Kod</th>
                  <th style={thStyle}>Ad</th>
                  <th style={thStyle}>Fiyat</th>
                  <th style={thStyle}>Stok</th>
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const photos = normalizeImages(product.images)
                  const listDraft = getListPriceDraft(product)
                  const listDraftNumber = parsePrice(listDraft)
                  const draftInvalid = listDraft.trim().length > 0 && listDraftNumber === null
                  const stockDraft = getListStockDraft(product)
                  const stockDraftNumber = parseStockDraftValue(stockDraft)
                  const stockInvalid = stockDraftNumber === null
                  const draftDirty = isListRowDirty(product)
                  return (
                    <tr key={product.id}>
                      <td style={saveColumnCellStyle}>
                        <button
                          type="button"
                          onClick={() => void saveListPrice(product)}
                          disabled={savingId === product.id || !draftDirty || draftInvalid || stockInvalid}
                          style={{
                            ...saveListButtonStyle,
                            background: draftDirty ? '#0f766e' : '#334155',
                            color: draftDirty ? '#d1fae5' : '#e2e8f0',
                          }}
                        >
                          {savingId === product.id ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        {photos.length > 0 && <img src={photos[0]} alt={product.name} style={thumbStyle} />}
                      </td>
                      <td style={tdStyle}>{product.code}</td>
                      <td style={tdStyle}>{product.name}</td>
                      <td style={tdStyle}>
                        <input
                          value={listDraft}
                          onChange={(evt) => setListPriceDrafts((prev) => ({ ...prev, [product.id]: evt.target.value }))}
                          placeholder="Fiyat"
                          style={{
                            ...inputStyle,
                            width: '120px',
                            borderColor: draftInvalid ? '#ef4444' : '#334155',
                          }}
                        />
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                          {listDraftNumber === null && listDraft.trim().length > 0
                            ? 'Gecersiz fiyat'
                            : formatPrice(listDraftNumber)}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={stockDraft}
                          onChange={(evt) => setListStockDrafts((prev) => ({ ...prev, [product.id]: evt.target.value }))}
                          placeholder="Stok"
                          type="number"
                          min={0}
                          style={{
                            ...inputStyle,
                            width: '120px',
                            borderColor: stockInvalid ? '#ef4444' : '#334155',
                          }}
                        />
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                          {stockInvalid ? 'Gecersiz stok' : `${stockDraftNumber} adet`}
                        </div>
                      </td>
                      <td style={tdStyle}>{product.active ? 'Aktif' : 'Pasif'}</td>
                      <td style={tdStyle}>
                        <button type="button" onClick={() => openProductDetail(product)} style={primaryButton}>
                          Duzenle
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
              </div>
            </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => {
                setSelectedProductId(null)
                setEditingProductId(null)
              }}
              style={{ ...primaryButton, marginBottom: '12px' }}
            >
              ← Geri
            </button>
            <div>
              {products
                .filter((p) => p.id === selectedProductId)
                .map((product) => {
                  const photos = normalizeImages(product.images)
                  const variants = (product.variants || []).filter((v) => !v.deleted_at)
                  const variantDraft = variantDrafts[product.id] || {}
                  const materialOptions = (product.material_options || []).filter((m) => !m.deleted_at)
                  const isEditingProduct = editingProductId === product.id
                  const discountPercent = normalizeDiscountPercent(product.discount_percent)
                  const discountedPrice = calculateDiscountedPrice(product.price, discountPercent)

                  return (
                    <div key={product.id} style={panelStyle}>
                      <h2 style={panelTitleStyle}>{product.name}</h2>
                      <div style={newGridStyle}>
                        <div>
                          <label style={checkLabelStyle}>Kod</label>
                          <input
                            value={product.code || ''}
                            onChange={(evt) => updateLocalProduct(product.id, { code: evt.target.value })}
                            placeholder="Urun kodu"
                            style={inputStyle}
                            disabled={!isEditingProduct}
                          />
                        </div>
                        <div>
                          <label style={checkLabelStyle}>Ad</label>
                          <input
                            value={product.name || ''}
                            onChange={(evt) => updateLocalProduct(product.id, { name: evt.target.value })}
                            placeholder="Urun adi"
                            style={inputStyle}
                            disabled={!isEditingProduct}
                          />
                        </div>
                        <div>
                          <label style={checkLabelStyle}>Kategori</label>
                          <select
                            value={product.category || ''}
                            onChange={(evt) => updateLocalProduct(product.id, { category: evt.target.value as Category })}
                            style={inputStyle}
                            disabled={!isEditingProduct}
                          >
                            <option value="">Sec</option>
                            {CATEGORY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={checkLabelStyle}>Fiyat</label>
                          <input
                            value={product.price ?? ''}
                            onChange={(evt) =>
                              updateLocalProduct(product.id, {
                                price: parsePrice(evt.target.value),
                                price_visible: parsePrice(evt.target.value) !== null,
                              })
                            }
                            style={inputStyle}
                            disabled={!isEditingProduct}
                          />
                          {isEditingProduct && (
                            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                              {formatPrice(product.price)}
                            </div>
                          )}
                        </div>
                        <div>
                          <label style={checkLabelStyle}>Indirim %</label>
                          <input
                            value={product.discount_percent ?? ''}
                            onChange={(evt) =>
                              updateLocalProduct(product.id, {
                                discount_percent: normalizeDiscountPercent(evt.target.value),
                              })
                            }
                            type="number"
                            min={0}
                            max={95}
                            step={0.1}
                            style={inputStyle}
                            disabled={!isEditingProduct}
                          />
                          {isEditingProduct && discountedPrice !== null && discountPercent && (
                            <div style={{ color: '#fca5a5', fontSize: '11px', marginTop: '4px' }}>
                              {formatPrice(discountedPrice)}
                            </div>
                          )}
                        </div>
                        <div>
                          <label style={checkLabelStyle}>Stok</label>
                          <input
                            value={Number(product.stock_quantity || 0)}
                            onChange={(evt) =>
                              updateLocalProduct(product.id, {
                                stock_quantity: parseStock(evt.target.value),
                              })
                            }
                            type="number"
                            min={0}
                            style={inputStyle}
                            disabled={!isEditingProduct}
                          />
                        </div>
                      </div>

                      {isEditingProduct && (
                        <div style={{ marginTop: '16px' }}>
                          <h3 style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '10px' }}>Fotoğraflar</h3>
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
                        </div>
                      )}

                      {isEditingProduct && (
                        <div style={{ marginTop: '16px' }}>
                          <h3 style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '10px' }}>Renkler</h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                            {variants.map((variant) => (
                              <div key={variant.id} style={variantRowStyle}>
                                <span style={variantTagStyle}>{getVariantLabel(variant)}</span>
                                <button
                                  type="button"
                                  onClick={() => startVariantEdit(product, variant)}
                                  style={variantEditButtonStyle}
                                  disabled={variantActionLoading === variant.id || variantActionLoading === product.id}
                                >
                                  Duzenle
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeVariant(variant.id, product.code)}
                                  style={variantDeleteButtonStyle}
                                  title="Sil"
                                  disabled={variantActionLoading === variant.id || variantActionLoading === product.id}
                                >
                                  {variantActionLoading === variant.id ? 'Siliniyor...' : 'Sil'}
                                </button>
                              </div>
                            ))}
                            {!variants.length && <span style={{ color: '#64748b', fontSize: '11px' }}>Renk yok</span>}
                          </div>
                          <select
                            value={variantDraft.color}
                            onChange={(evt) => updateVariantDraft(product.id, { color: evt.target.value })}
                            style={{ ...inputStyle, width: '160px', marginBottom: '6px' }}
                          >
                            <option value="">Renk sec *</option>
                            {COLOR_OPTIONS.map((option) => (
                              <option key={`${product.id}-variant-color-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(evt) =>
                              updateVariantDraft(product.id, {
                                file: evt.target.files?.[0] || null,
                                files: Array.from(evt.target.files || []),
                              })
                            }
                            style={{ ...inputStyle, width: '170px', marginBottom: '6px' }}
                          />
                          <button
                            type="button"
                            onClick={() => void addVariantForProduct(product)}
                            style={miniButtonStyle}
                            disabled={variantActionLoading === product.id}
                          >
                            {variantActionLoading === product.id ? 'Kaydediliyor...' : (variantDraft.editingVariantId ? 'Renk guncelle' : 'Renk kaydet')}
                          </button>
                        </div>
                      )}

                      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setEditingProductId((prev) => (prev === product.id ? null : product.id))}
                          style={primaryButton}
                        >
                          {isEditingProduct ? 'Duzenlemeyi Kapat' : 'Duzenle'}
                        </button>
                        <button
                          onClick={() => void saveProduct(product)}
                          disabled={savingId === product.id || !isEditingProduct}
                          style={secondaryButton}
                        >
                          {savingId === product.id ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        {showArchived ? (
                          <button
                            type="button"
                            onClick={() => void restoreProduct(product.id, product.code)}
                            disabled={deletingId === product.id}
                            style={dangerButton}
                          >
                            {deletingId === product.id ? 'Canliya Aliniyor...' : 'Canliya Al'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void deleteProduct(product.id, product.code)}
                            disabled={deletingId === product.id}
                            style={dangerButton}
                          >
                            {deletingId === product.id ? 'Arsivraniyor...' : 'Arşivle'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
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
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
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

const saveListButtonStyle: CSSProperties = {
  ...secondaryButton,
  minWidth: '110px',
  textAlign: 'left',
  paddingLeft: '14px',
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

const saveColumnHeaderStyle: CSSProperties = {
  ...thStyle,
  position: 'sticky',
  left: 0,
  zIndex: 2,
  background: '#1e293b',
  minWidth: '132px',
}

const tdStyle: CSSProperties = {
  color: '#e2e8f0',
  fontSize: '12px',
  borderBottom: '1px solid #1f2937',
  padding: '10px 8px',
  verticalAlign: 'top',
}

const saveColumnCellStyle: CSSProperties = {
  ...tdStyle,
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: '#1e293b',
  minWidth: '132px',
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
  gridTemplateColumns: '1fr 1.6fr auto auto',
  gap: '8px',
  marginBottom: '8px',
}

const activeRowStyle: CSSProperties = {
  background: 'rgba(37, 99, 235, 0.08)',
}

const variantRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
}

const variantTagStyle: CSSProperties = {
  background: '#1e3a8a',
  color: '#bfdbfe',
  border: '1px solid #3b82f6',
  borderRadius: '999px',
  padding: '4px 8px',
  fontSize: '11px',
}

const variantEditButtonStyle: CSSProperties = {
  background: '#0f766e',
  color: '#ccfbf1',
  border: 'none',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '11px',
  cursor: 'pointer',
}

const variantDeleteButtonStyle: CSSProperties = {
  background: '#7f1d1d',
  color: '#fecaca',
  border: 'none',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '11px',
  cursor: 'pointer',
}

const mutedMiniText: CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
}

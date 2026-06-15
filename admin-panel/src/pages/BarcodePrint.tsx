import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { createEan13FromPrefix, isValidEan13, renderEan13Svg } from '../lib/ean13'
import { getSiteSetting, saveSiteSetting } from '../lib/siteSettings'

type CategoryFilter = 'all' | 'bath' | 'forge' | 'industrial'
type PaperPreset = 'label_100x150' | 'label_100x100'
type BarcodePageMode = 'add' | 'print'

interface ProductVariant {
  id: string
  product_id?: string
  label: string
  color: string | null
  images?: string[]
  active: boolean
}

interface Product {
  id: string
  code: string
  name: string
  category: string
  active: boolean
  archived: boolean
  images?: string[]
  variants: ProductVariant[]
}

interface ProductChoice {
  key: string
  productId: string
  variantId: string | null
  category: string
  productCode: string
  productName: string
  color: string
  imageUrl: string
}

interface LabelRow {
  key: string
  productId: string
  variantId: string | null
  productCode: string
  productName: string
  color: string
  ean13: string
  imageUrl?: string
  quantity: number
}

interface PrintSettings {
  paper_preset: PaperPreset
  logo_url: string
  logo_subtext: string
  show_logo: boolean
  show_logo_subtext: boolean
  show_barcode: boolean
  show_ean: boolean
  show_label_detail: boolean
  show_product_code: boolean
  show_product_image: boolean
  show_product_name: boolean
  show_color: boolean
  grid_columns: number
  grid_rows: number
  page_margin_mm: number
  col_gap_mm: number
  row_gap_mm: number
  label_padding_mm: number
  logo_height_mm: number
  barcode_width_mm: number
  barcode_height_mm: number
  text_size_pt: number
  ean_text_size_pt: number
  product_name_size_pt: number
  editor_layout: LabelEditorLayout
}

interface LabelRect {
  x: number
  y: number
  w: number
  h: number
}

interface LabelEditorLayout {
  logo: LabelRect
  logoSubtext: LabelRect
  barcode: LabelRect
  ean: LabelRect
  name: LabelRect
  code: LabelRect
  image: LabelRect
}

type EditorElementKey = keyof LabelEditorLayout
type EditorVisibilityKey = EditorElementKey | 'logoSubtext'

interface BarcodeMemoryItem {
  ean13: string
  product_id: string
  variant_id: string | null
  product_code: string
  product_name: string
  color: string
  updated_at: string
}

interface BarcodeMemory {
  next_serial: number
  items: Record<string, BarcodeMemoryItem>
  print_preset: PrintSettings
  preset_slots: Array<PrintSettings | null>
}

interface AdminApiEnvelope<T> {
  data?: T
  error?: string
  message?: string
  meta?: {
    pagination?: {
      page?: number
      page_size?: number
      total?: number
    }
  }
}

const BARCODE_PREFIX = '869'
const BARCODE_SERIAL_DIGITS = 9
const BARCODE_SETTINGS_KEY = 'barcode_label_settings'
const STANDARD_BARCODE_WIDTH_MM = 45
const STANDARD_BARCODE_HEIGHT_MM = 25
const XP429B_MAX_PRINT_WIDTH_MM = 108
const XP429B_SAFE_MARGIN_MM = 1.2
const MAX_EDITOR_TEXT_POINT = 60
const BARCODE_MIN_SIDE_SAFE_MARGIN_PERCENT = 10
const PRESET_SLOT_COUNT = 3
const PRESET_SLOTS_STORAGE_KEY = 'barcode_label_preset_slots_v1'
const DEFAULT_SITE_ORIGIN = 'https://www.blaene.com.tr'
const DEFAULT_SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co'

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'Tum kategoriler' },
  { value: 'bath', label: 'Bath' },
  { value: 'forge', label: 'Forge' },
  { value: 'industrial', label: 'Industrial' },
]
const DEFAULT_PRODUCT_COLORS = ['Siyah', 'Beyaz', 'Inox'] as const
const COLOR_SORT_ORDER = new Map<string, number>(DEFAULT_PRODUCT_COLORS.map((color, index) => [color, index]))
const LEGACY_PAPER_PRESET_150X100 = 'label_150x100'

const PAPER_PRESET_OPTIONS: Array<{ value: PaperPreset; label: string; widthMm: number; heightMm: number }> = [
  { value: 'label_100x150', label: '100 x 150 mm', widthMm: 100, heightMm: 150 },
  { value: 'label_100x100', label: '100 x 100 mm', widthMm: 100, heightMm: 100 },
]

function normalizePaperPreset(input: unknown): PaperPreset {
  const value = normalizeText(input).toLowerCase()
  if (value === 'label_100x100') return 'label_100x100'
  if (value === 'label_100x150' || value === LEGACY_PAPER_PRESET_150X100) return 'label_100x150'
  return 'label_100x150'
}

function getPaperPresetDimensions(preset: PaperPreset): { widthMm: number; heightMm: number } {
  const found = PAPER_PRESET_OPTIONS.find((item) => item.value === preset)
  if (found) return { widthMm: found.widthMm, heightMm: found.heightMm }
  return { widthMm: 100, heightMm: 150 }
}

function getFixedGridForPreset(preset: PaperPreset): { columns: number; rows: number } {
  if (preset === 'label_100x100') return { columns: 2, rows: 2 }
  return { columns: 2, rows: 3 }
}

function getFixedPageCountForPreset(preset: PaperPreset): number {
  const grid = getFixedGridForPreset(preset)
  return grid.columns * grid.rows
}

const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paper_preset: 'label_100x150',
  logo_url: '/logo/blaene-logo.png',
  logo_subtext: 'www.blaene.com.tr',
  show_logo: true,
  show_logo_subtext: true,
  show_barcode: true,
  show_ean: true,
  show_label_detail: true,
  show_product_code: true,
  show_product_image: true,
  show_product_name: true,
  show_color: true,
  grid_columns: 2,
  grid_rows: 3,
  page_margin_mm: XP429B_SAFE_MARGIN_MM,
  col_gap_mm: 0,
  row_gap_mm: 0,
  label_padding_mm: 1.4,
  logo_height_mm: 7,
  barcode_width_mm: STANDARD_BARCODE_WIDTH_MM,
  barcode_height_mm: STANDARD_BARCODE_HEIGHT_MM,
  text_size_pt: 8.8,
  ean_text_size_pt: 8.8,
  product_name_size_pt: 8.8,
  editor_layout: {
    logo: { x: 30, y: 5, w: 40, h: 8 },
    logoSubtext: { x: 26, y: 13, w: 48, h: 5 },
    barcode: { x: 12, y: 14, w: 76, h: 52 },
    ean: { x: 20, y: 66, w: 60, h: 7 },
    image: { x: 39, y: 73, w: 22, h: 11 },
    name: { x: 18, y: 85, w: 64, h: 7 },
    code: { x: 30, y: 92, w: 40, h: 6 },
  },
}

// 100x100 etikette her hucre ~48mm yuksekliginde oldugu icin layout daha kompakt olmali
// logo x = (100 - w) / 2 ile tam ortalanir
const DEFAULT_EDITOR_LAYOUT_100x100: LabelEditorLayout = {
  logo: { x: 28, y: 8, w: 44, h: 10 },
  logoSubtext: { x: 20, y: 19, w: 60, h: 6 },
  barcode: { x: 6, y: 26, w: 88, h: 32 },
  ean: { x: 14, y: 59, w: 72, h: 8 },
  image: { x: 40, y: 68, w: 20, h: 8 },
  name: { x: 8, y: 77, w: 84, h: 8 },
  code: { x: 18, y: 87, w: 64, h: 8 },
}

const EDITOR_ELEMENT_LABELS: Record<EditorElementKey, string> = {
  logo: 'Logo',
  logoSubtext: 'Logo Alti Metni',
  barcode: 'Barkod',
  ean: 'EAN Satiri',
  name: 'Urun Adi',
  code: 'Urun Kodu',
  image: 'Urun Gorseli',
}
const EDITOR_ELEMENT_KEYS: EditorElementKey[] = ['logo', 'logoSubtext', 'barcode', 'ean', 'name', 'code', 'image']
const EDITOR_VISIBILITY_LABELS: Record<EditorVisibilityKey, string> = {
  logo: 'Logo',
  logoSubtext: 'Logo Alti Metni',
  barcode: 'Barkod',
  ean: 'EAN Satiri',
  name: 'Urun Adi',
  code: 'Urun Kodu',
  image: 'Urun Gorseli',
}
const EDITOR_VISIBILITY_KEYS: EditorVisibilityKey[] = ['logo', 'logoSubtext', 'barcode', 'ean', 'name', 'code', 'image']

function getDefaultEditorLayoutForPreset(preset: PaperPreset): LabelEditorLayout {
  if (preset === 'label_100x100') return DEFAULT_EDITOR_LAYOUT_100x100
  return DEFAULT_PRINT_SETTINGS.editor_layout
}

function getRecommendedSettingsForXp429b(preset: PaperPreset, current: PrintSettings): PrintSettings {
  if (preset === 'label_100x100') {
    return {
      ...current,
      paper_preset: 'label_100x100',
      grid_columns: 2,
      grid_rows: 2,
      page_margin_mm: 3,
      col_gap_mm: 0,
      row_gap_mm: 0,
      label_padding_mm: 1.4,
      logo_height_mm: 7,
      barcode_width_mm: STANDARD_BARCODE_WIDTH_MM,
      barcode_height_mm: STANDARD_BARCODE_HEIGHT_MM,
      text_size_pt: 8.8,
      ean_text_size_pt: 8.8,
      product_name_size_pt: 8.8,
      editor_layout: DEFAULT_EDITOR_LAYOUT_100x100,
    }
  }

  return {
    ...current,
    paper_preset: 'label_100x150',
    grid_columns: 2,
    grid_rows: 3,
    page_margin_mm: XP429B_SAFE_MARGIN_MM,
    col_gap_mm: 0,
    row_gap_mm: 0,
    label_padding_mm: 1.4,
    logo_height_mm: 7,
    barcode_width_mm: STANDARD_BARCODE_WIDTH_MM,
    barcode_height_mm: STANDARD_BARCODE_HEIGHT_MM,
    text_size_pt: 8.8,
    ean_text_size_pt: 8.8,
    product_name_size_pt: 8.8,
    editor_layout: DEFAULT_PRINT_SETTINGS.editor_layout,
  }
}

const DEFAULT_BARCODE_MEMORY: BarcodeMemory = {
  next_serial: 1,
  items: {},
  print_preset: DEFAULT_PRINT_SETTINGS,
  preset_slots: Array.from({ length: PRESET_SLOT_COUNT }, () => null),
}

function normalizeText(input: unknown): string {
  return String(input || '').trim()
}

function resolveLogoSubtext(input: unknown): string {
  return normalizeText(input) || DEFAULT_PRINT_SETTINGS.logo_subtext
}

function normalizeProductColor(input: unknown): string {
  const value = normalizeText(input).toLowerCase()
  if (!value) return ''
  if (value.includes('siyah') || value.includes('black')) return 'Siyah'
  if (value.includes('beyaz') || value.includes('white')) return 'Beyaz'
  if (value.includes('inox') || value.includes('inoks') || value.includes('paslanmaz') || value.includes('standart')) return 'Inox'
  return ''
}

function normalizeImages(input: unknown): string[] {
  const values: string[] = []
  const collect = (value: unknown) => {
    if (value == null) return
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item))
      return
    }
    if (typeof value === 'string') {
      const text = normalizeText(value)
      if (!text) return
      const looksJson =
        (text.startsWith('[') && text.endsWith(']')) ||
        (text.startsWith('{') && text.endsWith('}'))
      if (looksJson) {
        try {
          const parsed = JSON.parse(text) as unknown
          collect(parsed)
          return
        } catch {
          // continue with raw string fallback
        }
      }
      if (text.includes(',')) {
        text
          .split(',')
          .map((chunk) => normalizeText(chunk))
          .filter(Boolean)
          .forEach((chunk) => values.push(chunk))
        return
      }
      values.push(text)
      return
    }
    if (typeof value === 'object') {
      const row = value as Record<string, unknown>
      collect(row.url ?? row.src ?? row.image ?? row.path ?? row.public_url)
    }
  }

  collect(input)
  return Array.from(new Set(values.map((item) => normalizeText(item)).filter(Boolean))).slice(0, 24)
}

function toAbsoluteImageUrl(value: unknown): string {
  const raw = normalizeText(value)
  if (!raw) return ''
  const cleaned = raw.replace(/^['"]+|['"]+$/g, '').trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('data:') || cleaned.startsWith('blob:')) return cleaned

  const envSupabaseUrl =
    typeof import.meta !== 'undefined' && import.meta.env
      ? normalizeText((import.meta.env as Record<string, unknown>).VITE_SUPABASE_URL)
      : ''
  const supabaseUrl = envSupabaseUrl || DEFAULT_SUPABASE_URL
  const siteOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : DEFAULT_SITE_ORIGIN

  // Some old records may keep signed URLs; convert them to stable public URLs.
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const parsed = new URL(cleaned)
      const normalizedPath = parsed.pathname.replace(/\/+/g, '/')
      const signPrefix = '/storage/v1/object/sign/product-images/'
      const signIndex = normalizedPath.toLowerCase().indexOf(signPrefix)
      if (signIndex >= 0) {
        const relativePath = normalizedPath.slice(signIndex + signPrefix.length)
        if (relativePath) {
          return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/product-images/${relativePath}`
        }
      }
      return cleaned
    } catch {
      return cleaned
    }
  }

  const normalized = cleaned.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) return ''

  const lower = normalized.toLowerCase()
  if (lower.startsWith('storage/v1/object/public/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/${normalized}`
  }
  if (lower.startsWith('storage/v1/object/sign/product-images/')) {
    const relativePath = normalized.slice('storage/v1/object/sign/product-images/'.length)
    return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/product-images/${relativePath}`
  }
  if (lower.startsWith('product-images/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${normalized}`
  }
  if (lower.startsWith('products/')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/product-images/${normalized}`
  }
  return `${siteOrigin.replace(/\/+$/, '')}/${normalized}`
}

function buildLabelSignature(productName: unknown, color: unknown, productCode?: unknown): string {
  const normalizedCode = normalizeText(productCode).toLocaleUpperCase('tr-TR') || 'KODSIZ'
  const normalizedName = normalizeText(productName).toLocaleLowerCase('tr-TR') || 'urun'
  const normalizedColor = (normalizeProductColor(color) || normalizeText(color) || 'Inox').toLocaleLowerCase('tr-TR')
  return `${normalizedCode}::${normalizedName}::${normalizedColor}`
}

function normalizeCategory(input: unknown): CategoryFilter {
  const value = normalizeText(input).toLowerCase()
  if (value === 'bath' || value === 'forge' || value === 'industrial') return value
  return 'all'
}

function buildChoiceKey(productId: string, variantId: string | null, productCode: string, color: string): string {
  if (variantId) return `${productId}::${variantId}`
  const colorToken = normalizeText(color).toUpperCase() || 'STANDART'
  return `${productId}::${normalizeText(productCode).toUpperCase()}::${colorToken}`
}

function normalizeVariants(input: unknown): ProductVariant[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        id: normalizeText(row.id),
        product_id: normalizeText(row.product_id) || undefined,
        label: normalizeText(row.label),
        color: normalizeText(row.color) || null,
        images: normalizeImages(row.images),
        active: row.active !== false,
      }
    })
    .filter((item): item is ProductVariant => Boolean(item?.id || item?.label || item?.color))
}

function normalizeProducts(input: unknown): Product[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const id = normalizeText(row.id)
      const code = normalizeText(row.code).toUpperCase()
      const name = normalizeText(row.name)
      if (!id || !code || !name) return null
      return {
        id,
        code,
        name,
        category: normalizeText(row.category).toLowerCase() || 'bath',
        active: row.active !== false,
        archived: row.archived === true,
        images: normalizeImages(row.images),
        variants: normalizeVariants(row.variants),
      }
    })
    .filter((item): item is Product => Boolean(item))
}

function mergeVariants(base: ProductVariant[], extra: ProductVariant[]): ProductVariant[] {
  const map = new Map<string, ProductVariant>()
  const buildKey = (item: ProductVariant) => {
    if (item.id) return `id:${item.id}`
    const color = normalizeText(item.color).toUpperCase()
    const label = normalizeText(item.label).toUpperCase()
    return `meta:${color}:${label}`
  }

  ;[...(base || []), ...(extra || [])].forEach((variant) => {
    const key = buildKey(variant)
    const current = map.get(key)
    if (!current) {
      map.set(key, variant)
      return
    }
    map.set(key, {
      ...current,
      ...variant,
      id: variant.id || current.id,
      label: variant.label || current.label,
      color: variant.color || current.color,
      active: variant.active !== false && current.active !== false,
    })
  })

  return Array.from(map.values())
}

function toClampedNumber(input: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(String(input ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function toClampedInt(input: unknown, fallback: number, min: number, max: number): number {
  return Math.floor(toClampedNumber(input, fallback, min, max))
}

function normalizeLabelRect(input: unknown, fallback: LabelRect): LabelRect {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const w = toClampedNumber(row.w, fallback.w, 8, 95)
  const h = toClampedNumber(row.h, fallback.h, 6, 95)
  const x = toClampedNumber(row.x, fallback.x, 0, 100 - w)
  const y = toClampedNumber(row.y, fallback.y, 0, 100 - h)
  return { x, y, w, h }
}

function lockBarcodeRect(rect: LabelRect, lockedOrigin: LabelRect): LabelRect {
  const ratio = rect.w > 0 ? rect.h / rect.w : (lockedOrigin.h > 0 ? lockedOrigin.h / lockedOrigin.w : 0.65)
  const sideSafe = BARCODE_MIN_SIDE_SAFE_MARGIN_PERCENT / 2
  let w = toClampedNumber(rect.w, lockedOrigin.w, 20, 95)
  let h = w * ratio
  if (h > 85) {
    h = 85
    w = h / Math.max(0.2, ratio)
  }
  w = toClampedNumber(w, lockedOrigin.w, 20, 95)
  h = toClampedNumber(h, lockedOrigin.h, 12, 85)
  const xMax = Math.max(0, 100 - w - sideSafe)
  const xMin = Math.min(sideSafe, xMax)
  const x = toClampedNumber(rect.x, lockedOrigin.x, xMin, xMax)
  const y = toClampedNumber(rect.y, lockedOrigin.y, 0, 100 - h)
  return { x, y, w, h }
}

function normalizeEditorLayout(input: unknown): LabelEditorLayout {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const base = DEFAULT_PRINT_SETTINGS.editor_layout
  const normalizedBarcode = normalizeLabelRect(row.barcode, base.barcode)
  return {
    logo: normalizeLabelRect(row.logo, base.logo),
    logoSubtext: normalizeLabelRect(row.logoSubtext, base.logoSubtext),
    barcode: lockBarcodeRect(normalizedBarcode, base.barcode),
    ean: normalizeLabelRect(row.ean, base.ean),
    name: normalizeLabelRect(row.name, base.name),
    code: normalizeLabelRect(row.code, base.code),
    image: normalizeLabelRect(row.image, base.image),
  }
}

function isLikelyBrokenEditorLayout(layout: LabelEditorLayout): boolean {
  const keys: EditorElementKey[] = ['logo', 'logoSubtext', 'barcode', 'ean', 'name', 'code', 'image']
  const topLeftTinyCount = keys.filter((key) => {
    const rect = layout[key]
    return rect.x <= 1 && rect.y <= 1 && rect.w <= 12 && rect.h <= 10
  }).length

  if (topLeftTinyCount >= 2) return true
  if (layout.barcode.w < 30 || layout.barcode.h < 24) return true
  if (layout.logo.w < 20 || layout.logo.h < 6) return true
  return false
}

function rectToPercentStyle(rect: LabelRect): CSSProperties {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
  }
}

function isEditorElementVisible(settings: PrintSettings, key: EditorVisibilityKey): boolean {
  if (key === 'logo') return settings.show_logo
  if (key === 'logoSubtext') return settings.show_logo_subtext
  if (key === 'barcode') return settings.show_barcode
  if (key === 'ean') return settings.show_ean
  if (key === 'name') return settings.show_label_detail
  if (key === 'code') return settings.show_product_code
  if (key === 'image') return settings.show_product_image
  return true
}

function normalizePrintSettings(input: unknown): PrintSettings {
  if (!input || typeof input !== 'object') return DEFAULT_PRINT_SETTINGS
  const row = input as Record<string, unknown>
  const paperPreset = normalizePaperPreset(row.paper_preset)
  const fixedGrid = getFixedGridForPreset(paperPreset)
  const generalText = toClampedNumber(row.text_size_pt, DEFAULT_PRINT_SETTINGS.text_size_pt, 6, MAX_EDITOR_TEXT_POINT)
  const parsedLayout = normalizeEditorLayout(row.editor_layout)
  const effectiveLayout = isLikelyBrokenEditorLayout(parsedLayout)
    ? normalizeEditorLayout(getDefaultEditorLayoutForPreset(paperPreset))
    : parsedLayout

  return {
    paper_preset: paperPreset,
    logo_url: normalizeText(row.logo_url) || DEFAULT_PRINT_SETTINGS.logo_url,
    logo_subtext: normalizeText(row.logo_subtext) || DEFAULT_PRINT_SETTINGS.logo_subtext,
    show_logo: row.show_logo !== false,
    show_logo_subtext: row.show_logo_subtext !== false,
    show_barcode: row.show_barcode !== false,
    show_ean: row.show_ean !== false,
    show_label_detail: row.show_label_detail !== false,
    show_product_code: row.show_product_code !== false,
    show_product_image: row.show_product_image !== false,
    show_product_name: row.show_product_name !== false,
    show_color: row.show_color !== false,
    grid_columns: fixedGrid.columns,
    grid_rows: fixedGrid.rows,
    page_margin_mm: toClampedNumber(row.page_margin_mm, DEFAULT_PRINT_SETTINGS.page_margin_mm, 0.8, 3),
    col_gap_mm: toClampedNumber(row.col_gap_mm, DEFAULT_PRINT_SETTINGS.col_gap_mm, 0, 20),
    row_gap_mm: toClampedNumber(row.row_gap_mm, DEFAULT_PRINT_SETTINGS.row_gap_mm, 0, 20),
    label_padding_mm: toClampedNumber(row.label_padding_mm, DEFAULT_PRINT_SETTINGS.label_padding_mm, 0, 10),
    logo_height_mm: toClampedNumber(row.logo_height_mm, DEFAULT_PRINT_SETTINGS.logo_height_mm, 3, 18),
    barcode_width_mm: toClampedNumber(row.barcode_width_mm, DEFAULT_PRINT_SETTINGS.barcode_width_mm, 25, 96),
    barcode_height_mm: toClampedNumber(row.barcode_height_mm, DEFAULT_PRINT_SETTINGS.barcode_height_mm, 12, 45),
    text_size_pt: generalText,
    ean_text_size_pt: toClampedNumber(row.ean_text_size_pt, generalText, 6, MAX_EDITOR_TEXT_POINT),
    product_name_size_pt: toClampedNumber(row.product_name_size_pt, generalText, 6, MAX_EDITOR_TEXT_POINT),
    editor_layout: effectiveLayout,
  }
}

function normalizePresetSlots(input: unknown): Array<PrintSettings | null> {
  const raw = Array.isArray(input) ? input : []
  const next = Array.from({ length: PRESET_SLOT_COUNT }, (_, index) => {
    const value = raw[index]
    if (!value || typeof value !== 'object') return null
    return normalizePrintSettings(value)
  })
  return next
}

function readPresetSlotsFromLocalStorage(): Array<PrintSettings | null> {
  try {
    const raw = localStorage.getItem(PRESET_SLOTS_STORAGE_KEY)
    if (!raw) return Array.from({ length: PRESET_SLOT_COUNT }, () => null)
    const parsed = JSON.parse(raw)
    return normalizePresetSlots(parsed)
  } catch {
    return Array.from({ length: PRESET_SLOT_COUNT }, () => null)
  }
}

function writePresetSlotsToLocalStorage(slots: Array<PrintSettings | null>) {
  try {
    localStorage.setItem(PRESET_SLOTS_STORAGE_KEY, JSON.stringify(normalizePresetSlots(slots)))
  } catch {
    // ignore localStorage failures
  }
}

function normalizeMemory(input: unknown): BarcodeMemory {
  if (!input || typeof input !== 'object') return DEFAULT_BARCODE_MEMORY
  const row = input as Record<string, unknown>
  const rawItems = row.items && typeof row.items === 'object' ? (row.items as Record<string, unknown>) : {}
  const signatureMap = new Map<string, { key: string; item: BarcodeMemoryItem; updatedMs: number }>()

  Object.entries(rawItems).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return
    const item = value as Record<string, unknown>
    const ean13 = normalizeText(item.ean13)
    if (!isValidEan13(ean13)) return
    const parsed: BarcodeMemoryItem = {
      ean13,
      product_id: normalizeText(item.product_id),
      variant_id: normalizeText(item.variant_id) || null,
      product_code: normalizeText(item.product_code).toUpperCase(),
      product_name: normalizeText(item.product_name),
      color: normalizeProductColor(item.color) || 'Inox',
      updated_at: normalizeText(item.updated_at) || new Date().toISOString(),
    }
    const signature = buildLabelSignature(parsed.product_name, parsed.color, parsed.product_code)
    const updatedMs = Number.isFinite(Date.parse(parsed.updated_at)) ? Date.parse(parsed.updated_at) : 0
    const current = signatureMap.get(signature)
    if (!current || updatedMs >= current.updatedMs) {
      signatureMap.set(signature, { key, item: parsed, updatedMs })
    }
  })

  const items: Record<string, BarcodeMemoryItem> = {}
  signatureMap.forEach(({ key, item }) => {
    items[key] = item
  })

  return {
    next_serial: Math.max(1, Math.floor(toClampedNumber(row.next_serial, 1, 1, 999_999_999))),
    items,
    print_preset: normalizePrintSettings(row.print_preset),
    preset_slots: normalizePresetSlots(row.preset_slots),
  }
}

function buildChoices(products: Product[]): ProductChoice[] {
  const allChoices: ProductChoice[] = []

  products.forEach((product) => {
    const productCode = product.code.toUpperCase()
    const productName = product.name
    const category = product.category
    const activeVariants = product.variants.filter((variant) => variant.active !== false)
    const variantByColor = new Map<string, ProductVariant>()
    activeVariants.forEach((variant) => {
      const color = normalizeProductColor(variant.color || variant.label)
      if (!color) return
      if (!variantByColor.has(color)) {
        variantByColor.set(color, variant)
      }
    })

    DEFAULT_PRODUCT_COLORS.forEach((color) => {
      const matchedVariant = variantByColor.get(color)
      const variantId = matchedVariant ? normalizeText(matchedVariant.id) || null : null
      const variantImage = toAbsoluteImageUrl(matchedVariant?.images?.[0] || '')
      const productImage = toAbsoluteImageUrl(product.images?.[0] || '')
      allChoices.push({
        key: buildChoiceKey(product.id, variantId, productCode, color),
        productId: product.id,
        variantId,
        category,
        productCode,
        productName,
        color,
        imageUrl: variantImage || productImage,
      })
    })
  })

  return allChoices.sort((a, b) => {
    if (a.productCode !== b.productCode) return a.productCode.localeCompare(b.productCode, 'tr')
    const aOrder = COLOR_SORT_ORDER.get(a.color) ?? 99
    const bOrder = COLOR_SORT_ORDER.get(b.color) ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.color.localeCompare(b.color, 'tr')
  })
}

function chunkRows(rows: LabelRow[], size: number): LabelRow[][] {
  if (!rows.length || size <= 0) return []
  const chunks: LabelRow[][] = []
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size))
  }
  return chunks
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toPixelFromMm(mm: number): number {
  return Math.max(1, Math.round(mm * 3.7795))
}

function buildLabelDisplayText(row: LabelRow, showProductName = true, showColor = true): string {
  const namePart = showProductName ? normalizeText(row.productName) : ''
  const colorPart = showColor ? normalizeText(row.color) : ''
  if (namePart && colorPart) return `${namePart} - ${colorPart}`
  if (namePart) return namePart
  if (colorPart) return colorPart
  return ''
}

function buildRowsFromMemory(memory: BarcodeMemory, products: Product[]): LabelRow[] {
  const imageByProductId = new Map<string, string>()
  const imageByProductCode = new Map<string, string>()
  const imageByVariantId = new Map<string, string>()
  products.forEach((product) => {
    const imageUrl = toAbsoluteImageUrl(product.images?.[0])
    if (!imageUrl) return
    if (product.id) imageByProductId.set(product.id, imageUrl)
    if (product.code) imageByProductCode.set(normalizeText(product.code).toUpperCase(), imageUrl)
    ;(product.variants || []).forEach((variant) => {
      const variantId = normalizeText(variant.id)
      const variantImage = toAbsoluteImageUrl(variant.images?.[0] || '')
      if (variantId && variantImage) imageByVariantId.set(variantId, variantImage)
    })
  })

  return Object.entries(memory.items)
    .map(([key, item]) => ({
      key,
      productId: normalizeText(item.product_id),
      variantId: normalizeText(item.variant_id) || null,
      productCode: normalizeText(item.product_code).toUpperCase(),
      productName: normalizeText(item.product_name) || normalizeText(item.product_code).toUpperCase(),
      color: normalizeProductColor(item.color) || 'Inox',
      ean13: normalizeText(item.ean13),
      imageUrl:
        imageByVariantId.get(normalizeText(item.variant_id)) ||
        imageByProductId.get(normalizeText(item.product_id)) ||
        imageByProductCode.get(normalizeText(item.product_code).toUpperCase()) ||
        '',
      quantity: 0,
    }))
    .sort((a, b) => {
      if (a.productCode !== b.productCode) return a.productCode.localeCompare(b.productCode, 'tr')
      const aOrder = COLOR_SORT_ORDER.get(a.color) ?? 99
      const bOrder = COLOR_SORT_ORDER.get(b.color) ?? 99
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.color !== b.color) return a.color.localeCompare(b.color, 'tr')
      return a.ean13.localeCompare(b.ean13, 'tr')
    })
}

interface PrintLayoutMetrics {
  paper: { widthMm: number; heightMm: number }
  columns: number
  rows: number
  labelsPerPage: number
  compact: boolean
  safeMarginMm: number
  cellWidthMm: number
  cellHeightMm: number
  barcodeWidthMm: number
  barcodeHeightMm: number
  barcodeWidthPx: number
  barcodeHeightPx: number
  logoHeightMm: number
  showLogoSubtext: boolean
  textSizePt: number
  eanTextSizePt: number
  productNameTextSizePt: number
}

function computePrintLayoutMetrics(settings: PrintSettings): PrintLayoutMetrics {
  const rawPaper = getPaperPresetDimensions(settings.paper_preset)
  const paper = {
    widthMm: Math.min(rawPaper.widthMm, XP429B_MAX_PRINT_WIDTH_MM),
    heightMm: rawPaper.heightMm,
  }
  const fixedGrid = getFixedGridForPreset(settings.paper_preset)
  const columns = fixedGrid.columns
  const rows = fixedGrid.rows
  const labelsPerPage = Math.max(1, columns * rows)
  const safeMarginMm = Math.max(XP429B_SAFE_MARGIN_MM, Math.min(settings.page_margin_mm, Math.min(paper.widthMm, paper.heightMm) / 3))
  const contentWidthMm = Math.max(20, paper.widthMm - safeMarginMm * 2)
  const contentHeightMm = Math.max(20, paper.heightMm - safeMarginMm * 2)
  const cellWidthMm = Math.max(18, (contentWidthMm - settings.col_gap_mm * (columns - 1)) / columns)
  const cellHeightMm = Math.max(18, (contentHeightMm - settings.row_gap_mm * (rows - 1)) / rows)
  const compactLayout = cellHeightMm <= 52
  const logoSubtext = resolveLogoSubtext(settings.logo_subtext)
  const showLogoSubtext = settings.show_logo && settings.show_logo_subtext && Boolean(logoSubtext)
  const logoHeightMm = settings.show_logo
    ? Math.min(settings.logo_height_mm, compactLayout ? 4.8 : settings.logo_height_mm)
    : 0
  const textSizePt = settings.text_size_pt
  const eanTextSizePt = settings.ean_text_size_pt
  const productNameTextSizePt = settings.product_name_size_pt
  const detailLineCount = settings.show_product_name || settings.show_color ? 1 : 0
  const metaLineCount = 2 + detailLineCount
  const maxMetaPt = Math.max(textSizePt, eanTextSizePt, productNameTextSizePt)
  const estimatedMetaBlockMm = Math.max(3.6, maxMetaPt * 0.3528 * metaLineCount * (compactLayout ? 1.03 : 1.18) + (compactLayout ? 0.7 : 1.8))
  const estimatedImageBlockMm = settings.show_product_image ? (compactLayout ? 5.8 : 13) : 0
  const topBlockMm = settings.show_logo ? logoHeightMm + (showLogoSubtext ? 3.2 : (compactLayout ? 0.6 : 1.4)) : 0.6
  const maxBarcodeWidthMm = Math.max(16, cellWidthMm - settings.label_padding_mm * 2)
  const maxBarcodeHeightMm = Math.max(6, cellHeightMm - settings.label_padding_mm * 2 - topBlockMm - estimatedMetaBlockMm - estimatedImageBlockMm)
  const barcodeWidthMm = Math.min(settings.barcode_width_mm, maxBarcodeWidthMm)
  const barcodeHeightMm = Math.min(settings.barcode_height_mm, maxBarcodeHeightMm)
  const barcodeWidthPx = toPixelFromMm(barcodeWidthMm)
  const barcodeHeightPx = toPixelFromMm(barcodeHeightMm)
  return {
    paper,
    columns,
    rows,
    labelsPerPage,
    compact: compactLayout,
    safeMarginMm,
    cellWidthMm,
    cellHeightMm,
    barcodeWidthMm,
    barcodeHeightMm,
    barcodeWidthPx,
    barcodeHeightPx,
    logoHeightMm,
    showLogoSubtext,
    textSizePt,
    eanTextSizePt,
    productNameTextSizePt,
  }
}

function buildPrintHtml(labels: LabelRow[], settings: PrintSettings): string {
  const layout = computePrintLayoutMetrics(settings)
  const logoAbsoluteUrl = toAbsoluteImageUrl(settings.logo_url)
  const logoSubtext = resolveLogoSubtext(settings.logo_subtext)
  const editorLayout = normalizeEditorLayout(settings.editor_layout)
  const pages = chunkRows(labels, layout.labelsPerPage)
  const pageHtml = pages
    .map((pageRows) => {
      const cardsHtml = pageRows.map((row) => {
        const barcodeSvg = isValidEan13(row.ean13)
          ? renderEan13Svg(row.ean13, {
              width: layout.barcodeWidthPx,
              height: layout.barcodeHeightPx,
              quietZoneModules: 8,
              includeText: false,
            })
          : `<div style="width:${layout.barcodeWidthPx}px;height:${layout.barcodeHeightPx}px;display:flex;align-items:center;justify-content:center;border:1px dashed #ef4444;color:#b91c1c;font-size:11px;">Gecersiz barkod</div>`
        const detailLine = buildLabelDisplayText(row, settings.show_product_name, settings.show_color)
        const productImageAbsoluteUrl = toAbsoluteImageUrl(row.imageUrl || '')
        const imageMarkup = settings.show_product_image && row.imageUrl
          ? `<div class="editor-el editor-image" style="left:${editorLayout.image.x}%;top:${editorLayout.image.y}%;width:${editorLayout.image.w}%;height:${editorLayout.image.h}%"><img src="${escapeHtml(productImageAbsoluteUrl)}" alt="${escapeHtml(row.productName)}" /></div>`
          : ''

        return `
          <div class="label-card">
            <div class="label-inner">
              ${settings.show_logo ? `<div class="editor-el editor-logo" style="left:${editorLayout.logo.x}%;top:${editorLayout.logo.y}%;width:${editorLayout.logo.w}%;height:${editorLayout.logo.h}%"><img src="${escapeHtml(logoAbsoluteUrl)}" alt="Blaene" /></div>` : ''}
              ${(layout.showLogoSubtext && logoSubtext && settings.show_logo && settings.show_logo_subtext)
                ? `<div class="editor-el editor-logo-subtext" style="left:${editorLayout.logoSubtext.x}%;top:${editorLayout.logoSubtext.y}%;width:${editorLayout.logoSubtext.w}%;height:${editorLayout.logoSubtext.h}%">${escapeHtml(logoSubtext)}</div>`
                : ''
              }
              ${settings.show_barcode ? `<div class="editor-el editor-barcode" style="left:${editorLayout.barcode.x}%;top:${editorLayout.barcode.y}%;width:${editorLayout.barcode.w}%;height:${editorLayout.barcode.h}%">${barcodeSvg}</div>` : ''}
              ${settings.show_ean ? `<div class="editor-el editor-ean" style="left:${editorLayout.ean.x}%;top:${editorLayout.ean.y}%;width:${editorLayout.ean.w}%;height:${editorLayout.ean.h}%">${escapeHtml(row.ean13)}</div>` : ''}
              ${imageMarkup}
              ${settings.show_label_detail && detailLine ? `<div class="editor-el editor-name" style="left:${editorLayout.name.x}%;top:${editorLayout.name.y}%;width:${editorLayout.name.w}%;height:${editorLayout.name.h}%">${escapeHtml(detailLine)}</div>` : ''}
              ${settings.show_product_code ? `<div class="editor-el editor-code" style="left:${editorLayout.code.x}%;top:${editorLayout.code.y}%;width:${editorLayout.code.w}%;height:${editorLayout.code.h}%">${escapeHtml(row.productCode)}</div>` : ''}
            </div>
          </div>
        `
      }).join('')

      return `
        <section class="print-page">
          ${cardsHtml}
        </section>
      `
    })
    .join('')

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Barkod Etiket Yazdir</title>
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page { size: ${layout.paper.widthMm}mm ${layout.paper.heightMm}mm; margin: 0; }
          @media print {
            html, body {
              margin: 0;
              padding: 0;
              width: ${layout.paper.widthMm}mm;
              height: ${layout.paper.heightMm}mm;
              overflow: hidden;
            }
          }
          .print-page {
            width: ${layout.paper.widthMm}mm;
            height: ${layout.paper.heightMm}mm;
            padding: ${layout.safeMarginMm}mm;
            display: grid;
            grid-template-columns: repeat(${layout.columns}, minmax(0, 1fr));
            grid-template-rows: repeat(${layout.rows}, minmax(0, 1fr));
            column-gap: ${settings.col_gap_mm}mm;
            row-gap: ${settings.row_gap_mm}mm;
            page-break-after: always;
          }
          .print-page:last-child { page-break-after: auto; }
          .label-card {
            width: 100%;
            height: 100%;
            border: 0.35mm solid #0f172a;
            border-radius: 1.5mm;
            position: relative;
            overflow: hidden;
            background: #fff;
          }
          .label-inner {
            position: absolute;
            inset: ${settings.label_padding_mm}mm;
          }
          .editor-el {
            position: absolute;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            overflow: hidden;
          }
          .editor-logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }
          .editor-logo-subtext {
            color: #334155;
            font-size: ${Math.max(6, Number(layout.textSizePt) - 1)}pt;
            line-height: 1.1;
          }
          .editor-barcode svg {
            width: 100%;
            height: 100%;
            display: block;
          }
          .editor-barcode {
            overflow: hidden;
            box-sizing: border-box;
            padding: 4%;
          }
          .editor-ean,
          .editor-name,
          .editor-code {
            font-size: ${layout.textSizePt.toFixed(2)}pt;
            line-height: ${layout.compact ? '1.03' : '1.18'};
            color: #020617;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .editor-image {
            border: 0.2mm solid #cbd5e1;
            border-radius: 0.8mm;
            background: #fff;
          }
          .editor-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .editor-ean {
            font-weight: 700;
            letter-spacing: 0.35mm;
            font-size: ${layout.eanTextSizePt.toFixed(2)}pt;
          }
          .editor-name {
            font-size: ${layout.productNameTextSizePt.toFixed(2)}pt;
            font-weight: 700;
          }
          .editor-code {
            color: #334155;
          }
        </style>
      </head>
      <body>${pageHtml}</body>
    </html>
  `
}

function renderBarcodeSafe(code: string, width: number, height: number): string {
  if (!isValidEan13(code)) {
    return `<div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;border:1px dashed #ef4444;color:#b91c1c;background:#fff1f2;font-size:11px;">Gecersiz barkod</div>`
  }

  return renderEan13Svg(code, {
    width,
    height,
    quietZoneModules: 8,
    includeText: false,
  })
}

async function fetchAdminCollectionAllPages<T>(
  basePath: string,
  token: string,
  pageSize = 200
): Promise<T[]> {
  const aggregated: T[] = []
  const normalizedPageSize = Math.max(1, Math.min(200, Math.floor(pageSize)))
  let page = 1

  while (page <= 200) {
    const separator = basePath.includes('?') ? '&' : '?'
    const response = await fetch(
      `${basePath}${separator}page=${page}&page_size=${normalizedPageSize}&_t=${Date.now()}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      }
    )

    let payload: AdminApiEnvelope<T[]> | null = null
    try {
      payload = (await response.json()) as AdminApiEnvelope<T[]>
    } catch {
      payload = null
    }

    if (!response.ok) {
      const detail =
        String(payload?.error || '').trim() ||
        String(payload?.message || '').trim() ||
        `Request failed (${response.status})`
      throw new Error(detail)
    }

    const rows = Array.isArray(payload?.data) ? payload!.data! : []
    aggregated.push(...rows)

    const total = Number(payload?.meta?.pagination?.total)
    if (Number.isFinite(total) && total >= 0 && aggregated.length >= total) break
    if (rows.length < normalizedPageSize) break
    page += 1
  }

  return aggregated
}

function ensureBarcodeForChoice(
  choice: ProductChoice,
  memory: BarcodeMemory
): { ean13: string; nextMemory: BarcodeMemory; created: boolean } {
  const existing = memory.items[choice.key]
  if (existing && isValidEan13(existing.ean13)) {
    return { ean13: existing.ean13, nextMemory: memory, created: false }
  }
  const usedCodes = new Set<string>()
  Object.values(memory.items).forEach((item) => {
    if (isValidEan13(item.ean13)) usedCodes.add(item.ean13)
  })

  const maxSerial = 10 ** BARCODE_SERIAL_DIGITS - 1
  let serial = Math.max(1, Math.floor(memory.next_serial || 1))
  let generated = ''

  while (serial <= maxSerial) {
    const candidate = createEan13FromPrefix(BARCODE_PREFIX, serial, BARCODE_SERIAL_DIGITS)
    if (!usedCodes.has(candidate)) {
      generated = candidate
      break
    }
    serial += 1
  }

  if (!generated) {
    throw new Error('869 ile baslayan barkod kapasitesi doldu')
  }

  const nextMemory: BarcodeMemory = {
    ...memory,
    next_serial: serial + 1,
    items: {
      ...memory.items,
      [choice.key]: {
        ean13: generated,
        product_id: choice.productId,
        variant_id: choice.variantId,
        product_code: choice.productCode,
        product_name: choice.productName,
        color: choice.color,
        updated_at: new Date().toISOString(),
      },
    },
  }

  return { ean13: generated, nextMemory, created: true }
}

export default function BarcodePrint() {
  const token = localStorage.getItem('admin_token')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [memory, setMemory] = useState<BarcodeMemory>(DEFAULT_BARCODE_MEMORY)
  const [printSettings, setPrintSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS)
  const [rows, setRows] = useState<LabelRow[]>([])
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedChoiceKey, setSelectedChoiceKey] = useState('')
  const [pageMode, setPageMode] = useState<BarcodePageMode>('add')
  const [isLabelListOpen, setIsLabelListOpen] = useState(false)
  const [barcodeEditDrafts, setBarcodeEditDrafts] = useState<Record<string, string>>({})
  const [addToPrintDrafts, setAddToPrintDrafts] = useState<Record<string, string>>({})
  const [activeBarcodeEditKey, setActiveBarcodeEditKey] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [activeEditorElement, setActiveEditorElement] = useState<EditorElementKey>('barcode')
  const [showDefaultLayoutGuides, setShowDefaultLayoutGuides] = useState(false)
  const [dragState, setDragState] = useState<{
    key: EditorElementKey
    mode: 'move' | 'resize'
    startClientX: number
    startClientY: number
    startRect: LabelRect
    canvasRect: DOMRect
  } | null>(null)
  const editorCanvasRef = useRef<HTMLDivElement | null>(null)

  const choices = useMemo(() => {
    const allChoices = buildChoices(products)
    if (categoryFilter === 'all') return allChoices
    return allChoices.filter((choice) => normalizeCategory(choice.category) === categoryFilter)
  }, [products, categoryFilter])

  const productOptions = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>()
    choices.forEach((choice) => {
      if (!map.has(choice.productId)) {
        map.set(choice.productId, {
          id: choice.productId,
          code: choice.productCode,
          name: choice.productName,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code, 'tr'))
  }, [choices])

  const productImageById = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((product) => {
      const src = toAbsoluteImageUrl(product.images?.[0])
      if (!src) return
      map.set(product.id, src)
    })
    return map
  }, [products])

  const productImageByCode = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((product) => {
      const src = toAbsoluteImageUrl(product.images?.[0])
      const code = normalizeText(product.code).toUpperCase()
      if (!src || !code) return
      map.set(code, src)
    })
    return map
  }, [products])

  const getImageForRow = (productId: string, productCode: string): string => {
    return productImageById.get(normalizeText(productId)) || productImageByCode.get(normalizeText(productCode).toUpperCase()) || ''
  }

  const choicesForProduct = useMemo(() => {
    if (!selectedProductId) return []
    return choices.filter((choice) => choice.productId === selectedProductId)
  }, [choices, selectedProductId])

  const selectedChoice = useMemo(
    () => choicesForProduct.find((choice) => choice.key === selectedChoiceKey) || null,
    [choicesForProduct, selectedChoiceKey]
  )
  const rowsQueuedForPrint = useMemo(
    () => rows.filter((row) => Math.max(0, Math.floor(row.quantity || 0)) > 0),
    [rows]
  )
  const queuedVariantCount = rowsQueuedForPrint.length

  const expandedRows = useMemo(() => {
    const next: LabelRow[] = []
    rowsQueuedForPrint.forEach((row) => {
      const count = Math.max(0, Math.floor(row.quantity || 0))
      if (count <= 0) return
      for (let i = 0; i < count; i += 1) next.push(row)
    })
    return next
  }, [rowsQueuedForPrint])

  const layoutMetrics = useMemo(() => computePrintLayoutMetrics(printSettings), [printSettings])
  const editorCanvasAspectRatio = useMemo(() => {
    const raw = layoutMetrics.cellWidthMm / Math.max(1, layoutMetrics.cellHeightMm)
    return Math.max(0.75, Math.min(1.35, raw))
  }, [layoutMetrics.cellWidthMm, layoutMetrics.cellHeightMm])
  const editorLayout = useMemo(() => normalizeEditorLayout(printSettings.editor_layout), [printSettings.editor_layout])
  const defaultEditorLayout = useMemo(
    () => normalizeEditorLayout(getDefaultEditorLayoutForPreset(printSettings.paper_preset)),
    [printSettings.paper_preset],
  )
  const editorSelectedRect = editorLayout[activeEditorElement]
  const editorSampleRow = useMemo(() => expandedRows[0] || rows[0] || null, [expandedRows, rows])
  const resolvedLogoSubtext = useMemo(() => resolveLogoSubtext(printSettings.logo_subtext), [printSettings.logo_subtext])
  const labelsPerPage = layoutMetrics.labelsPerPage
  const fixedPageCount = getFixedPageCountForPreset(printSettings.paper_preset)
  const previewPages = useMemo(() => chunkRows(expandedRows, labelsPerPage), [expandedRows, labelsPerPage])
  const listBarcodeWidthPx = toPixelFromMm(printSettings.barcode_width_mm)
  const listBarcodeHeightPx = toPixelFromMm(printSettings.barcode_height_mm)
  const hasExistingLabelSignature = (productName: string, color: string, productCode: string): boolean => {
    const signature = buildLabelSignature(productName, color, productCode)
    return rows.some((row) => buildLabelSignature(row.productName, row.color, row.productCode) === signature)
  }

  const updateEditorRect = (key: EditorElementKey, patch: Partial<LabelRect>) => {
    setPrintSettings((prev) => {
      const nextLayout = normalizeEditorLayout(prev.editor_layout)
      const current = nextLayout[key]
      const barcodeRatio = current.w > 0 ? current.h / current.w : 0.65
      let nextWidth = patch.w ?? current.w
      let nextHeight = patch.h ?? current.h

      if (key === 'barcode') {
        if (patch.w !== undefined && patch.h === undefined) {
          nextHeight = nextWidth * barcodeRatio
        } else if (patch.h !== undefined && patch.w === undefined) {
          nextWidth = nextHeight / barcodeRatio
        } else if (patch.w !== undefined && patch.h !== undefined) {
          // Keep barcode proportion stable to avoid distorted scans.
          nextHeight = nextWidth * barcodeRatio
        }
      }

      const rawRect: LabelRect = {
        x: patch.x ?? current.x,
        y: patch.y ?? current.y,
        w: nextWidth,
        h: nextHeight,
      }
      const normalizedRect = key === 'barcode'
        ? lockBarcodeRect(rawRect, DEFAULT_PRINT_SETTINGS.editor_layout.barcode)
        : normalizeLabelRect(rawRect, current)
      return {
        ...prev,
        editor_layout: {
          ...nextLayout,
          [key]: normalizedRect,
        },
      }
    })
  }

  const handleToggleEditorElementVisibility = (key: EditorVisibilityKey) => {
    setPrintSettings((prev) => {
      if (key === 'logo') return { ...prev, show_logo: !prev.show_logo }
      if (key === 'logoSubtext') return { ...prev, show_logo_subtext: !prev.show_logo_subtext }
      if (key === 'barcode') return { ...prev, show_barcode: !prev.show_barcode }
      if (key === 'ean') return { ...prev, show_ean: !prev.show_ean }
      if (key === 'name') return { ...prev, show_label_detail: !prev.show_label_detail }
      if (key === 'code') return { ...prev, show_product_code: !prev.show_product_code }
      if (key === 'image') return { ...prev, show_product_image: !prev.show_product_image }
      return prev
    })
  }

  const getActiveElementPoint = () => {
    if (activeEditorElement === 'logoSubtext') return printSettings.text_size_pt
    if (activeEditorElement === 'ean') return printSettings.ean_text_size_pt
    if (activeEditorElement === 'name') return printSettings.product_name_size_pt
    if (activeEditorElement === 'code') return printSettings.text_size_pt
    return null
  }

  const setActiveElementPoint = (value: number) => {
    setPrintSettings((prev) => {
      if (activeEditorElement === 'logoSubtext') {
        return { ...prev, text_size_pt: toClampedNumber(value, prev.text_size_pt, 6, MAX_EDITOR_TEXT_POINT) }
      }
      if (activeEditorElement === 'ean') {
        return { ...prev, ean_text_size_pt: toClampedNumber(value, prev.ean_text_size_pt, 6, MAX_EDITOR_TEXT_POINT) }
      }
      if (activeEditorElement === 'name') {
        return { ...prev, product_name_size_pt: toClampedNumber(value, prev.product_name_size_pt, 6, MAX_EDITOR_TEXT_POINT) }
      }
      if (activeEditorElement === 'code') {
        return { ...prev, text_size_pt: toClampedNumber(value, prev.text_size_pt, 6, MAX_EDITOR_TEXT_POINT) }
      }
      return prev
    })
  }

  const handleEditorMouseDown = (event: any, key: EditorElementKey, mode: 'move' | 'resize') => {
    event.preventDefault()
    event.stopPropagation()
    const canvas = editorCanvasRef.current
    if (!canvas) return
    setActiveEditorElement(key)
    setDragState({
      key,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: editorLayout[key],
      canvasRect: canvas.getBoundingClientRect(),
    })
  }

  function handleResetEditorLayoutToDefault() {
    setPrintSettings((prev) => ({
      ...prev,
      logo_subtext: DEFAULT_PRINT_SETTINGS.logo_subtext,
      show_logo: true,
      show_logo_subtext: true,
      editor_layout: normalizeEditorLayout(getDefaultEditorLayoutForPreset(prev.paper_preset)),
    }))
    setError('')
    setMessage('Yerlesim varsayilan formata geri alindi (Logo ve logo alti metni acildi)')
  }

  const handleSaveLayoutOnly = () => {
    const normalizedSettings = normalizePrintSettings(printSettings)
    setPrintSettings(normalizedSettings)
    const nextMemory: BarcodeMemory = {
      ...memory,
      print_preset: normalizedSettings,
    }
    setMemory(nextMemory)
    void persistMemory(nextMemory, 'Yerlesim duzeni kaydedildi')
  }

  const handleSavePresetSlot = (slotIndex: number) => {
    const normalizedSettings = normalizePrintSettings(printSettings)
    setPrintSettings(normalizedSettings)
    const nextSlots = normalizePresetSlots(memory.preset_slots)
    nextSlots[slotIndex] = normalizedSettings
    writePresetSlotsToLocalStorage(nextSlots)
    const nextMemory: BarcodeMemory = {
      ...memory,
      print_preset: normalizedSettings,
      preset_slots: nextSlots,
    }
    setMemory(nextMemory)
    void persistMemory(nextMemory, `Ayar ${slotIndex + 1} kaydedildi`)
  }

  const handleApplyPresetSlot = (slotIndex: number) => {
    const activeSlots = normalizePresetSlots(memory.preset_slots)
    const slotValue = activeSlots[slotIndex]
    if (!slotValue) {
      setError(`Ayar ${slotIndex + 1} henuz kayitli degil.`)
      setMessage('')
      return
    }
    const normalizedSettings = normalizePrintSettings(slotValue)
    setPrintSettings(normalizedSettings)
    const nextMemory: BarcodeMemory = {
      ...memory,
      print_preset: normalizedSettings,
      preset_slots: activeSlots,
    }
    setMemory(nextMemory)
    void persistMemory(nextMemory, `Ayar ${slotIndex + 1} uygulandi`)
    setError('')
  }

  const handleCenterActiveElement = (axis: 'x' | 'y' | 'both') => {
    const rect = editorLayout[activeEditorElement]
    const nextPatch: Partial<LabelRect> = {}
    if (axis === 'x' || axis === 'both') {
      nextPatch.x = (100 - rect.w) / 2
    }
    if (axis === 'y' || axis === 'both') {
      nextPatch.y = (100 - rect.h) / 2
    }
    updateEditorRect(activeEditorElement, nextPatch)
    setError('')
    if (axis === 'x') setMessage(`${EDITOR_ELEMENT_LABELS[activeEditorElement]} yatay ortalandi`)
    if (axis === 'y') setMessage(`${EDITOR_ELEMENT_LABELS[activeEditorElement]} dikey ortalandi`)
    if (axis === 'both') setMessage(`${EDITOR_ELEMENT_LABELS[activeEditorElement]} tam ortalandi`)
  }

  const layoutEditorNode = (
    <aside style={layoutEditorPanelStyle}>
      <h4 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: '13px' }}>Yerlesim Editoru</h4>
      <p style={{ margin: '0 0 10px', color: '#94a3b8', fontSize: '11px', lineHeight: 1.4 }}>
        Etiket icini Word gibi surukle-birak ile duzenleyin. Kutuyu tasiyin, sag-alt noktadan boyutlandirin.
      </p>
      <label style={{ ...checkLabelStyle, marginBottom: '8px', display: 'inline-flex' }}>
        <input
          type="checkbox"
          checked={showDefaultLayoutGuides}
          onChange={(evt) => setShowDefaultLayoutGuides(evt.target.checked)}
        />
        Varsayilan yerlesimi goster
      </label>

      <div style={editorBodyLayoutStyle}>
        <div
          ref={editorCanvasRef}
          style={{
            ...editorCanvasStyle,
            order: 2,
            width: 'min(100%, 560px)',
            height: 'auto',
            aspectRatio: String(editorCanvasAspectRatio),
            margin: '0 auto',
          }}
        >
          {showDefaultLayoutGuides &&
            EDITOR_ELEMENT_KEYS.map((key) => (
              <div key={`default-guide-${key}`} style={{ ...editorDefaultGuideStyle, ...rectToPercentStyle(defaultEditorLayout[key]) }}>
                <span style={editorDefaultGuideLabelStyle}>Varsayilan: {EDITOR_ELEMENT_LABELS[key]}</span>
              </div>
            ))}
          {!editorSampleRow ? (
            <div style={{ color: '#94a3b8', fontSize: '11px', textAlign: 'center', padding: '8px' }}>
              Editor icin once yazdirma listesine etiket ekleyin.
            </div>
          ) : (
            <>
            {printSettings.show_logo && (
              <div
                style={{ ...editorBlockStyle, ...rectToPercentStyle(editorLayout.logo), ...(activeEditorElement === 'logo' ? editorBlockActiveStyle : editorBlockPassiveStyle) }}
                onMouseDown={(evt) => handleEditorMouseDown(evt, 'logo', 'move')}
              >
                <img src={printSettings.logo_url} alt="Blaene" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                {activeEditorElement === 'logo' && (
                  <button type="button" style={editorResizeHandleStyle} onMouseDown={(evt) => handleEditorMouseDown(evt, 'logo', 'resize')} />
                )}
              </div>
            )}

            {printSettings.show_logo && printSettings.show_logo_subtext && (
              <div
                style={{
                  ...editorBlockStyle,
                  ...rectToPercentStyle(editorLayout.logoSubtext),
                  fontSize: `${Math.max(6, layoutMetrics.textSizePt - 1)}px`,
                  color: '#334155',
                  ...(activeEditorElement === 'logoSubtext' ? editorBlockActiveStyle : editorBlockPassiveStyle),
                }}
                onMouseDown={(evt) => handleEditorMouseDown(evt, 'logoSubtext', 'move')}
              >
                {resolvedLogoSubtext}
                {activeEditorElement === 'logoSubtext' && (
                  <button type="button" style={editorResizeHandleStyle} onMouseDown={(evt) => handleEditorMouseDown(evt, 'logoSubtext', 'resize')} />
                )}
              </div>
            )}

            {printSettings.show_barcode && (
              <div
                style={{
                  ...editorBlockStyle,
                  ...rectToPercentStyle(editorLayout.barcode),
                  cursor: 'move',
                  ...(activeEditorElement === 'barcode' ? editorBlockActiveStyle : editorBlockPassiveStyle),
                }}
                onMouseDown={(evt) => handleEditorMouseDown(evt, 'barcode', 'move')}
              >
                <div
                  style={{ width: '100%', height: '100%', padding: '4%', boxSizing: 'border-box' }}
                  dangerouslySetInnerHTML={{
                    __html: renderBarcodeSafe(editorSampleRow.ean13, layoutMetrics.barcodeWidthPx, layoutMetrics.barcodeHeightPx),
                  }}
                />
                {activeEditorElement === 'barcode' && (
                  <button type="button" style={editorResizeHandleStyle} onMouseDown={(evt) => handleEditorMouseDown(evt, 'barcode', 'resize')} />
                )}
              </div>
            )}

            {printSettings.show_ean && (
              <div
                style={{ ...editorBlockStyle, ...rectToPercentStyle(editorLayout.ean), fontSize: `${layoutMetrics.eanTextSizePt}px`, ...(activeEditorElement === 'ean' ? editorBlockActiveStyle : editorBlockPassiveStyle) }}
                onMouseDown={(evt) => handleEditorMouseDown(evt, 'ean', 'move')}
              >
                {editorSampleRow.ean13}
                {activeEditorElement === 'ean' && (
                  <button type="button" style={editorResizeHandleStyle} onMouseDown={(evt) => handleEditorMouseDown(evt, 'ean', 'resize')} />
                )}
              </div>
            )}

            {printSettings.show_label_detail && (
              <div
                style={{ ...editorBlockStyle, ...rectToPercentStyle(editorLayout.name), fontSize: `${layoutMetrics.productNameTextSizePt}px`, fontWeight: 700, ...(activeEditorElement === 'name' ? editorBlockActiveStyle : editorBlockPassiveStyle) }}
                onMouseDown={(evt) => handleEditorMouseDown(evt, 'name', 'move')}
              >
                {buildLabelDisplayText(editorSampleRow)}
                {activeEditorElement === 'name' && (
                  <button type="button" style={editorResizeHandleStyle} onMouseDown={(evt) => handleEditorMouseDown(evt, 'name', 'resize')} />
                )}
              </div>
            )}

            {printSettings.show_product_code && (
              <div
                style={{ ...editorBlockStyle, ...rectToPercentStyle(editorLayout.code), fontSize: `${Math.max(6, layoutMetrics.textSizePt - 1)}px`, ...(activeEditorElement === 'code' ? editorBlockActiveStyle : editorBlockPassiveStyle) }}
                onMouseDown={(evt) => handleEditorMouseDown(evt, 'code', 'move')}
              >
                {editorSampleRow.productCode}
                {activeEditorElement === 'code' && (
                  <button type="button" style={editorResizeHandleStyle} onMouseDown={(evt) => handleEditorMouseDown(evt, 'code', 'resize')} />
                )}
              </div>
            )}

            {printSettings.show_product_image && editorSampleRow.imageUrl && (
              <div
                style={{ ...editorBlockStyle, ...rectToPercentStyle(editorLayout.image), border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', ...(activeEditorElement === 'image' ? editorBlockActiveStyle : editorBlockPassiveStyle) }}
                onMouseDown={(evt) => handleEditorMouseDown(evt, 'image', 'move')}
              >
                <img src={editorSampleRow.imageUrl} alt={editorSampleRow.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {activeEditorElement === 'image' && (
                  <button type="button" style={editorResizeHandleStyle} onMouseDown={(evt) => handleEditorMouseDown(evt, 'image', 'resize')} />
                )}
              </div>
            )}
            </>
          )}
        </div>

        <div style={editorRightPanelStyle}>
          <details open style={editorAccordionStyle}>
            <summary style={editorAccordionSummaryStyle}>Katmanlar</summary>
            <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
              {EDITOR_VISIBILITY_KEYS.map((key) => (
                <div key={key} style={editorElementRowStyle}>
                  <button
                    type="button"
                    style={{
                      ...editorElementButtonStyle,
                      ...(activeEditorElement === key ? editorElementButtonActiveStyle : null),
                    }}
                    onClick={() => setActiveEditorElement(key)}
                  >
                    {EDITOR_VISIBILITY_LABELS[key]}
                  </button>
                  <button
                    type="button"
                    style={isEditorElementVisible(printSettings, key) ? editorToggleShowStyle : editorToggleHideStyle}
                    onClick={() => handleToggleEditorElementVisibility(key)}
                  >
                    {isEditorElementVisible(printSettings, key) ? 'Kaldir' : 'Goster'}
                  </button>
                </div>
              ))}
            </div>
          </details>

          <details open style={editorAccordionStyle}>
            <summary style={editorAccordionSummaryStyle}>Konum ve Olcek</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
              <label style={editorFieldStyle}>
                X %
                <input
                  type="number"
                  value={editorSelectedRect.x.toFixed(1)}
                  onChange={(evt) => updateEditorRect(activeEditorElement, { x: Number(evt.target.value) })}
                  style={inputStyle}
                />
              </label>
              <label style={editorFieldStyle}>
                Y %
                <input
                  type="number"
                  value={editorSelectedRect.y.toFixed(1)}
                  onChange={(evt) => updateEditorRect(activeEditorElement, { y: Number(evt.target.value) })}
                  style={inputStyle}
                />
              </label>
              <label style={editorFieldStyle}>
                Genislik %
                <input
                  type="number"
                  value={editorSelectedRect.w.toFixed(1)}
                  onChange={(evt) => updateEditorRect(activeEditorElement, { w: Number(evt.target.value) })}
                  style={inputStyle}
                />
              </label>
              <label style={editorFieldStyle}>
                Yukseklik %
                <input
                  type="number"
                  value={editorSelectedRect.h.toFixed(1)}
                  onChange={(evt) => updateEditorRect(activeEditorElement, { h: Number(evt.target.value) })}
                  style={inputStyle}
                />
              </label>
            </div>
            {activeEditorElement === 'barcode' && (
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#93c5fd' }}>
                Barkodu tasiyabilirsiniz; olceklendirmede oran sabit kalir ve icerik kutuya sigacak sekilde korunur.
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '8px' }}>
              <button type="button" style={secondaryButton} onClick={() => handleCenterActiveElement('x')}>
                Ortala Yatay
              </button>
              <button type="button" style={secondaryButton} onClick={() => handleCenterActiveElement('y')}>
                Ortala Dikey
              </button>
              <button type="button" style={secondaryButton} onClick={() => handleCenterActiveElement('both')}>
                Tam Ortala
              </button>
            </div>
          </details>

          <details style={editorAccordionStyle}>
            <summary style={editorAccordionSummaryStyle}>Metin ve Logo</summary>
            <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
              <label style={editorFieldStyle}>
                Logo Alti Metni (www.blaene.com.tr)
                <input
                  type="text"
                  value={printSettings.logo_subtext}
                  onChange={(evt) => setPrintSettings((prev) => ({ ...prev, logo_subtext: evt.target.value }))}
                  style={inputStyle}
                  placeholder="www.blaene.com.tr"
                />
                <span style={{ color: '#93c5fd', fontSize: '10px' }}>Gorunmesi icin Logo secenegi acik olmali.</span>
              </label>

              {getActiveElementPoint() !== null && (
                <label style={editorFieldStyle}>
                  Yazi Puntosu
                  <input
                    type="number"
                    min={6}
                    max={MAX_EDITOR_TEXT_POINT}
                    step={0.5}
                    value={Number(getActiveElementPoint() || 0).toFixed(1)}
                    onChange={(evt) => setActiveElementPoint(Number(evt.target.value))}
                    style={inputStyle}
                  />
                </label>
              )}
            </div>
          </details>

          <details style={editorAccordionStyle}>
            <summary style={editorAccordionSummaryStyle}>Kaydet ve Profiller</summary>
            <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button type="button" style={secondaryButton} onClick={handleResetEditorLayoutToDefault}>
                  Varsayilani Uygula
                </button>
                <button type="button" style={secondaryButton} onClick={handleSaveLayoutOnly} disabled={saving}>
                  {saving ? 'Kaydediliyor...' : 'Duzeni Kaydet'}
                </button>
              </div>

              <div style={{ color: '#93c5fd', fontSize: '11px', fontWeight: 700 }}>Hizli Ayar Profilleri (3 Slot)</div>
              {Array.from({ length: PRESET_SLOT_COUNT }, (_, index) => (
                <div key={`preset-slot-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button type="button" style={secondaryButton} onClick={() => handleApplyPresetSlot(index)}>
                    Ayar {index + 1} Uygula
                  </button>
                  <button type="button" style={secondaryButton} onClick={() => handleSavePresetSlot(index)} disabled={saving}>
                    Ayar {index + 1} Kaydet
                  </button>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </aside>
  )

  const persistMemory = async (nextMemory: BarcodeMemory, nextMessage?: string) => {
    if (!token) return
    setSaving(true)
    setError('')
    try {
      await saveSiteSetting(
        token,
        BARCODE_SETTINGS_KEY,
        nextMemory,
        'Barkod etiket hafizasi, 869 seri bilgisi ve baski ayarlari'
      )
      if (nextMessage) setMessage(nextMessage)
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Barkod hafizasi kaydedilemedi'
      setError(text)
    } finally {
      setSaving(false)
    }
  }

  const loadData = async () => {
    if (!token) {
      setError('Admin token bulunamadi')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [productsData, variantsData, storedMemory] = await Promise.all([
        fetchAdminCollectionAllPages<Product>(`/api/admin/products?category=all`, token, 200),
        fetchAdminCollectionAllPages<ProductVariant>(`/api/admin/product-variants`, token, 200).catch(() => []),
        getSiteSetting<BarcodeMemory>(token, BARCODE_SETTINGS_KEY, DEFAULT_BARCODE_MEMORY),
      ])

      const variantRows = normalizeVariants(variantsData)
      const variantsByProductId = new Map<string, ProductVariant[]>()
      variantRows.forEach((variant) => {
        const productId = normalizeText(variant.product_id)
        if (!productId) return
        const current = variantsByProductId.get(productId) || []
        current.push(variant)
        variantsByProductId.set(productId, current)
      })

      const nextProducts = normalizeProducts(productsData)
        .map((product) => ({
          ...product,
          variants: mergeVariants(product.variants, variantsByProductId.get(product.id) || []),
        }))
        .filter((item) => item.active !== false && item.archived !== true)
      const rawStoredLayout = normalizeEditorLayout((storedMemory as any)?.print_preset?.editor_layout)
      const storedLayoutWasBroken = isLikelyBrokenEditorLayout(rawStoredLayout)
      const normalizedFromApi = normalizeMemory(storedMemory)
      const localPresetSlots = readPresetSlotsFromLocalStorage()
      const hasApiPresetSlots = normalizedFromApi.preset_slots.some((slot) => Boolean(slot))
      const nextMemory: BarcodeMemory = {
        ...normalizedFromApi,
        preset_slots: hasApiPresetSlots ? normalizedFromApi.preset_slots : localPresetSlots,
      }
      writePresetSlotsToLocalStorage(nextMemory.preset_slots)
      setProducts(nextProducts)
      setMemory(nextMemory)
      setPrintSettings(nextMemory.print_preset)
      const rowsFromMemory = buildRowsFromMemory(nextMemory, nextProducts)
      setRows(rowsFromMemory)
      setIsLabelListOpen(rowsFromMemory.length > 0)
      if (storedLayoutWasBroken) {
        void persistMemory(nextMemory, 'Bozuk yerlesim kaydi algilandi; varsayilan format otomatik geri yuklendi.')
      }
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Veriler yuklenemedi'
      setError(text)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!productOptions.length) {
      if (selectedProductId) setSelectedProductId('')
      if (selectedChoiceKey) setSelectedChoiceKey('')
      return
    }

    if (!selectedProductId || !productOptions.some((item) => item.id === selectedProductId)) {
      const firstProductId = productOptions[0].id
      setSelectedProductId(firstProductId)
      return
    }

    const availableChoices = choices.filter((item) => item.productId === selectedProductId)
    if (!availableChoices.length) {
      setSelectedChoiceKey('')
      return
    }
    if (!selectedChoiceKey || !availableChoices.some((item) => item.key === selectedChoiceKey)) {
      setSelectedChoiceKey(availableChoices[0].key)
    }
  }, [choices, productOptions, selectedChoiceKey, selectedProductId])

  useEffect(() => {
    setRows((prev) => {
      let changed = false
      const next = prev.map((row) => {
        if (normalizeText(row.imageUrl)) return row
        const hydrated = getImageForRow(row.productId, row.productCode)
        if (!hydrated) return row
        changed = true
        return { ...row, imageUrl: hydrated }
      })
      return changed ? next : prev
    })
  }, [productImageById, productImageByCode])

  useEffect(() => {
    if (pageMode === 'add') return
    setActiveBarcodeEditKey(null)
    setBarcodeEditDrafts({})
  }, [pageMode])

  useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (event: MouseEvent) => {
      const dx = event.clientX - dragState.startClientX
      const dy = event.clientY - dragState.startClientY
      const canvasWidth = Math.max(1, dragState.canvasRect.width)
      const canvasHeight = Math.max(1, dragState.canvasRect.height)
      const dxPercent = (dx / canvasWidth) * 100
      const dyPercent = (dy / canvasHeight) * 100

      if (dragState.mode === 'move') {
        updateEditorRect(dragState.key, {
          x: dragState.startRect.x + dxPercent,
          y: dragState.startRect.y + dyPercent,
        })
        return
      }

      if (dragState.key === 'barcode') {
        const baseRatio = dragState.startRect.w > 0 ? dragState.startRect.h / dragState.startRect.w : 0.65
        const resizeDelta = Math.abs(dxPercent) >= Math.abs(dyPercent) ? dxPercent : dyPercent
        const nextW = toClampedNumber(dragState.startRect.w + resizeDelta, dragState.startRect.w, 20, 95)
        const nextH = toClampedNumber(nextW * baseRatio, dragState.startRect.h, 12, 85)
        updateEditorRect(dragState.key, {
          w: nextW,
          h: nextH,
        })
        return
      }

      updateEditorRect(dragState.key, {
        w: dragState.startRect.w + dxPercent,
        h: dragState.startRect.h + dyPercent,
      })
    }

    const handleMouseUp = () => {
      setDragState(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState])

  const handleAddRow = async () => {
    setError('')
    setMessage('')
    if (!selectedChoice) {
      setError('Lutfen urun ve renk secin')
      return
    }
    if (hasExistingLabelSignature(selectedChoice.productName, selectedChoice.color, selectedChoice.productCode)) {
      setError(`${selectedChoice.productCode} / ${selectedChoice.color} zaten listede mevcut. Ayni renk icin ikinci barkod olusturulamaz.`)
      return
    }

    try {
      const assignment = ensureBarcodeForChoice(selectedChoice, memory)
      setMemory(assignment.nextMemory)

      if (assignment.created) {
        void persistMemory(assignment.nextMemory)
      }

      setRows((prev) => {
        const foundIndex = prev.findIndex((item) => item.key === selectedChoice.key)
        if (foundIndex === -1) {
          return [
            ...prev,
            {
              key: selectedChoice.key,
              productId: selectedChoice.productId,
              variantId: selectedChoice.variantId,
              productCode: selectedChoice.productCode,
              productName: selectedChoice.productName,
              color: selectedChoice.color,
              ean13: assignment.ean13,
              imageUrl: selectedChoice.imageUrl || getImageForRow(selectedChoice.productId, selectedChoice.productCode),
              quantity: 0,
            },
          ]
        }

        const next = [...prev]
        next[foundIndex] = {
          ...next[foundIndex],
          ean13: assignment.ean13,
          imageUrl: next[foundIndex].imageUrl || selectedChoice.imageUrl || getImageForRow(selectedChoice.productId, selectedChoice.productCode),
        }
        return next
      })

      setMessage(
        `${selectedChoice.productCode} / ${selectedChoice.color} icin benzersiz barkod uretildi`
      )
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Barkod olusturulamadi'
      setError(text)
    }
  }

  const handleAddAllVariants = () => {
    setError('')
    setMessage('')
    if (!choicesForProduct.length) {
      setError('Secili urun icin varyant bulunamadi')
      return
    }

    let workingMemory = memory
    let createdCount = 0
    let skippedCount = 0
    const assignmentByKey: Record<string, string> = {}

    try {
      choicesForProduct.forEach((choice) => {
        if (hasExistingLabelSignature(choice.productName, choice.color, choice.productCode)) {
          skippedCount += 1
          return
        }
        const assignment = ensureBarcodeForChoice(choice, workingMemory)
        assignmentByKey[choice.key] = assignment.ean13
        workingMemory = assignment.nextMemory
        if (assignment.created) createdCount += 1
      })
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Toplu barkod olusturulamadi'
      setError(text)
      return
    }

    setMemory(workingMemory)
    if (createdCount > 0) {
      void persistMemory(workingMemory)
    }

    setRows((prev) => {
      const next = [...prev]
      choicesForProduct.forEach((choice) => {
        if (!assignmentByKey[choice.key]) return
        const foundIndex = next.findIndex((item) => item.key === choice.key)
        if (foundIndex === -1) {
          next.push({
            key: choice.key,
            productId: choice.productId,
            variantId: choice.variantId,
            productCode: choice.productCode,
            productName: choice.productName,
            color: choice.color,
            ean13: assignmentByKey[choice.key],
            imageUrl: choice.imageUrl || getImageForRow(choice.productId, choice.productCode),
            quantity: 0,
          })
          return
        }
        next[foundIndex] = {
          ...next[foundIndex],
          ean13: assignmentByKey[choice.key],
          imageUrl: next[foundIndex].imageUrl || choice.imageUrl || getImageForRow(choice.productId, choice.productCode),
        }
      })
      return next
    })

    if (createdCount === 0) {
      setError('Secili urunun tum renkleri zaten listede. Yeni barkod olusturulmadi.')
      return
    }

    const productCode = normalizeText(selectedProductId) ? choicesForProduct[0].productCode : 'Secili urun'
    if (skippedCount > 0) {
      setMessage(`${productCode} icin ${createdCount} yeni barkod uretildi, ${skippedCount} renk zaten mevcut oldugu icin atlandi`)
      return
    }
    setMessage(`${productCode} icin ${createdCount} benzersiz barkod uretildi`)
  }

  const handleRemoveRow = (index: number) => {
    const row = rows[index]
    if (!row) return
    const approved = window.confirm(`${buildLabelDisplayText(row)} barkodu (${row.ean13}) silinsin mi?`)
    if (!approved) return

    const nextMemory: BarcodeMemory = {
      ...memory,
      items: { ...memory.items },
    }
    delete nextMemory.items[row.key]

    setMemory(nextMemory)
    void persistMemory(nextMemory, `${buildLabelDisplayText(row)} barkodu silindi`)
    setRows((prev) => prev.filter((_, idx) => idx !== index))
    setBarcodeEditDrafts((prev) => {
      const next = { ...prev }
      delete next[row.key]
      return next
    })
    if (activeBarcodeEditKey === row.key) {
      setActiveBarcodeEditKey(null)
    }
    setAddToPrintDrafts((prev) => {
      const next = { ...prev }
      delete next[row.key]
      return next
    })
  }

  const handleToggleBarcodeEdit = (row: LabelRow) => {
    if (pageMode !== 'add') return
    if (activeBarcodeEditKey === row.key) {
      setActiveBarcodeEditKey(null)
      setBarcodeEditDrafts((prev) => {
        const next = { ...prev }
        delete next[row.key]
        return next
      })
      return
    }

    const approved = window.confirm(`${buildLabelDisplayText(row)} icin barkodu manuel degistirmek istediginize emin misiniz?`)
    if (!approved) return

    setError('')
    setActiveBarcodeEditKey(row.key)
    setBarcodeEditDrafts((prev) => ({ ...prev, [row.key]: row.ean13 }))
  }

  const handleAddToPrintInput = (rowKey: string, value: string) => {
    setAddToPrintDrafts((prev) => ({ ...prev, [rowKey]: value.replace(/\D/g, '').slice(0, 3) }))
  }

  const handleAddToPrint = (row: LabelRow) => {
    const rawValue = addToPrintDrafts[row.key]
    const amount = Math.max(1, Math.min(999, Math.floor(Number(rawValue) || 1)))
    setRows((prev) =>
      prev.map((item) => (item.key === row.key ? { ...item, quantity: Math.min(999, item.quantity + amount) } : item))
    )
    setAddToPrintDrafts((prev) => {
      const next = { ...prev }
      delete next[row.key]
      return next
    })
    setError('')
    setMessage(`${buildLabelDisplayText(row)} yazdirmaya +${amount} adet eklendi`)
  }

  const handleDecreasePrintQuantity = (row: LabelRow) => {
    let changed = false
    setRows((prev) =>
      prev.map((item) => {
        if (item.key !== row.key) return item
        const nextQuantity = Math.max(0, Math.floor(item.quantity || 0) - 1)
        if (nextQuantity !== item.quantity) changed = true
        return { ...item, quantity: nextQuantity }
      })
    )
    setError('')
    if (changed) {
      setMessage(`${buildLabelDisplayText(row)} yazdirma adedi 1 azaltildi`)
    } else {
      setMessage(`${buildLabelDisplayText(row)} yazdirma adedi zaten 0`)
    }
  }

  const handleRemoveFromPrintQueue = (row: LabelRow) => {
    const hasQuantity = Math.max(0, Math.floor(row.quantity || 0)) > 0
    if (!hasQuantity) {
      setMessage(`${buildLabelDisplayText(row)} zaten yazdirma listesinde degil`)
      return
    }

    setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, quantity: 0 } : item)))
    setAddToPrintDrafts((prev) => {
      const next = { ...prev }
      delete next[row.key]
      return next
    })
    setError('')
    setMessage(`${buildLabelDisplayText(row)} yazdirma listesinden kaldirildi`)
  }

  const handleQueueQuantityInput = (row: LabelRow, value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    const nextQuantity = Math.max(0, Math.min(999, Math.floor(Number(digits) || 0)))
    setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, quantity: nextQuantity } : item)))
    setError('')
  }

  const handleQueueQuantityStep = (row: LabelRow, delta: number) => {
    const current = Math.max(0, Math.floor(row.quantity || 0))
    const nextQuantity = Math.max(0, Math.min(999, current + delta))
    setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, quantity: nextQuantity } : item)))
    setError('')
  }

  const handleBarcodeInput = (rowKey: string, value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 13)
    setBarcodeEditDrafts((prev) => ({ ...prev, [rowKey]: digits }))
  }

  const handleBarcodeCommit = (rowKey: string) => {
    const row = rows.find((item) => item.key === rowKey)
    if (!row) return
    if (activeBarcodeEditKey !== rowKey) return
    const rawValue = barcodeEditDrafts[rowKey]
    if (rawValue === undefined) {
      setActiveBarcodeEditKey(null)
      return
    }
    const normalized = rawValue.replace(/\D/g, '')
    if (normalized === row.ean13) {
      setBarcodeEditDrafts((prev) => {
        const next = { ...prev }
        delete next[rowKey]
        return next
      })
      setActiveBarcodeEditKey(null)
      return
    }
    if (!isValidEan13(normalized)) {
      setError('EAN-13 barkod gecersiz. 13 hane ve dogru check-digit gerekli.')
      return
    }

    const duplicate = Object.entries(memory.items).find(
      ([key, item]) => key !== row.key && item.ean13 === normalized
    )
    if (duplicate) {
      setError('Bu barkod zaten baska bir urun/renk icin kayitli.')
      return
    }

    const rowSignature = buildLabelSignature(row.productName, row.color, row.productCode)
    const nextItems = { ...memory.items }
    Object.entries(nextItems).forEach(([key, item]) => {
      if (key === row.key) return
      const itemSignature = buildLabelSignature(item.product_name, item.color, item.product_code)
      if (itemSignature === rowSignature) {
        delete nextItems[key]
      }
    })
    nextItems[row.key] = {
      ean13: normalized,
      product_id: row.productId,
      variant_id: row.variantId,
      product_code: row.productCode,
      product_name: row.productName,
      color: row.color,
      updated_at: new Date().toISOString(),
    }

    const nextMemory: BarcodeMemory = {
      ...memory,
      items: nextItems,
    }

    setRows((prev) => prev.map((item) => (item.key === rowKey ? { ...item, ean13: normalized } : item)))
    setMemory(nextMemory)
    setBarcodeEditDrafts((prev) => {
      const next = { ...prev }
      delete next[rowKey]
      return next
    })
    setActiveBarcodeEditKey(null)
    setError('')
    void persistMemory(nextMemory, `${row.productCode} / ${row.color} barkodu kaydedildi`)
  }

  const handleSavePrintSettings = () => {
    const normalizedSettings = normalizePrintSettings(printSettings)
    setPrintSettings(normalizedSettings)
    const nextMemory: BarcodeMemory = {
      ...memory,
      print_preset: normalizedSettings,
    }
    setMemory(nextMemory)
    void persistMemory(nextMemory, 'Baski ayarlari kaydedildi')
  }

  const handleApplyXpPreset = (preset: PaperPreset) => {
    const nextSettings = getRecommendedSettingsForXp429b(preset, printSettings)
    setPrintSettings(nextSettings)
    setError('')
    const msg =
      preset === 'label_100x100'
        ? 'XP-429B 100x100 profili uygulandi ve kaydedildi (2x2, sayfa basi 4 etiket)'
        : 'XP-429B 100x150 profili uygulandi ve kaydedildi (2x3, sayfa basi 6 etiket)'
    setMessage(msg)
    const nextMemory: BarcodeMemory = { ...memory, print_preset: nextSettings }
    setMemory(nextMemory)
    void persistMemory(nextMemory, msg)
  }

  const handleSetStandardBarcodeBox = () => {
    setPrintSettings((prev) => ({
      ...prev,
      barcode_width_mm: STANDARD_BARCODE_WIDTH_MM,
      barcode_height_mm: STANDARD_BARCODE_HEIGHT_MM,
      editor_layout: {
        ...normalizeEditorLayout(prev.editor_layout),
        barcode: normalizeEditorLayout(getDefaultEditorLayoutForPreset(prev.paper_preset)).barcode,
      },
    }))
    setError('')
    setMessage('Barkod kutusu 45mm x 25mm standart olcuye alindi ve konumu sifirlandi')
  }

  const openPrintWindow = (fixedPrintSettings: PrintSettings, autoPrint: boolean) => {
    const html = buildPrintHtml(expandedRows, fixedPrintSettings)
    const win = window.open('', '_blank', 'width=1100,height=900')
    if (!win) {
      setError('Tarayici popup engelledi. Lutfen izin verin.')
      return
    }

    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    if (autoPrint) {
      win.onload = () => {
        window.setTimeout(() => {
          win.print()
        }, 180)
      }
      win.onafterprint = () => {
        win.close()
      }
      return
    }
    setMessage('Yazdirma onizlemesi yeni sekmede acildi.')
  }

  const applyPreparedPrintSettings = () => {
    const fixedPrintSettings = normalizePrintSettings(printSettings)
    setPrintSettings(fixedPrintSettings)

    const nextMemory: BarcodeMemory = {
      ...memory,
      print_preset: fixedPrintSettings,
    }
    setMemory(nextMemory)
    void persistMemory(nextMemory)
    return fixedPrintSettings
  }

  const handlePrint = () => {
    setError('')
    setMessage('')
    if (!expandedRows.length) {
      setError('Yazdirilacak etiket yok. Once listeye urun ekleyin.')
      return
    }
    const invalidRow = rowsQueuedForPrint.find((row) => !isValidEan13(row.ean13))
    if (invalidRow) {
      setError(`Yazdirmadan once tum barkodlari duzeltin. Gecersiz: ${invalidRow.productCode} / ${invalidRow.color}`)
      return
    }

    const fixedPrintSettings = applyPreparedPrintSettings()
    openPrintWindow(fixedPrintSettings, true)
  }

  const handleOpenPrintPreview = () => {
    setError('')
    setMessage('')
    if (!expandedRows.length) {
      setError('Onizleme icin once listeye en az bir etiket ekleyin.')
      return
    }
    const invalidRow = rowsQueuedForPrint.find((row) => !isValidEan13(row.ean13))
    if (invalidRow) {
      setError(`Onizleme oncesi gecersiz barkodu duzeltin: ${invalidRow.productCode} / ${invalidRow.color}`)
      return
    }
    const fixedPrintSettings = applyPreparedPrintSettings()
    openPrintWindow(fixedPrintSettings, false)
  }

  const handleClearPrintQueue = () => {
    if (!rowsQueuedForPrint.length) {
      setMessage('Yazdirma listesi zaten bos')
      return
    }
    const approved = window.confirm('Yazdirma listesindeki tum urunler kaldirilsin mi? Barkod kayitlari korunur.')
    if (!approved) return
    setRows((prev) => prev.map((row) => ({ ...row, quantity: 0 })))
    setAddToPrintDrafts({})
    setError('')
    setMessage('Yazdirma listesi temizlendi')
  }

  if (loading) {
    return <p style={{ color: '#94a3b8' }}>Barkod sistemi yukleniyor...</p>
  }

  return (
    <div>
      <h2 style={{ ...titleStyle, marginBottom: '6px' }}>Barkod Yazdir</h2>
      <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: 0, marginBottom: '16px' }}>
        Her urun + renk icin benzersiz EAN-13 barkod olusturur. Seri 869 ile baslar ve hafizada saklanir.
      </p>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Barkod Giris Ekrani</h3>
        <div style={modeGridStyle}>
          <button
            type="button"
            style={pageMode === 'add' ? modeCardActiveStyle : modeCardStyle}
            onClick={() => setPageMode('add')}
          >
            <span style={modeCardTitleStyle}>Urun Ekle</span>
            <span style={modeCardDescStyle}>Yeni urun/renk icin benzersiz barkod olustur</span>
          </button>
          <button
            type="button"
            style={pageMode === 'print' ? modeCardActiveStyle : modeCardStyle}
            onClick={() => setPageMode('print')}
          >
            <span style={modeCardTitleStyle}>Urun Yazdir</span>
            <span style={modeCardDescStyle}>Adet, baski ayari ve onizleme ile yazdir</span>
          </button>
        </div>
      </div>

      {pageMode === 'add' && (
        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>Barkod Olustur</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px', alignItems: 'end' }}>
            <div>
              <div style={labelStyle}>Kategori</div>
              <select
                value={categoryFilter}
                onChange={(evt) => setCategoryFilter(normalizeCategory(evt.target.value))}
                style={inputStyle}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Urun</div>
              <select
                value={selectedProductId}
                onChange={(evt) => setSelectedProductId(evt.target.value)}
                style={inputStyle}
                disabled={!productOptions.length}
              >
                {!productOptions.length && <option value="">Urun bulunamadi</option>}
                {productOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={labelStyle}>Renk / Varyant</div>
              <select
                value={selectedChoiceKey}
                onChange={(evt) => setSelectedChoiceKey(evt.target.value)}
                style={inputStyle}
                disabled={!choicesForProduct.length}
              >
                {!choicesForProduct.length && <option value="">Varyant yok</option>}
                {choicesForProduct.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.color}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" onClick={() => void handleAddRow()} style={primaryButton}>
              + Barkod Olustur
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleAddAllVariants} style={secondaryButton}>
              Secili Urunun Tum Renklerini Ekle
            </button>
            <button type="button" onClick={() => setPageMode('print')} style={secondaryButton}>
              Urun Yazdir ekranina gec
            </button>
          </div>

          <div style={{ marginTop: '10px', color: '#93c5fd', fontSize: '12px' }}>
            Hafizadaki barkod adedi: <strong>{Object.keys(memory.items).length}</strong> | Yazdirma kuyrugundaki farkli etiket: <strong>{queuedVariantCount}</strong>
          </div>
        </div>
      )}

      <div style={panelStyle}>
        <button
          type="button"
          style={sectionToggleStyle}
          onClick={() => setIsLabelListOpen((prev) => !prev)}
        >
          <span>{pageMode === 'print' ? 'Yazdirma Listesi' : 'Etiket Listesi'}</span>
          <span>{isLabelListOpen ? 'Kapat' : 'Ac'}</span>
        </button>
        {isLabelListOpen && (
          <>
            {!rows.length ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                <p style={{ color: '#94a3b8', margin: 0, fontSize: '12px' }}>
                  Henuz etiket yok. Urun ekledikce liste olusur.
                </p>
                {pageMode === 'print' && (
                  <button type="button" style={secondaryButton} onClick={() => setPageMode('add')}>
                    Once Urun Ekle moduna gec
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px', overflowX: 'auto' }}>
                {rows.map((row, index) => (
                  pageMode === 'add' ? (
                    <div
                      key={row.key}
                      style={{
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        background: '#0f172a',
                        padding: '10px',
                        display: 'grid',
                        gridTemplateColumns:
                          'minmax(200px, 1.2fr) minmax(92px, auto) minmax(220px, 1fr) minmax(170px, 0.9fr) minmax(110px, auto) minmax(110px, auto) minmax(65px, auto)',
                        gap: '8px',
                        alignItems: 'center',
                        minWidth: '1080px',
                      }}
                    >
                      <div>
                        <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 700 }}>
                          {buildLabelDisplayText(row)}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px' }}>{row.productCode}</div>
                      </div>

                      <div
                        style={{
                          width: '82px',
                          height: '64px',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          background: '#020617',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {row.imageUrl ? (
                          <>
                            <img
                              src={row.imageUrl}
                              alt={row.productName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={(evt) => {
                                evt.currentTarget.style.display = 'none'
                                const fallback = evt.currentTarget.parentElement?.querySelector('[data-img-fallback]')
                                if (fallback && fallback instanceof HTMLElement) fallback.style.display = 'block'
                              }}
                            />
                            <span
                              data-img-fallback
                              style={{ display: 'none', fontSize: '10px', color: '#94a3b8' }}
                            >
                              Gorsel yok
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>Gorsel yok</span>
                        )}
                      </div>

                      <div style={{ minHeight: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderBarcodeSafe(row.ean13, listBarcodeWidthPx, listBarcodeHeightPx),
                          }}
                        />
                        <div style={{ marginTop: '4px', fontSize: '11px', letterSpacing: '0.4px', color: '#cbd5e1' }}>
                          {row.ean13}
                        </div>
                      </div>

                      <input
                        value={barcodeEditDrafts[row.key] ?? row.ean13}
                        onChange={(evt) => handleBarcodeInput(row.key, evt.target.value)}
                        onKeyDown={(evt) => {
                          if (evt.key === 'Enter') {
                            evt.preventDefault()
                            handleBarcodeCommit(row.key)
                          }
                        }}
                        style={inputStyle}
                        placeholder="EAN13"
                        disabled={activeBarcodeEditKey !== row.key}
                      />

                      <button type="button" style={secondaryButton} onClick={() => handleToggleBarcodeEdit(row)}>
                        Barkod Degistir
                      </button>

                      {activeBarcodeEditKey === row.key ? (
                        <button type="button" style={primaryButton} onClick={() => handleBarcodeCommit(row.key)}>
                          Kaydet
                        </button>
                      ) : (
                        <div />
                      )}

                      <button type="button" style={dangerMiniStyle} onClick={() => handleRemoveRow(index)}>
                        Sil
                      </button>
                    </div>
                  ) : (
                    <div
                      key={row.key}
                      style={{
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        background: '#0f172a',
                        padding: '10px',
                        display: 'grid',
                        gridTemplateColumns:
                          'minmax(210px, 1.2fr) minmax(92px, auto) minmax(240px, 1fr) minmax(100px, auto) minmax(130px, auto) minmax(65px, auto)',
                        gap: '10px',
                        alignItems: 'center',
                        minWidth: '980px',
                      }}
                    >
                      <div>
                        <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 700 }}>
                          {buildLabelDisplayText(row)}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px' }}>{row.productCode}</div>
                        <div style={{ color: '#93c5fd', fontSize: '11px', marginTop: '2px' }}>
                          Yazdirma adedi: <strong>{Math.max(0, row.quantity)}</strong>
                        </div>
                      </div>

                      <div
                        style={{
                          width: '82px',
                          height: '64px',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          background: '#020617',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {row.imageUrl ? (
                          <>
                            <img
                              src={row.imageUrl}
                              alt={row.productName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={(evt) => {
                                evt.currentTarget.style.display = 'none'
                                const fallback = evt.currentTarget.parentElement?.querySelector('[data-img-fallback]')
                                if (fallback && fallback instanceof HTMLElement) fallback.style.display = 'block'
                              }}
                            />
                            <span
                              data-img-fallback
                              style={{ display: 'none', fontSize: '10px', color: '#94a3b8' }}
                            >
                              Gorsel yok
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>Gorsel yok</span>
                        )}
                      </div>

                      <div style={{ minHeight: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderBarcodeSafe(row.ean13, listBarcodeWidthPx, listBarcodeHeightPx),
                          }}
                        />
                        <div style={{ marginTop: '4px', fontSize: '11px', letterSpacing: '0.4px', color: '#cbd5e1' }}>
                          {row.ean13}
                        </div>
                      </div>

                      <input
                        value={addToPrintDrafts[row.key] ?? ''}
                        onChange={(evt) => handleAddToPrintInput(row.key, evt.target.value)}
                        style={inputStyle}
                        placeholder="+Adet"
                      />

                      <button type="button" style={secondaryButton} onClick={() => handleAddToPrint(row)}>
                        Yazdirmaya Ekle
                      </button>

                      <button type="button" style={dangerMiniStyle} onClick={() => handleDecreasePrintQuantity(row)}>
                        Sil
                      </button>
                    </div>
                  )
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {pageMode === 'print' && (
        <>
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>
          Baski Ayarlari ({layoutMetrics.columns} sutun x {layoutMetrics.rows} satir)
        </h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <button type="button" style={secondaryButton} onClick={() => handleApplyXpPreset('label_100x150')}>
            XP-429B Profili: 100x150 (6 Etiket)
          </button>
          <button type="button" style={secondaryButton} onClick={() => handleApplyXpPreset('label_100x100')}>
            XP-429B Profili: 100x100 (4 Etiket)
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '10px' }}>
          <div>
            <div style={labelStyle}>Etiket boyutu</div>
            <select
              value={printSettings.paper_preset}
              onChange={(evt) => handleApplyXpPreset(normalizePaperPreset(evt.target.value))}
              style={inputStyle}
            >
              {PAPER_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Logo URL</div>
            <input
              value={printSettings.logo_url}
              onChange={(evt) => setPrintSettings((prev) => ({ ...prev, logo_url: evt.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Logo alti metni</div>
            <input
              value={printSettings.logo_subtext}
              onChange={(evt) => setPrintSettings((prev) => ({ ...prev, logo_subtext: evt.target.value }))}
              style={inputStyle}
              placeholder="www.blaene.com.tr"
            />
          </div>
          <div>
            <div style={labelStyle}>Sutun sayisi</div>
            <input
              type="number"
              min={1}
              max={8}
              value={layoutMetrics.columns}
              disabled
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Satir sayisi</div>
            <input
              type="number"
              min={1}
              max={12}
              value={layoutMetrics.rows}
              disabled
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Sayfa kenar boslugu (mm)</div>
            <input
              type="number"
              min={0.8}
              max={3}
              value={printSettings.page_margin_mm}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, page_margin_mm: toClampedNumber(evt.target.value, prev.page_margin_mm, 0.8, 3) }))
              }
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '8px' }}>
          <div>
            <div style={labelStyle}>Sutun arasi (mm)</div>
            <input
              type="number"
              min={0}
              max={20}
              value={printSettings.col_gap_mm}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, col_gap_mm: toClampedNumber(evt.target.value, prev.col_gap_mm, 0, 20) }))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Satir arasi (mm)</div>
            <input
              type="number"
              min={0}
              max={20}
              value={printSettings.row_gap_mm}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, row_gap_mm: toClampedNumber(evt.target.value, prev.row_gap_mm, 0, 20) }))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Logo yuksekligi (mm)</div>
            <input
              type="number"
              min={3}
              max={18}
              value={printSettings.logo_height_mm}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, logo_height_mm: toClampedNumber(evt.target.value, prev.logo_height_mm, 3, 18) }))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Kart ic bosluk (mm)</div>
            <input
              type="number"
              min={0}
              max={10}
              value={printSettings.label_padding_mm}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, label_padding_mm: toClampedNumber(evt.target.value, prev.label_padding_mm, 0, 10) }))
              }
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '8px' }}>
          <div>
            <div style={labelStyle}>Barkod genisligi (mm)</div>
            <input
              type="number"
              min={25}
              max={96}
              value={printSettings.barcode_width_mm}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, barcode_width_mm: toClampedNumber(evt.target.value, prev.barcode_width_mm, 25, 96) }))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Barkod yuksekligi (mm)</div>
            <input
              type="number"
              min={12}
              max={45}
              value={printSettings.barcode_height_mm}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, barcode_height_mm: toClampedNumber(evt.target.value, prev.barcode_height_mm, 12, 45) }))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Urun kodu boyutu (pt)</div>
            <input
              type="number"
              min={6}
              max={MAX_EDITOR_TEXT_POINT}
              value={printSettings.text_size_pt}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, text_size_pt: toClampedNumber(evt.target.value, prev.text_size_pt, 6, MAX_EDITOR_TEXT_POINT) }))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Barkod numarasi boyutu (pt)</div>
            <input
              type="number"
              min={6}
              max={MAX_EDITOR_TEXT_POINT}
              value={printSettings.ean_text_size_pt}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, ean_text_size_pt: toClampedNumber(evt.target.value, prev.ean_text_size_pt, 6, MAX_EDITOR_TEXT_POINT) }))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Urun adi boyutu (pt)</div>
            <input
              type="number"
              min={6}
              max={MAX_EDITOR_TEXT_POINT}
              value={printSettings.product_name_size_pt}
              onChange={(evt) =>
                setPrintSettings((prev) => ({ ...prev, product_name_size_pt: toClampedNumber(evt.target.value, prev.product_name_size_pt, 6, MAX_EDITOR_TEXT_POINT) }))
              }
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" style={secondaryButton} onClick={handleSetStandardBarcodeBox}>
              Barkod Olcusu Standart (45x25)
            </button>
          </div>
        </div>

        <div style={{ color: '#93c5fd', fontSize: '12px', marginBottom: '10px' }}>
          Secili termal format: <strong>{layoutMetrics.paper.widthMm} x {layoutMetrics.paper.heightMm} mm</strong> | Sayfa basi etiket: <strong>{labelsPerPage}</strong>
        </div>
        <div style={{ color: '#93c5fd', fontSize: '12px', marginBottom: '10px' }}>
          Sayfa duzeni: <strong>{layoutMetrics.columns} x {layoutMetrics.rows} (kapasite {fixedPageCount} etiket)</strong>
        </div>
        <div style={{ color: '#93c5fd', fontSize: '12px', marginBottom: '10px' }}>
          Bu baskida toplam: <strong>{expandedRows.length}</strong> etiket, tahmini sayfa: <strong>{previewPages.length || 1}</strong>
        </div>
        <div style={{ color: '#cbd5e1', fontSize: '12px', marginBottom: '10px' }}>
          Onizleme bu alanlardaki degisikliklerde anlik olarak otomatik guncellenir.
        </div>
        <div style={{ color: '#fef3c7', fontSize: '12px', lineHeight: 1.5, background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.38)', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
          XP-429B yazdirma notu: Yazdir penceresinde olcegi %100 tutun, kenarsiz/fit-to-page seceneklerini kapatin ve kagit boyutunu secili etikete (100x150 veya 100x100) esleyin.
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={printSettings.show_logo}
              onChange={(evt) => setPrintSettings((prev) => ({ ...prev, show_logo: evt.target.checked }))}
            />
            Logo goster
          </label>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={printSettings.show_logo_subtext}
              onChange={(evt) => setPrintSettings((prev) => ({ ...prev, show_logo_subtext: evt.target.checked }))}
            />
            Logo alti metni goster
          </label>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={printSettings.show_product_image}
              onChange={(evt) => setPrintSettings((prev) => ({ ...prev, show_product_image: evt.target.checked }))}
            />
            Urun gorselini goster
          </label>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={printSettings.show_product_name}
              onChange={(evt) => setPrintSettings((prev) => ({ ...prev, show_product_name: evt.target.checked }))}
            />
            Urun adini goster
          </label>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={printSettings.show_color}
              onChange={(evt) => setPrintSettings((prev) => ({ ...prev, show_color: evt.target.checked }))}
            />
            Rengi goster
          </label>
        </div>

        <div style={{ marginBottom: '12px' }}>
          {layoutEditorNode}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={secondaryButton} onClick={handleSavePrintSettings} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Ayarlari Kaydet'}
          </button>
          <button type="button" style={secondaryButton} onClick={handleOpenPrintPreview}>
            Yazdirma Onizleme Ac
          </button>
          <button type="button" style={primaryButton} onClick={handlePrint}>
            Barkodlari Yazdir
          </button>
        </div>
      </div>

      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>Onizleme</h3>
        <div style={previewLayoutStyle}>
          <div style={previewCanvasAreaStyle}>
            {!expandedRows.length ? (
              <p style={{ color: '#94a3b8', margin: 0, fontSize: '12px' }}>Onizleme icin listeye etiket ekleyin.</p>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {previewPages.slice(0, 2).map((pageRows, pageIndex) => {
                  const previewScale = 2.2
                  const barcodePreviewWidth = Math.max(60, Math.round(layoutMetrics.barcodeWidthPx * previewScale))
                  const barcodePreviewHeight = Math.max(30, Math.round(layoutMetrics.barcodeHeightPx * previewScale))

                  return (
                    <div
                      key={`preview-page-${pageIndex}`}
                      style={{
                        ...previewPageStyle,
                        width: `${layoutMetrics.paper.widthMm * previewScale}px`,
                        height: `${layoutMetrics.paper.heightMm * previewScale}px`,
                        maxWidth: '100%',
                        padding: `${Math.max(4, layoutMetrics.safeMarginMm * previewScale)}px`,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${layoutMetrics.columns}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${layoutMetrics.rows}, minmax(0, 1fr))`,
                        columnGap: `${Math.max(2, printSettings.col_gap_mm * previewScale)}px`,
                        rowGap: `${Math.max(2, printSettings.row_gap_mm * previewScale)}px`,
                      }}
                    >
                      {pageRows.map((row, idx) => (
                        <div
                          key={`preview-cell-${pageIndex}-${idx}`}
                          style={{
                            ...previewLabelStyle,
                            borderStyle: 'solid',
                            borderColor: '#0f172a',
                            padding: `${Math.max(4, printSettings.label_padding_mm * previewScale)}px`,
                          }}
                        >
                          {printSettings.show_logo && (
                            <div style={{ ...previewEditorElementStyle, ...rectToPercentStyle(editorLayout.logo) }}>
                              <img
                                src={printSettings.logo_url}
                                alt="Blaene"
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                              />
                            </div>
                          )}
                          {layoutMetrics.showLogoSubtext && resolvedLogoSubtext && printSettings.show_logo && printSettings.show_logo_subtext && (
                            <div
                              style={{
                                ...previewEditorElementStyle,
                                ...rectToPercentStyle(editorLayout.logoSubtext),
                                fontSize: `${Math.max(8, layoutMetrics.textSizePt - 1)}px`,
                                color: '#334155',
                              }}
                            >
                              {resolvedLogoSubtext}
                            </div>
                          )}
                          {printSettings.show_barcode && (
                            <div
                              style={{ ...previewEditorElementStyle, ...rectToPercentStyle(editorLayout.barcode) }}
                              dangerouslySetInnerHTML={{
                                __html: renderBarcodeSafe(row.ean13, barcodePreviewWidth, barcodePreviewHeight),
                              }}
                            />
                          )}
                          {printSettings.show_product_image && row.imageUrl ? (
                            <div
                              style={{
                                ...previewEditorElementStyle,
                                ...rectToPercentStyle(editorLayout.image),
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                background: '#fff',
                              }}
                            >
                              <img
                                src={row.imageUrl}
                                alt={row.productName}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                onError={(evt) => {
                                  evt.currentTarget.style.display = 'none'
                                }}
                              />
                            </div>
                          ) : null}
                          {printSettings.show_ean && (
                            <div style={{ ...previewEditorElementStyle, ...rectToPercentStyle(editorLayout.ean), fontSize: `${Math.max(8, layoutMetrics.eanTextSizePt)}px`, letterSpacing: '0.5px' }}>
                              {row.ean13}
                            </div>
                          )}
                          {printSettings.show_label_detail && (
                            <div style={{ ...previewEditorElementStyle, ...rectToPercentStyle(editorLayout.name), fontSize: `${Math.max(9, layoutMetrics.productNameTextSizePt)}px`, fontWeight: 700 }}>
                              {buildLabelDisplayText(row)}
                            </div>
                          )}
                          {printSettings.show_product_code && (
                            <div style={{ ...previewEditorElementStyle, ...rectToPercentStyle(editorLayout.code), fontSize: `${Math.max(8, layoutMetrics.textSizePt - 1)}px`, color: '#334155' }}>
                              {row.productCode}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
                {previewPages.length > 2 && (
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
                    Onizlemede ilk 2 sayfa gosteriliyor. Yazdirmada toplam <strong>{expandedRows.length}</strong> etiket ve <strong>{previewPages.length}</strong> sayfa cikar.
                  </p>
                )}
              </div>
            )}
          </div>

          <aside style={printQueuePanelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '13px' }}>Yazdirma Listesi</h4>
              <span style={{ color: '#93c5fd', fontSize: '11px' }}>{rowsQueuedForPrint.length} urun</span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', marginBottom: '10px' }}>
              Toplam etiket: <strong style={{ color: '#e2e8f0' }}>{expandedRows.length}</strong>
            </div>

            {!rowsQueuedForPrint.length ? (
              <p style={{ color: '#94a3b8', margin: 0, fontSize: '12px' }}>Yazdirma listesinde urun yok.</p>
            ) : (
              <div style={{ display: 'grid', gap: '8px', maxHeight: '460px', overflowY: 'auto', paddingRight: '4px' }}>
                {rowsQueuedForPrint.map((row) => (
                  <div key={`queued-${row.key}`} style={queueRowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.productCode}
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {buildLabelDisplayText(row)}
                      </div>
                      <div style={queueQtyRowStyle}>
                        <button type="button" style={queueQtyButtonStyle} onClick={() => handleQueueQuantityStep(row, -1)}>
                          -
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={String(Math.max(0, Math.floor(row.quantity || 0)))}
                          onChange={(evt) => handleQueueQuantityInput(row, evt.target.value)}
                          style={queueQtyInputStyle}
                          aria-label={`${row.productCode} yazdirma adedi`}
                        />
                        <button type="button" style={queueQtyButtonStyle} onClick={() => handleQueueQuantityStep(row, 1)}>
                          +
                        </button>
                      </div>
                    </div>
                    <button type="button" style={queueRemoveButtonStyle} onClick={() => handleRemoveFromPrintQueue(row)}>
                      Kaldir
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              style={{ ...dangerMiniStyle, width: '100%', marginTop: '10px', opacity: rowsQueuedForPrint.length ? 1 : 0.6 }}
              onClick={handleClearPrintQueue}
              disabled={!rowsQueuedForPrint.length}
            >
              Yazdirma Listesini Temizle
            </button>
          </aside>
        </div>
      </div>
        </>
      )}

      {message && <div style={okStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

const titleStyle: CSSProperties = {
  color: '#f8fafc',
  fontSize: '20px',
  margin: 0,
}

const panelStyle: CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '16px',
  marginBottom: '14px',
}

const panelTitleStyle: CSSProperties = {
  color: '#f8fafc',
  fontSize: '15px',
  marginTop: 0,
  marginBottom: '10px',
}

const sectionToggleStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'transparent',
  border: 'none',
  color: '#f8fafc',
  fontSize: '15px',
  fontWeight: 700,
  padding: '0 0 10px 0',
  cursor: 'pointer',
}

const labelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#94a3b8',
  marginBottom: '4px',
  fontWeight: 700,
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '12px',
}

const editorLockedInputStyle: CSSProperties = {
  opacity: 0.55,
  cursor: 'not-allowed',
}

const primaryButton: CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '9px 14px',
  fontSize: '12px',
  fontWeight: 700,
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
  padding: '7px 10px',
  fontSize: '11px',
  cursor: 'pointer',
}

const checkLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: '#cbd5e1',
  fontSize: '12px',
}

const modeGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '10px',
}

const modeCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  width: '100%',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '14px',
  background: '#0f172a',
  color: '#e2e8f0',
  cursor: 'pointer',
  textAlign: 'left',
}

const modeCardActiveStyle: CSSProperties = {
  ...modeCardStyle,
  border: '1px solid #2563eb',
  background: 'linear-gradient(135deg, rgba(37,99,235,0.26), rgba(15,23,42,0.95))',
  boxShadow: '0 0 0 1px rgba(37,99,235,0.24) inset',
}

const modeCardTitleStyle: CSSProperties = {
  fontSize: '16px',
  fontWeight: 800,
  color: '#f8fafc',
}

const modeCardDescStyle: CSSProperties = {
  fontSize: '12px',
  color: '#bfdbfe',
}

const previewLayoutStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'nowrap',
  gap: '10px',
  alignItems: 'flex-start',
}

const previewCanvasAreaStyle: CSSProperties = {
  flex: '1 1 420px',
  minWidth: 0,
}

const editorBodyLayoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)',
  gap: '10px',
  alignItems: 'start',
}

const layoutEditorPanelStyle: CSSProperties = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '10px',
}

const editorCanvasStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '300px',
  background: '#f8fafc',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  overflow: 'hidden',
}

const editorBlockStyle: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  overflow: 'hidden',
  border: '1px dashed rgba(15, 23, 42, 0.12)',
  cursor: 'move',
  background: 'rgba(255,255,255,0.15)',
  userSelect: 'none',
  zIndex: 2,
}

const editorBlockActiveStyle: CSSProperties = {
  border: '1px solid #2563eb',
  boxShadow: '0 0 0 1px rgba(37,99,235,0.35) inset',
  background: 'rgba(255,255,255,0.72)',
}

const editorBlockPassiveStyle: CSSProperties = {
  border: '1px dashed rgba(15, 23, 42, 0.08)',
  background: 'transparent',
  opacity: 0.55,
}

const editorDefaultGuideStyle: CSSProperties = {
  position: 'absolute',
  border: '1px dashed rgba(30, 64, 175, 0.45)',
  background: 'rgba(191, 219, 254, 0.18)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: 1,
}

const editorDefaultGuideLabelStyle: CSSProperties = {
  fontSize: '9px',
  lineHeight: 1.1,
  color: '#1e3a8a',
  background: 'rgba(255,255,255,0.72)',
  padding: '1px 3px',
}

const editorResizeHandleStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  bottom: 0,
  width: '10px',
  height: '10px',
  border: 'none',
  padding: 0,
  borderRadius: '2px',
  background: '#2563eb',
  cursor: 'nwse-resize',
}

const editorElementButtonStyle: CSSProperties = {
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#cbd5e1',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
  cursor: 'pointer',
}

const editorElementButtonActiveStyle: CSSProperties = {
  border: '1px solid #2563eb',
  background: 'rgba(37,99,235,0.25)',
  color: '#dbeafe',
}

const editorElementRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '6px',
  alignItems: 'center',
}

const editorToggleShowStyle: CSSProperties = {
  border: '1px solid #7f1d1d',
  background: '#7f1d1d',
  color: '#fecaca',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
  cursor: 'pointer',
  minWidth: '64px',
}

const editorToggleHideStyle: CSSProperties = {
  border: '1px solid #14532d',
  background: '#14532d',
  color: '#bbf7d0',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
  cursor: 'pointer',
  minWidth: '64px',
}

const editorFieldStyle: CSSProperties = {
  display: 'grid',
  gap: '4px',
  color: '#94a3b8',
  fontSize: '11px',
}

const editorRightPanelStyle: CSSProperties = {
  display: 'grid',
  gap: '8px',
  alignContent: 'start',
  order: 1,
}

const editorAccordionStyle: CSSProperties = {
  border: '1px solid #334155',
  borderRadius: '8px',
  background: '#111827',
  padding: '8px',
}

const editorAccordionSummaryStyle: CSSProperties = {
  color: '#e2e8f0',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
}

const printQueuePanelStyle: CSSProperties = {
  flex: '0 0 300px',
  maxWidth: '320px',
  minWidth: '240px',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '10px',
}

const queueRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '8px',
  alignItems: 'center',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '8px',
  background: '#1e293b',
}

const queueRemoveButtonStyle: CSSProperties = {
  background: '#7f1d1d',
  color: '#fecaca',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 8px',
  fontSize: '11px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const queueQtyRowStyle: CSSProperties = {
  display: 'inline-grid',
  gridTemplateColumns: '24px 54px 24px',
  gap: '5px',
  alignItems: 'center',
  marginTop: '4px',
}

const queueQtyButtonStyle: CSSProperties = {
  background: '#1e40af',
  color: '#dbeafe',
  border: '1px solid #1d4ed8',
  borderRadius: '5px',
  height: '24px',
  width: '24px',
  padding: 0,
  fontSize: '13px',
  lineHeight: 1,
  cursor: 'pointer',
}

const queueQtyInputStyle: CSSProperties = {
  width: '100%',
  height: '24px',
  background: '#020617',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '5px',
  textAlign: 'center',
  fontSize: '11px',
  padding: '0 4px',
}

const previewPageStyle: CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '10px',
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'stretch',
}

const previewLabelStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: '1px solid #0f172a',
  borderRadius: '6px',
  position: 'relative',
  color: '#0f172a',
  textAlign: 'center',
  overflow: 'hidden',
  background: '#ffffff',
}

const previewEditorElementStyle: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  textAlign: 'center',
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

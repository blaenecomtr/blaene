import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'
import { useAuthStore } from '../store/auth'

interface Customer {
  id: string
  username?: string | null
  email: string
  full_name: string
  phone: string | null
  default_address?: string | null
  default_city?: string | null
  customer_type?: string | null
  consent_kvkk?: boolean | null
  consent_terms?: boolean | null
  consent_marketing_email?: boolean | null
  consent_marketing_sms?: boolean | null
  consent_marketing_call?: boolean | null
  created_at?: string
}

interface StaffUser {
  id: string
  email?: string | null
  full_name?: string | null
  role?: string | null
  subscription_tier?: string | null
  is_active?: boolean | null
  is_protected_owner?: boolean | null
  last_seen_at?: string | null
  created_at?: string | null
}

interface CreateStaffUserResponse {
  temporary_password?: string | null
}

interface DeleteCustomerResponse {
  id?: string
  profile_deleted?: boolean
  auth_deleted?: boolean
}

interface StaffFormState {
  email: string
  full_name: string
  role: string
  subscription_tier: string
  is_active: boolean
  password: string
}

interface StaffDraftState {
  role: string
  subscription_tier: string
  is_active: boolean
  password: string
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Yonetici' },
  { value: 'editor', label: 'Duzenleyici' },
  { value: 'viewer', label: 'Goruntuleyici' },
]

const TIER_OPTIONS = [
  { value: 'free', label: 'Ucretsiz' },
  { value: 'pro', label: 'Profesyonel' },
  { value: 'enterprise', label: 'Kurumsal' },
]

function roleLabel(role?: string | null) {
  const normalized = String(role || '').trim().toLowerCase()
  return ROLE_OPTIONS.find((item) => item.value === normalized)?.label || (role || '-')
}

function tierLabel(tier?: string | null) {
  const normalized = String(tier || '').trim().toLowerCase()
  return TIER_OPTIONS.find((item) => item.value === normalized)?.label || (tier || '-')
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('tr-TR')
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('tr-TR')
}

function boolLabel(value: boolean | null | undefined) {
  return value ? 'Evet' : 'Hayir'
}

function toCsvCell(value: unknown) {
  const text = String(value ?? '').replace(/"/g, '""')
  return `"${text}"`
}

function generateTempStaffPassword(length = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*'
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint32Array(length)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (value) => chars[value % chars.length]).join('')
  }
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function initialFormState(): StaffFormState {
  return {
    email: '',
    full_name: '',
    role: 'editor',
    subscription_tier: 'free',
    is_active: true,
    password: '',
  }
}

function toStaffDraft(user: StaffUser): StaffDraftState {
  return {
    role: String(user.role || 'viewer').toLowerCase(),
    subscription_tier: String(user.subscription_tier || 'free').toLowerCase(),
    is_active: user.is_active !== false,
    password: '',
  }
}

function isProtectedStaff(user: StaffUser) {
  return user.is_protected_owner === true
}

export default function Users() {
  const { userRole, canManageAdminUsers } = useAuthStore()
  const token = localStorage.getItem('admin_token')
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [staffDrafts, setStaffDrafts] = useState<Record<string, StaffDraftState>>({})
  const [search, setSearch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [customerError, setCustomerError] = useState('')
  const [staffError, setStaffError] = useState('')
  const [createError, setCreateError] = useState('')
  const [createMessage, setCreateMessage] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resettingStaffId, setResettingStaffId] = useState<string | null>(null)
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null)
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null)
  const [staffActionError, setStaffActionError] = useState('')
  const [staffActionMessage, setStaffActionMessage] = useState('')
  const [staffForm, setStaffForm] = useState<StaffFormState>(() => initialFormState())

  const normalizedUserRole = String(userRole || '')
    .trim()
    .toLowerCase()
  const canManageStaff = (normalizedUserRole === 'super_admin' || normalizedUserRole === 'admin') && canManageAdminUsers

  const activeStaffCount = useMemo(() => staffUsers.filter((item) => item.is_active !== false).length, [staffUsers])
  const marketingConsentCount = useMemo(
    () => customers.filter((item) => item.consent_marketing_email || item.consent_marketing_sms).length,
    [customers]
  )

  const loadCustomers = async () => {
    if (!token) return
    setLoadingCustomers(true)
    setCustomerError('')
    try {
      const params = new URLSearchParams()
      params.set('page_size', '400')
      if (search.trim()) params.set('search', search.trim())
      const data = await apiRequest<Customer[]>(`/api/admin/customers?${params.toString()}`, { token })
      setCustomers(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Musteriler yuklenemedi'
      setCustomerError(message)
    } finally {
      setLoadingCustomers(false)
    }
  }

  const loadStaffUsers = async () => {
    if (!token || !canManageStaff) return
    setLoadingStaff(true)
    setStaffError('')
    try {
      const params = new URLSearchParams()
      params.set('page_size', '200')
      if (staffSearch.trim()) params.set('search', staffSearch.trim())
      const data = await apiRequest<StaffUser[]>(`/api/admin/users?${params.toString()}`, { token })
      const list = Array.isArray(data) ? data : []
      setStaffUsers(list)
      const nextDrafts: Record<string, StaffDraftState> = {}
      for (const item of list) {
        const id = String(item.id || '').trim()
        if (!id) continue
        nextDrafts[id] = toStaffDraft(item)
      }
      setStaffDrafts(nextDrafts)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Admin kullanicilari yuklenemedi'
      setStaffError(message)
    } finally {
      setLoadingStaff(false)
    }
  }

  useEffect(() => {
    void loadCustomers()
  }, [])

  useEffect(() => {
    if (!canManageStaff) return
    void loadStaffUsers()
  }, [canManageStaff])

  const exportCustomers = () => {
    if (!customers.length) return
    const headers = [
      'ad_soyad',
      'kullanici_adi',
      'email',
      'telefon',
      'adres',
      'sehir',
      'musteri_tipi',
      'kvkk',
      'sozlesme',
      'mail_izni',
      'sms_izni',
      'arama_izni',
      'kayit_tarihi',
    ]
    const lines = [
      headers.join(','),
      ...customers.map((row) =>
        [
          row.full_name || '',
          row.username || '',
          row.email || '',
          row.phone || '',
          row.default_address || '',
          row.default_city || '',
          row.customer_type || '',
          boolLabel(row.consent_kvkk),
          boolLabel(row.consent_terms),
          boolLabel(row.consent_marketing_email),
          boolLabel(row.consent_marketing_sms),
          boolLabel(row.consent_marketing_call),
          formatDate(row.created_at),
        ]
          .map(toCsvCell)
          .join(',')
      ),
    ]
    const csv = `\uFEFF${lines.join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `musteriler-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const handleCreateStaffUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return

    setCreateError('')
    setCreateMessage('')
    if (!staffForm.email.trim()) {
      setCreateError('E-posta zorunludur.')
      return
    }

    setCreating(true)
    try {
      const payload: Record<string, unknown> = {
        email: staffForm.email.trim(),
        full_name: staffForm.full_name.trim() || null,
        role: staffForm.role,
        subscription_tier: staffForm.subscription_tier,
        is_active: staffForm.is_active,
      }
      const password = staffForm.password.trim()
      if (password) payload.password = password

      const created = await apiRequest<CreateStaffUserResponse>('/api/admin/users', {
        method: 'POST',
        token,
        body: payload,
      })

      if (created?.temporary_password) {
        setCreateMessage(`Kullanici olusturuldu. Gecici sifre: ${created.temporary_password}`)
      } else {
        setCreateMessage('Kullanici olusturuldu.')
      }

      setStaffForm(initialFormState())
      await loadStaffUsers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kullanici olusturulamadi'
      setCreateError(message)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!token) return
    const customerId = String(customer.id || '').trim()
    if (!customerId) return

    const identity = customer.email || customer.full_name || customer.username || customerId
    const confirmed = window.confirm(
      `Bu musteriyi kalici olarak silmek istiyor musunuz?\n\n${identity}\n\nBu islem geri alinmaz.`
    )
    if (!confirmed) return

    setCustomerError('')
    setDeletingCustomerId(customerId)
    try {
      await apiRequest<DeleteCustomerResponse>(`/api/admin/customers?id=${encodeURIComponent(customerId)}`, {
        method: 'DELETE',
        token,
      })
      await loadCustomers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Musteri silinemedi'
      setCustomerError(message)
    } finally {
      setDeletingCustomerId(null)
    }
  }

  const getStaffDraft = (staff: StaffUser): StaffDraftState => {
    const id = String(staff.id || '').trim()
    if (id && staffDrafts[id]) return staffDrafts[id]
    return toStaffDraft(staff)
  }

  const updateStaffDraft = (staff: StaffUser, patch: Partial<StaffDraftState>) => {
    const id = String(staff.id || '').trim()
    if (!id) return
    setStaffDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || toStaffDraft(staff)),
        ...patch,
      },
    }))
  }

  const handleUpdateStaffUser = async (staff: StaffUser) => {
    if (!token || !canManageStaff) return
    if (isProtectedStaff(staff)) {
      setStaffActionError('Ana hesap degistirilemez.')
      return
    }
    const staffId = String(staff.id || '').trim()
    if (!staffId) return
    const draft = getStaffDraft(staff)
    const label = staff.email || staff.full_name || staffId
    const normalizedPassword = String(draft.password || '').trim()

    setStaffActionError('')
    setStaffActionMessage('')
    setSavingStaffId(staffId)
    try {
      await apiRequest('/api/admin/users', {
        method: 'PUT',
        token,
        body: {
          id: staffId,
          role: draft.role,
          subscription_tier: draft.subscription_tier,
          is_active: draft.is_active,
          force_confirm_email: true,
          password: normalizedPassword || undefined,
        },
      })
      setStaffActionMessage(
        normalizedPassword
          ? `${label} icin gorev/abonelik/durum ve sifre guncellendi.`
          : `${label} icin gorev/abonelik/durum guncellendi.`
      )
      await loadStaffUsers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kullanici guncellenemedi'
      setStaffActionError(message)
    } finally {
      setSavingStaffId(null)
    }
  }

  const handleDeleteStaffUser = async (staff: StaffUser) => {
    if (!token || !canManageStaff) return
    if (isProtectedStaff(staff)) {
      setStaffActionError('Ana hesap silinemez.')
      return
    }
    const staffId = String(staff.id || '').trim()
    if (!staffId) return
    const label = staff.email || staff.full_name || staffId
    const confirmed = window.confirm(
      `${label} kullanicisini kalici olarak silmek istiyor musunuz?\n\nBu islem geri alinmaz.`
    )
    if (!confirmed) return

    setStaffActionError('')
    setStaffActionMessage('')
    setDeletingStaffId(staffId)
    try {
      await apiRequest('/api/admin/users', {
        method: 'DELETE',
        token,
        body: { id: staffId, hard_delete: true },
      })
      setStaffActionMessage(`${label} kalici olarak silindi.`)
      await loadStaffUsers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kullanici silinemedi'
      setStaffActionError(message)
    } finally {
      setDeletingStaffId(null)
    }
  }

  const handleResetStaffPassword = async (staff: StaffUser) => {
    if (!token || !canManageStaff) return
    if (isProtectedStaff(staff)) {
      setResetError('Ana hesap sifresi bu panelden degistirilemez.')
      return
    }
    const staffId = String(staff.id || '').trim()
    if (!staffId) return

    const label = staff.email || staff.full_name || staffId
    const nextPassword = generateTempStaffPassword(14)
    const confirmed = window.confirm(
      `${label} icin yeni gecici sifre olusturulsun mu?\n\nYeni sifre: ${nextPassword}\n\nBu islem mevcut sifreyi degistirir.`
    )
    if (!confirmed) return

    setResetError('')
    setResetMessage('')
    setStaffActionError('')
    setStaffActionMessage('')
    setResettingStaffId(staffId)
    try {
      await apiRequest('/api/admin/users', {
        method: 'PUT',
        token,
        body: { id: staffId, password: nextPassword, is_active: true, force_confirm_email: true },
      })
      setResetMessage(`Sifre yenilendi (${label}). Yeni gecici sifre: ${nextPassword}. Kullanici aninda aktif edildi.`)
      await loadStaffUsers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sifre yenileme basarisiz'
      setResetError(message)
    } finally {
      setResettingStaffId(null)
    }
  }

  return (
    <div className="users-page">
      <section className="users-hero">
        <div>
          <h2 className="users-title">Kullanicilar</h2>
          <p className="users-subtitle">Musteri verileri ve yonetim ekibi hesaplarini tek ekrandan yonetin.</p>
        </div>
        <div className="users-metrics">
          <div className="users-metric-card">
            <span className="users-metric-label">Toplam Musteri</span>
            <strong className="users-metric-value">{customers.length}</strong>
          </div>
          <div className="users-metric-card">
            <span className="users-metric-label">Pazarlama Izni</span>
            <strong className="users-metric-value">{marketingConsentCount}</strong>
          </div>
          {canManageStaff && (
            <div className="users-metric-card">
              <span className="users-metric-label">Aktif Admin Ekip</span>
              <strong className="users-metric-value">{activeStaffCount}</strong>
            </div>
          )}
        </div>
      </section>

      <section className="users-card">
        <div className="users-card-head">
          <h3 className="users-card-title">Musteriler ve uye izinleri</h3>
          <span className="users-chip">{customers.length} kayit</span>
        </div>

        <div className="users-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ad, e-posta, telefon veya kullanici adi ara"
            className="users-input users-input-grow"
          />
          <button onClick={() => void loadCustomers()} className="users-btn users-btn-secondary">
            Ara
          </button>
          <button onClick={exportCustomers} className="users-btn users-btn-primary" disabled={!customers.length}>
            CSV indir
          </button>
        </div>

        {customerError && <div className="users-alert users-alert-danger">{customerError}</div>}

        {loadingCustomers ? (
          <p className="users-placeholder">Musteriler yukleniyor...</p>
        ) : !customers.length ? (
          <p className="users-placeholder">Kayit bulunamadi.</p>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Kullanici</th>
                  <th>E-posta</th>
                  <th>Telefon</th>
                  <th>Adres</th>
                  <th>Sehir</th>
                  <th>Musteri Tipi</th>
                  <th>KVKK</th>
                  <th>Sozlesme</th>
                  <th>Mail izni</th>
                  <th>SMS izni</th>
                  <th>Arama izni</th>
                  <th>Kayit</th>
                  {canManageStaff && <th>Islem</th>}
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.full_name || '-'}</td>
                    <td>{customer.username || '-'}</td>
                    <td>{customer.email || '-'}</td>
                    <td>{customer.phone || '-'}</td>
                    <td>{customer.default_address || '-'}</td>
                    <td>{customer.default_city || '-'}</td>
                    <td>{customer.customer_type || '-'}</td>
                    <td>{boolLabel(customer.consent_kvkk)}</td>
                    <td>{boolLabel(customer.consent_terms)}</td>
                    <td>{boolLabel(customer.consent_marketing_email)}</td>
                    <td>{boolLabel(customer.consent_marketing_sms)}</td>
                    <td>{boolLabel(customer.consent_marketing_call)}</td>
                    <td>{formatDate(customer.created_at)}</td>
                    {canManageStaff && (
                      <td>
                        <button
                          type="button"
                          className="users-btn users-btn-danger users-btn-xs"
                          disabled={deletingCustomerId === customer.id}
                          onClick={() => void handleDeleteCustomer(customer)}
                        >
                          {deletingCustomerId === customer.id ? 'Siliniyor...' : 'Sil'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="users-card">
        <div className="users-card-head">
          <h3 className="users-card-title">Admin kullanicilari</h3>
          {canManageStaff && <span className="users-chip">{staffUsers.length} kayit</span>}
        </div>

        {!canManageStaff ? (
          <div className="users-alert users-alert-soft">
            Bu bolum sadece sahip hesap tarafindan yonetilir. Mevcut rol: {roleLabel(normalizedUserRole) || 'tanimsiz'}.
          </div>
        ) : (
          <>
            <form className="users-form-grid" onSubmit={handleCreateStaffUser}>
              <label className="users-field">
                <span>E-posta</span>
                <input
                  type="email"
                  value={staffForm.email}
                  onChange={(event) => setStaffForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="admin@blaene.com"
                  className="users-input"
                  required
                />
              </label>

              <label className="users-field">
                <span>Ad Soyad</span>
                <input
                  value={staffForm.full_name}
                  onChange={(event) => setStaffForm((prev) => ({ ...prev, full_name: event.target.value }))}
                  placeholder="Operasyon Ekibi"
                  className="users-input"
                />
              </label>

              <label className="users-field">
                <span>Gorev</span>
                <select
                  value={staffForm.role}
                  onChange={(event) => setStaffForm((prev) => ({ ...prev, role: event.target.value }))}
                  className="users-input"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="users-field">
                <span>Abonelik</span>
                <select
                  value={staffForm.subscription_tier}
                  onChange={(event) => setStaffForm((prev) => ({ ...prev, subscription_tier: event.target.value }))}
                  className="users-input"
                >
                  {TIER_OPTIONS.map((tier) => (
                    <option key={tier.value} value={tier.value}>
                      {tier.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="users-field users-field-wide">
                <span>Baslangic sifresi (opsiyonel)</span>
                <input
                  type="text"
                  value={staffForm.password}
                  onChange={(event) => setStaffForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Bos birakirsan gecici sifre uretilir"
                  className="users-input"
                />
              </label>

              <label className="users-checkbox">
                <input
                  type="checkbox"
                  checked={staffForm.is_active}
                  onChange={(event) => setStaffForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                Kullanici aktif baslasin
              </label>

              <div className="users-form-actions">
                <button type="submit" className="users-btn users-btn-primary" disabled={creating}>
                  {creating ? 'Olusturuluyor...' : 'Yeni kullanici olustur'}
                </button>
              </div>
            </form>

            {createError && <div className="users-alert users-alert-danger">{createError}</div>}
            {createMessage && <div className="users-alert users-alert-success">{createMessage}</div>}
            {staffError && <div className="users-alert users-alert-danger">{staffError}</div>}
            {resetError && <div className="users-alert users-alert-danger">{resetError}</div>}
            {resetMessage && <div className="users-alert users-alert-success">{resetMessage}</div>}
            {staffActionError && <div className="users-alert users-alert-danger">{staffActionError}</div>}
            {staffActionMessage && <div className="users-alert users-alert-success">{staffActionMessage}</div>}

            <div className="users-toolbar users-toolbar-staff">
              <input
                value={staffSearch}
                onChange={(event) => setStaffSearch(event.target.value)}
                placeholder="E-posta veya ad soyad ara"
                className="users-input users-input-grow"
              />
              <button onClick={() => void loadStaffUsers()} className="users-btn users-btn-secondary">
                Ara
              </button>
            </div>

            {loadingStaff ? (
              <p className="users-placeholder">Admin kullanicilari yukleniyor...</p>
            ) : !staffUsers.length ? (
              <p className="users-placeholder">Admin kaydi bulunamadi.</p>
            ) : (
              <div className="users-table-wrap">
                <table className="users-table users-table-compact">
                  <thead>
                    <tr>
                      <th>E-posta</th>
                      <th>Ad Soyad</th>
                      <th>Gorev</th>
                      <th>Abonelik</th>
                      <th>Durum</th>
                      <th>Sifre Belirle</th>
                      <th>Son giris</th>
                      <th>Kayit</th>
                      <th>Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffUsers.map((item) => (
                      <tr key={item.id}>
                        <td>{item.email || '-'}{isProtectedStaff(item) ? ' (Ana hesap - kilitli)' : ''}</td>
                        <td>{item.full_name || '-'}</td>
                        <td>
                          <select
                            className="users-input"
                            value={getStaffDraft(item).role}
                            disabled={isProtectedStaff(item)}
                            onChange={(event) => updateStaffDraft(item, { role: event.target.value })}
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={`staff-role-${item.id}-${role.value}`} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="users-input"
                            value={getStaffDraft(item).subscription_tier}
                            disabled={isProtectedStaff(item)}
                            onChange={(event) => updateStaffDraft(item, { subscription_tier: event.target.value })}
                          >
                            {TIER_OPTIONS.map((tier) => (
                              <option key={`staff-tier-${item.id}-${tier.value}`} value={tier.value}>
                                {tier.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="users-input"
                            value={getStaffDraft(item).is_active ? 'aktif' : 'pasif'}
                            disabled={isProtectedStaff(item)}
                            onChange={(event) => updateStaffDraft(item, { is_active: event.target.value === 'aktif' })}
                          >
                            <option value="aktif">Aktif</option>
                            <option value="pasif">Pasif</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="users-input"
                            placeholder={isProtectedStaff(item) ? 'Ana hesap kilitli' : 'Yeni sifre (opsiyonel)'}
                            value={getStaffDraft(item).password}
                            disabled={isProtectedStaff(item)}
                            onChange={(event) => updateStaffDraft(item, { password: event.target.value })}
                          />
                        </td>
                        <td>{formatDateTime(item.last_seen_at)}</td>
                        <td>{formatDate(item.created_at)}</td>
                        <td>
                          <button
                            type="button"
                            className="users-btn users-btn-primary users-btn-xs"
                            disabled={isProtectedStaff(item) || savingStaffId === item.id || deletingStaffId === item.id || resettingStaffId === item.id}
                            onClick={() => void handleUpdateStaffUser(item)}
                          >
                            {savingStaffId === item.id ? 'Kaydediliyor...' : 'Kaydet'}
                          </button>
                          <button
                            type="button"
                            className="users-btn users-btn-secondary users-btn-xs"
                            disabled={isProtectedStaff(item) || resettingStaffId === item.id || savingStaffId === item.id || deletingStaffId === item.id}
                            onClick={() => void handleResetStaffPassword(item)}
                          >
                            {resettingStaffId === item.id ? 'Yenileniyor...' : 'Sifre yenile'}
                          </button>
                          <button
                            type="button"
                            className="users-btn users-btn-danger users-btn-xs"
                            disabled={isProtectedStaff(item) || deletingStaffId === item.id || savingStaffId === item.id || resettingStaffId === item.id}
                            onClick={() => void handleDeleteStaffUser(item)}
                          >
                            {deletingStaffId === item.id ? 'Siliniyor...' : 'Sil'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

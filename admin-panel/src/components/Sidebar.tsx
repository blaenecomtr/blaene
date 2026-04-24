import { useMemo } from 'react'
import { useAuthStore } from '../store/auth'
import { Button } from './ui/Button'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Genel ozet' },
  { id: 'products', label: 'Urunler', hint: 'Stok ve fiyat' },
  { id: 'orders', label: 'Siparisler', hint: 'Odeme ve kargo' },
  { id: 'users', label: 'Kullanicilar', hint: 'Musteri ve ekip' },
  { id: 'seo-content', label: 'SEO ve Icerik', hint: 'Sayfa ve blog' },
  { id: 'site-settings', label: 'Site Ayarlari', hint: 'Odeme ve iletisim' },
  { id: 'marketing', label: 'Pazarlama', hint: 'Kupon ve banner' },
  { id: 'integrations', label: 'Entegrasyonlar', hint: 'API baglantilari' },
]

export default function Sidebar({ currentPage, onNavigate, isMobile = false, isOpen = false, onClose }: SidebarProps) {
  const { userEmail, userName } = useAuthStore()
  const onlineLabel = useMemo(() => {
    const normalizedName = String(userName || '').trim()
    const normalizedEmail = String(userEmail || '').trim()
    if (normalizedName && normalizedEmail) return `${normalizedName} (${normalizedEmail})`
    return normalizedName || normalizedEmail || 'Bilinmeyen kullanici'
  }, [userEmail, userName])

  return (
    <aside className={`admin-sidebar${isMobile ? ' is-mobile' : ''}${isOpen ? ' is-open' : ''}`}>
      <div className="admin-sidebar-head">
        <div className="admin-sidebar-brand-wrap">
          <img
            src="/logo/blaene-logo-white.png"
            alt="Blaene"
            className="admin-sidebar-logo"
          />
          <p className="admin-sidebar-subtitle">Yonetim Paneli</p>
        </div>

        {isMobile && (
          <Button
            onClick={onClose}
            aria-label="Menuyu Kapat"
            className="admin-icon-btn"
            variant="ghost"
            size="sm"
            neon={false}
          >
            Kapat
          </Button>
        )}
      </div>

      <nav className="admin-sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`admin-nav-item${currentPage === item.id ? ' is-active' : ''}`}
            aria-current={currentPage === item.id ? 'page' : undefined}
          >
            <span className="admin-nav-item-label">{item.label}</span>
            <span className="admin-nav-item-hint">{item.hint}</span>
          </button>
        ))}
      </nav>

      <div className="admin-sidebar-online" title={onlineLabel}>
        <span className="admin-sidebar-online-label">Online kullanici</span>
        <strong className="admin-sidebar-online-value">{onlineLabel}</strong>
      </div>

      <div className="admin-sidebar-foot">
        <span className="admin-sidebar-foot-dot" />
        Panel canli
      </div>
    </aside>
  )
}

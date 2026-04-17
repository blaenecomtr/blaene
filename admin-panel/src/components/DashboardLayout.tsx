import { useEffect, useMemo, useState } from 'react'
import { useAdminStore } from '../store/admin'
import Sidebar from './Sidebar'
import Header from './Header'
import Dashboard from '../pages/Dashboard'
import Products from '../pages/Products'
import Orders from '../pages/Orders'
import Users from '../pages/Users'
import SeoContent from '../pages/SeoContent'
import SiteSettings from '../pages/SiteSettings'
import Marketing from '../pages/Marketing'
import Integrations from '../pages/Integrations'
import LogoutModal from './LogoutModal'

const PAGE_TITLE: Record<string, string> = {
  dashboard: 'Dashboard',
  products: 'Urunler',
  orders: 'Siparisler',
  users: 'Musteriler',
  'seo-content': 'SEO ve Icerik',
  'site-settings': 'Site Ayarlari',
  marketing: 'Pazarlama / Kampanya',
  integrations: 'Entegrasyonlar',
}

export default function DashboardLayout() {
  const { currentPage, setCurrentPage } = useAdminStore()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 1024 : false))

  const pageTitle = useMemo(() => PAGE_TITLE[currentPage] || 'Dashboard', [currentPage])

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 1024
      setIsMobile(mobile)
      if (!mobile) {
        setIsMobileSidebarOpen(false)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isMobile && isMobileSidebarOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
    document.body.style.overflow = ''
    return undefined
  }, [isMobile, isMobileSidebarOpen])

  useEffect(() => {
    if (!isMobile) return undefined

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [isMobile])

  const handleNavigate = (page: string) => {
    setCurrentPage(page)
    if (isMobile) {
      setIsMobileSidebarOpen(false)
    }
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'products':
        return <Products />
      case 'orders':
        return <Orders />
      case 'users':
        return <Users />
      case 'seo-content':
        return <SeoContent />
      case 'site-settings':
        return <SiteSettings />
      case 'marketing':
        return <Marketing />
      case 'integrations':
        return <Integrations />
      default:
        return <Dashboard />
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {isMobile && isMobileSidebarOpen && (
        <button
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Menuyu Kapat"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.6)',
            border: 'none',
            zIndex: 90,
          }}
        />
      )}

      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isMobile={isMobile}
        isOpen={isMobile ? isMobileSidebarOpen : true}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      <div style={{ marginLeft: isMobile ? '0' : '260px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header
          pageTitle={pageTitle}
          onLogoutClick={() => setShowLogoutModal(true)}
          showMenuButton={isMobile}
          onMenuClick={() => setIsMobileSidebarOpen(true)}
          isMobile={isMobile}
        />
        <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px' }}>{renderPage()}</main>
      </div>
      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  )
}

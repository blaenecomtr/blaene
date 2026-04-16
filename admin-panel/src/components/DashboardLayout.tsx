import { useMemo, useState } from 'react'
import { useAdminStore } from '../store/admin'
import Sidebar from './Sidebar'
import Header from './Header'
import Dashboard from '../pages/Dashboard'
import Products from '../pages/Products'
import Orders from '../pages/Orders'
import Users from '../pages/Users'
import LogoutModal from './LogoutModal'

const PAGE_TITLE: Record<string, string> = {
  dashboard: 'Dashboard',
  products: 'Urunler',
  orders: 'Siparisler',
  users: 'Musteriler',
}

export default function DashboardLayout() {
  const { currentPage, setCurrentPage } = useAdminStore()
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const pageTitle = useMemo(() => PAGE_TITLE[currentPage] || 'Dashboard', [currentPage])

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
      default:
        return <Dashboard />
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div style={{ marginLeft: '260px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header pageTitle={pageTitle} onLogoutClick={() => setShowLogoutModal(true)} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>{renderPage()}</main>
      </div>
      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  )
}

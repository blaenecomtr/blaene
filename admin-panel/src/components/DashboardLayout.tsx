import { useState } from 'react'
import { useAdminStore } from '../store/admin'
import Sidebar from './Sidebar'
import Header from './Header'
import Dashboard from '../pages/Dashboard'
import Products from '../pages/Products'
import Orders from '../pages/Orders'
import Users from '../pages/Users'
import LogoutModal from './LogoutModal'

export default function DashboardLayout() {
  const { currentPage, setCurrentPage } = useAdminStore()
  const [showLogoutModal, setShowLogoutModal] = useState(false)

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
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
        <Header onLogoutClick={() => setShowLogoutModal(true)} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '30px' }}>
          {renderPage()}
        </div>
      </div>
      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  )
}

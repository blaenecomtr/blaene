import { useEffect, useState } from 'react'
import { useAuthStore } from './store/auth'
import { useAdminStore } from './store/admin'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './components/DashboardLayout'

export default function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const { initializeData } = useAdminStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const isAuth = await checkAuth()
      if (isAuth) {
        await initializeData()
      }
      setLoading(false)
    }
    init()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            width: '30px',
            height: '30px',
            border: '3px solid #334155',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          <p style={{ marginTop: '15px', color: '#94a3b8' }}>Yükleniyor...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  return isAuthenticated ? <DashboardLayout /> : <LoginPage />
}

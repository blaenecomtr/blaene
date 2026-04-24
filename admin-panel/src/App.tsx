import { useEffect, useState } from 'react'
import { useAuthStore } from './store/auth'
import { useAdminStore } from './store/admin'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './components/DashboardLayout'

export default function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const { initializeData, theme } = useAdminStore()
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [bootDone, setBootDone] = useState(false)

  useEffect(() => {
    document.body.setAttribute('data-admin-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!loading) return undefined

    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const maxTarget = bootDone ? 100 : 92
        if (prev >= maxTarget) return prev
        const step = prev < 40 ? 4 : prev < 75 ? 2 : 1
        return Math.min(maxTarget, prev + step)
      })
    }, 45)

    return () => {
      window.clearInterval(timer)
    }
  }, [loading, bootDone])

  useEffect(() => {
    let isCancelled = false
    const init = async () => {
      const isAuth = await checkAuth()
      if (isAuth) {
        await initializeData()
      }
      if (isCancelled) return

      setBootDone(true)
      setProgress(100)
      window.setTimeout(() => {
        if (!isCancelled) setLoading(false)
      }, 280)
    }
    void init()
    return () => {
      isCancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          overflow: 'hidden',
          background:
            'radial-gradient(1200px 600px at 10% -20%, rgba(37,99,235,0.22), transparent 60%), radial-gradient(900px 500px at 90% -15%, rgba(14,165,233,0.14), transparent 55%), linear-gradient(180deg, #070b16 0%, #0b1222 100%)',
        }}
      >
        <img
          src="/logo/blaene-logo-white.png"
          alt="Blaene"
          style={{
            position: 'absolute',
            width: 'min(70vw, 700px)',
            maxWidth: '700px',
            opacity: 0.08,
            filter: 'blur(1px)',
            transform: 'translateY(-10px)',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />

        <div
          style={{
            width: 'min(90vw, 460px)',
            borderRadius: '14px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(15, 23, 42, 0.68)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 22px 48px rgba(2, 6, 23, 0.45)',
            padding: '24px 22px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 600 }}>
              Admin Panel Yukleniyor
            </span>
            <span style={{ color: '#93c5fd', fontSize: '14px', fontWeight: 700 }}>
              %{progress}
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '10px',
              borderRadius: '999px',
              border: '1px solid rgba(51, 65, 85, 0.9)',
              background: 'rgba(15, 23, 42, 0.9)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: '999px',
                transition: 'width 0.18s ease',
                background:
                  'linear-gradient(90deg, rgba(37,99,235,0.95) 0%, rgba(56,189,248,0.95) 100%)',
                boxShadow: '0 0 12px rgba(59,130,246,0.45)',
              }}
            />
          </div>

          <p style={{ marginTop: '12px', color: '#94a3b8', fontSize: '12px' }}>
            Guvenli baglanti kuruluyor, veriler hazirlaniyor.
          </p>
        </div>
      </div>
    )
  }

  return isAuthenticated ? <DashboardLayout /> : <LoginPage />
}

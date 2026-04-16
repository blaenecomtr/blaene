import { useState } from 'react'
import { useAuthStore } from '../store/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setToken } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()

      if (!res.ok || !data.token) {
        throw new Error(data.message || 'Giriş başarısız')
      }

      setToken(data.token)
    } catch (err: any) {
      setError(err.message || 'E-posta veya şifre yanlış.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#fff',
          textAlign: 'center',
          marginBottom: '8px'
        }}>Blaene Admin</h1>

        <p style={{
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '14px',
          marginBottom: '30px'
        }}>Yönetim Paneline Hoşgeldiniz</p>

        {error && <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          color: '#fca5a5',
          padding: '12px',
          borderRadius: '8px',
          fontSize: '13px',
          marginBottom: '20px'
        }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: '#cbd5e1',
              fontSize: '14px',
              fontWeight: '500'
            }}>E-posta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@blaene.com"
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: '#cbd5e1',
              fontSize: '14px',
              fontWeight: '500'
            }}>Şifre</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  paddingRight: '40px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '14px'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '0'
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%',
            padding: '12px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid #3b82f6',
          color: '#93c5fd',
          padding: '12px',
          borderRadius: '8px',
          fontSize: '13px',
          textAlign: 'center'
        }}>
          Test Supabase hesabınızı kullanarak giriş yapabilirsiniz.
        </div>
      </div>
    </div>
  )
}

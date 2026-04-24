import { FormEvent, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { apiRequest } from '../lib/api'
import { Button } from '../components/ui/Button'

interface LoginResponse {
  token: string
  user?: {
    id: string
    email: string
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const { setToken } = useAuthStore()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const data = await apiRequest<LoginResponse>('/api/admin/login', {
        method: 'POST',
        body: { email, password },
      })

      if (!data?.token) {
        throw new Error('Token alinmadi')
      }

      setToken(data.token)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Giris basarisiz'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError('Lutfen sifre sifirlama icin e-posta girin.')
      return
    }

    setError('')
    setInfo('')
    setResetLoading(true)
    try {
      const data = await apiRequest<{ message?: string }>('/api/admin/forgot-password', {
        method: 'POST',
        body: { email: normalizedEmail },
      })
      setInfo(data?.message || 'Sifre sifirlama e-postasi gonderildi.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sifre sifirlama istegi basarisiz'
      setError(message)
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '40px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#fff',
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          Blaene Admin
        </h1>

        <p
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '14px',
            marginBottom: '30px',
          }}
        >
          Yonetim paneline giris
        </p>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
            }}
          >
            {error}
          </div>
        )}

        {info && (
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid #22c55e',
              color: '#86efac',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
            }}
          >
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                color: '#cbd5e1',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              E-posta
            </label>
            <input
              type="email"
              value={email}
              onChange={(evt) => setEmail(evt.target.value)}
              placeholder="admin@blaene.com"
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                color: '#cbd5e1',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Sifre
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(evt) => setPassword(evt.target.value)}
                placeholder="********"
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  paddingRight: '40px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '14px',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '0',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={resetLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#93c5fd',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration: 'underline',
                  padding: '0',
                  opacity: resetLoading ? 0.7 : 1,
                }}
              >
                {resetLoading ? 'Gonderiliyor...' : 'Sifremi unuttum'}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="admin-login-submit"
            variant="solid"
            size="default"
          >
            {loading ? 'Giris yapiliyor...' : 'Giris Yap'}
          </Button>
        </form>

        <div
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid #3b82f6',
            color: '#93c5fd',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          Admin kullanicisi ile giris yapin.
        </div>
      </div>
    </div>
  )
}

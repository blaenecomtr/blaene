import { useState } from 'react'
import { useAuthStore } from '../store/auth'

interface LogoutModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function LogoutModal({ isOpen, onClose }: LogoutModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { logout } = useAuthStore()

  const handleConfirm = async () => {
    if (!password) {
      setError('Lütfen şifrenizi girin.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/verify-logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({ password })
      })

      if (!res.ok) {
        throw new Error('Şifre yanlış.')
      }

      logout()
      onClose()
      window.location.href = '/admin/'
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '400px',
        width: '90%'
      }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#fff',
          marginBottom: '10px'
        }}>Çıkışı Onayla</h2>

        <p style={{
          color: '#94a3b8',
          fontSize: '14px',
          marginBottom: '20px'
        }}>Devam etmek için yönetici şifresini girin.</p>

        <div style={{ marginBottom: '15px' }}>
          <label style={{
            display: 'block',
            marginBottom: '5px',
            fontSize: '13px',
            fontWeight: '500',
            color: '#cbd5e1'
          }}>Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '14px'
            }}
          />
        </div>

        {error && <p style={{
          color: '#ef4444',
          fontSize: '13px',
          marginBottom: '10px'
        }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{
            flex: 1,
            padding: '10px',
            background: '#334155',
            color: '#cbd5e1',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}>
            İptal
          </button>
          <button onClick={handleConfirm} disabled={loading} style={{
            flex: 1,
            padding: '10px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            opacity: loading ? 0.6 : 1
          }}>
            {loading ? 'Kontrol ediliyor...' : 'Çıkış Yap'}
          </button>
        </div>
      </div>
    </div>
  )
}

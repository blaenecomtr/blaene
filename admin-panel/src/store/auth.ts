import { create } from 'zustand'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  userEmail: string | null
  setToken: (token: string | null) => void
  logout: () => void
  checkAuth: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  token: localStorage.getItem('admin_token'),
  userEmail: null,

  setToken: (token: string | null) => {
    if (token) {
      localStorage.setItem('admin_token', token)
    } else {
      localStorage.removeItem('admin_token')
    }
    set({ token, isAuthenticated: !!token })
  },

  logout: () => {
    localStorage.removeItem('admin_token')
    set({ token: null, isAuthenticated: false, userEmail: null })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('admin_token')
    if (!token) {
      set({ isAuthenticated: false })
      return false
    }

    try {
      const res = await fetch('/api/admin/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) {
        set({ isAuthenticated: false, token: null })
        localStorage.removeItem('admin_token')
        return false
      }

      const data = await res.json()
      set({
        isAuthenticated: true,
        token,
        userEmail: data.user?.email
      })
      return true
    } catch (err) {
      console.error('Auth check failed:', err)
      set({ isAuthenticated: false })
      return false
    }
  }
}))

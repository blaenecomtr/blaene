import { create } from 'zustand'
import { apiRequest } from '../lib/api'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  userEmail: string | null
  userRole: string | null
  setToken: (token: string | null) => void
  logout: () => void
  checkAuth: () => Promise<boolean>
}

interface MeResponse {
  user?: {
    id: string
    email: string | null
  }
  profile?: {
    role: string | null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  token: localStorage.getItem('admin_token'),
  userEmail: null,
  userRole: null,

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
    set({ token: null, isAuthenticated: false, userEmail: null, userRole: null })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('admin_token')
    if (!token) {
      set({ isAuthenticated: false, userEmail: null, userRole: null })
      return false
    }

    try {
      const data = await apiRequest<MeResponse>('/api/admin/me', { token })
      set({
        isAuthenticated: true,
        token,
        userEmail: data?.user?.email || null,
        userRole: data?.profile?.role || null,
      })
      return true
    } catch (err) {
      console.error('Auth check failed:', err)
      localStorage.removeItem('admin_token')
      set({ isAuthenticated: false, token: null, userEmail: null, userRole: null })
      return false
    }
  }
}))

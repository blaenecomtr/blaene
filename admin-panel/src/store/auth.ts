import { create } from 'zustand'
import { apiRequest } from '../lib/api'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  userEmail: string | null
  userName: string | null
  userRole: string | null
  canManageAdminUsers: boolean
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
    full_name?: string | null
    role: string | null
  }
  permissions?: {
    can_manage_admin_users?: boolean | null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  token: localStorage.getItem('admin_token'),
  userEmail: null,
  userName: null,
  userRole: null,
  canManageAdminUsers: false,

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
    set({
      token: null,
      isAuthenticated: false,
      userEmail: null,
      userName: null,
      userRole: null,
      canManageAdminUsers: false,
    })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('admin_token')
    if (!token) {
      set({ isAuthenticated: false, userEmail: null, userName: null, userRole: null, canManageAdminUsers: false })
      return false
    }

    try {
      const data = await apiRequest<MeResponse>('/api/admin/me', { token })
      set({
        isAuthenticated: true,
        token,
        userEmail: data?.user?.email || null,
        userName: data?.profile?.full_name || null,
        userRole: data?.profile?.role || null,
        canManageAdminUsers: Boolean(data?.permissions?.can_manage_admin_users),
      })
      return true
    } catch (err) {
      console.error('Auth check failed:', err)
      localStorage.removeItem('admin_token')
      set({
        isAuthenticated: false,
        token: null,
        userEmail: null,
        userName: null,
        userRole: null,
        canManageAdminUsers: false,
      })
      return false
    }
  }
}))

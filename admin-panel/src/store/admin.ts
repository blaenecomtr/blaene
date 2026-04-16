import { create } from 'zustand'
import { useAuthStore } from './auth'
import { apiRequest } from '../lib/api'

interface AdminState {
  currentPage: string
  setCurrentPage: (page: string) => void
  initializeData: () => Promise<void>
}

export const useAdminStore = create<AdminState>((set) => ({
  currentPage: 'dashboard',

  setCurrentPage: (page: string) => {
    set({ currentPage: page })
  },

  initializeData: async () => {
    const token = localStorage.getItem('admin_token')
    if (!token) return

    try {
      await apiRequest('/api/admin/me', { token })
    } catch (err) {
      console.error('Failed to initialize data:', err)
      useAuthStore.getState().logout()
    }
  }
}))

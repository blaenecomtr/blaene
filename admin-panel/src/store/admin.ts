import { create } from 'zustand'
import { useAuthStore } from './auth'

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
      // Load admin data here if needed
      // For now, just verify auth is still valid
      const res = await fetch('/api/admin/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) {
        useAuthStore.getState().logout()
      }
    } catch (err) {
      console.error('Failed to initialize data:', err)
    }
  }
}))

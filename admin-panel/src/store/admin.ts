import { create } from 'zustand'
import { useAuthStore } from './auth'
import { apiRequest } from '../lib/api'

export type AdminTheme = 'mono' | 'mono-orange' | 'ocean' | 'emerald' | 'sunset'

function normalizeTheme(value: string | null | undefined): AdminTheme {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'mono' ||
    normalized === 'mono-orange' ||
    normalized === 'emerald' ||
    normalized === 'sunset' ||
    normalized === 'ocean'
  ) {
    return normalized
  }
  return 'mono'
}

function applyThemeToDocument(theme: AdminTheme) {
  if (typeof document === 'undefined') return
  document.body.setAttribute('data-admin-theme', theme)
}

interface AdminState {
  currentPage: string
  theme: AdminTheme
  setCurrentPage: (page: string) => void
  setTheme: (theme: AdminTheme) => void
  initializeData: () => Promise<void>
}

export const useAdminStore = create<AdminState>((set) => ({
  currentPage: 'dashboard',
  theme: normalizeTheme(typeof localStorage !== 'undefined' ? localStorage.getItem('admin_theme') : null),

  setCurrentPage: (page: string) => {
    set({ currentPage: page })
  },

  setTheme: (theme: AdminTheme) => {
    const normalized = normalizeTheme(theme)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('admin_theme', normalized)
    }
    applyThemeToDocument(normalized)
    set({ theme: normalized })
  },

  initializeData: async () => {
    const initialTheme = normalizeTheme(typeof localStorage !== 'undefined' ? localStorage.getItem('admin_theme') : null)
    applyThemeToDocument(initialTheme)
    set({ theme: initialTheme })

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

import { create } from 'zustand';

type ThemeMode = 'dark' | 'light';

interface UiState {
  sidebarOpen: boolean;
  theme: ThemeMode;
  logoutModalOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  openLogoutModal: () => void;
  closeLogoutModal: () => void;
}

const storageTheme =
  (typeof window !== 'undefined' ? (window.localStorage.getItem('ea_theme') as ThemeMode | null) : null) ?? 'dark';

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: false,
  theme: storageTheme,
  logoutModalOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ea_theme', theme);
    }
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ea_theme', next);
    }
    set({ theme: next });
  },
  openLogoutModal: () => set({ logoutModalOpen: true }),
  closeLogoutModal: () => set({ logoutModalOpen: false }),
}));

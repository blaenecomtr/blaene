import { useUiStore } from '../../store/uiStore';
import { useAdminContext } from '../../context/AdminContext';
import { Avatar } from '../ui/Avatar';

interface TopbarProps {
  title: string;
}

function IconMenu() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
    </svg>
  );
}

function getInitials(fullName: string | null | undefined, email: string | null | undefined): string {
  if (fullName) {
    const parts = fullName.trim().split(' ');
    return (parts[0]?.[0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'AD';
}

export function Topbar({ title }: TopbarProps) {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const openLogoutModal = useUiStore((state) => state.openLogoutModal);
  const { profile } = useAdminContext();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900 lg:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 dark:border-zinc-700 dark:text-zinc-100"
          aria-label="Tema degistir"
          title="Tema"
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button
          type="button"
          onClick={toggleSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 dark:border-zinc-700 dark:text-zinc-200 lg:hidden"
          aria-label="Menuyu ac"
        >
          <IconMenu />
        </button>
        <h1 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <div className="order-3 flex w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800 md:order-none md:w-[280px]">
        <span className="text-gray-400"><IconSearch /></span>
        <input
          type="text"
          placeholder="Ara..."
          className="w-full border-0 bg-transparent px-2 text-xs text-gray-700 outline-none placeholder:text-gray-400 dark:text-zinc-200"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 dark:border-zinc-700 dark:text-zinc-100"
          aria-label="Bildirimler"
        >
          <IconBell />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>

        <button
          type="button"
          onClick={openLogoutModal}
          className="hover:opacity-80 transition"
          title={profile?.email ?? 'Çıkış Yap'}
          aria-label="Profil menüsü"
        >
          <Avatar initials={getInitials(profile?.full_name, profile?.email)} />
        </button>
      </div>
    </header>
  );
}

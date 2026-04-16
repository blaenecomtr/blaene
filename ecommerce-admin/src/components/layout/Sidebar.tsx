import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminContext } from '../../context/AdminContext';
import { useUiStore } from '../../store/uiStore';
import type { SidebarItem, SidebarSection } from '../../types';
import { Badge } from '../ui/Badge';

function Icon({ name }: { name: SidebarItem['icon'] }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const;
  switch (name) {
    case 'dashboard':
      return <svg {...common}><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" /></svg>;
    case 'traffic':
      return <svg {...common}><path d="M4 18h16M6 15l3-3 3 2 6-7" /></svg>;
    case 'members':
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M20 8v6M23 11h-6M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" /></svg>;
    case 'orders':
      return <svg {...common}><path d="M3 5h18M6 5v14h12V5M9 9h6M9 13h6" /></svg>;
    case 'products':
      return <svg {...common}><path d="M12 3 3 7.5 12 12l9-4.5L12 3Zm-9 9 9 4.5 9-4.5" /></svg>;
    case 'campaigns':
      return <svg {...common}><path d="M4 9V4h5M20 15v5h-5M5 5l14 14" /></svg>;
    case 'integrations':
      return <svg {...common}><path d="M8 7a5 5 0 0 1 8 0m-8 10a5 5 0 0 0 8 0M5 12h14" /></svg>;
    case 'reports':
      return <svg {...common}><path d="M6 20V10M12 20V4M18 20v-7" /></svg>;
    case 'settings':
      return <svg {...common}><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export function Sidebar() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  const { orders, users, promotions, products, analytics, dataError } = useAdminContext();

  // Dynamically compute sidebar sections based on real data
  const sidebarSections = useMemo<SidebarSection[]>(() => {
    const pendingOrders = orders.filter((o) => o.status === 'pending').length;
    const newUsers = Math.max(0, analytics?.metrics?.scoped_new_users || 0);
    const activePromotions = promotions.filter((p) => p.is_active).length;
    const hasError = !!dataError;

    const generalItems: SidebarItem[] = [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'dashboard' },
      {
        id: 'traffic',
        label: 'Site Trafigi',
        path: '/traffic',
        icon: 'traffic',
        badge: { text: 'Canli', tone: 'success' },
      },
      {
        id: 'members',
        label: 'Uyeler',
        path: '/members',
        icon: 'members',
        ...(newUsers > 0 ? { badge: { text: `+${newUsers}`, tone: 'success' as const } } : {}),
      },
    ];

    const salesItems: SidebarItem[] = [
      {
        id: 'orders',
        label: 'Siparisler',
        path: '/orders',
        icon: 'orders',
        ...(pendingOrders > 0 ? { badge: { text: String(pendingOrders), tone: 'danger' as const } } : {}),
      },
      { id: 'products', label: 'Urunler', path: '/products', icon: 'products' },
      {
        id: 'campaigns',
        label: 'Kampanyalar',
        path: '/campaigns',
        icon: 'campaigns',
        ...(activePromotions > 0 ? { badge: { text: String(activePromotions), tone: 'warning' as const } } : {}),
      },
    ];

    const marketplaceItems: SidebarItem[] = [
      {
        id: 'integrations',
        label: 'Entegrasyonlar',
        path: '/integrations',
        icon: 'integrations',
        ...(hasError ? { badge: { text: '!', tone: 'warning' as const } } : {}),
      },
      { id: 'reports', label: 'Raporlar', path: '/reports', icon: 'reports' },
    ];

    const systemItems: SidebarItem[] = [{ id: 'settings', label: 'Ayarlar', path: '/settings', icon: 'settings' }];

    return [
      { title: 'Genel Bakis', items: generalItems },
      { title: 'Satis', items: salesItems },
      { title: 'Pazaryeri', items: marketplaceItems },
      { title: 'Sistem', items: systemItems },
    ];
  }, [orders, users, promotions, products, analytics, dataError]);

  return (
    <>
      <aside
        className={`flex flex-col fixed inset-y-0 left-0 z-40 w-60 border-r border-gray-200 bg-gray-50 px-3 py-4 transition-transform dark:border-zinc-700 dark:bg-zinc-800 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          Blaene Admin
        </div>

        <nav className="space-y-4">
          {sidebarSections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">{section.title}</p>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded-xl border px-2.5 py-2 text-[11px] transition ${
                          isActive
                            ? 'border-gray-200 bg-white text-gray-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
                            : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
                        }`
                      }
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon name={item.icon} />
                        {item.label}
                      </span>
                      {item.badge ? <Badge text={item.badge.text} tone={item.badge.tone} /> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-3 border-t border-gray-200 dark:border-zinc-700">
          <a
            href="https://www.blaene.com.tr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-[11px] text-gray-500 hover:border-gray-200 hover:bg-white dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Ana Siteye Dön
          </a>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Sidebar kapat"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={closeSidebar}
        />
      ) : null}
    </>
  );
}

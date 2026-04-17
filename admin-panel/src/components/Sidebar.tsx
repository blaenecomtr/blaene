interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Urunler' },
  { id: 'orders', label: 'Siparisler' },
  { id: 'users', label: 'Musteriler' },
  { id: 'seo-content', label: 'SEO ve Icerik' },
  { id: 'site-settings', label: 'Site Ayarlari' },
  { id: 'marketing', label: 'Pazarlama' },
  { id: 'integrations', label: 'Entegrasyonlar' },
]

export default function Sidebar({ currentPage, onNavigate, isMobile = false, isOpen = false, onClose }: SidebarProps) {
  return (
    <aside
      style={{
        width: isMobile ? '280px' : '260px',
        background: '#1e293b',
        borderRight: '1px solid #334155',
        padding: '20px',
        overflowY: 'auto',
        position: 'fixed',
        height: '100vh',
        left: 0,
        top: 0,
        zIndex: 100,
        transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
        transition: 'transform 0.25s ease',
        boxShadow: isMobile ? '0 0 30px rgba(2, 6, 23, 0.55)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px' }}>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#fff',
          }}
        >
          Blaene Admin
        </div>

        {isMobile && (
          <button
            onClick={onClose}
            aria-label="Menuyu Kapat"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid #475569',
              color: '#cbd5e1',
              background: '#0f172a',
              fontSize: '20px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            X
          </button>
        )}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              padding: '10px 12px',
              color: currentPage === item.id ? '#fff' : '#cbd5e1',
              background: currentPage === item.id ? '#3b82f6' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              textAlign: 'left',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}

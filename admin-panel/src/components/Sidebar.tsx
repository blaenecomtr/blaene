interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Urunler' },
  { id: 'orders', label: 'Siparisler' },
  { id: 'users', label: 'Musteriler' },
]

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside
      style={{
        width: '260px',
        background: '#1e293b',
        borderRight: '1px solid #334155',
        padding: '20px',
        overflowY: 'auto',
        position: 'fixed',
        height: '100vh',
        left: 0,
        top: 0,
      }}
    >
      <div
        style={{
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#fff',
          marginBottom: '30px',
        }}
      >
        Blaene Admin
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

import { useAuthStore } from '../store/auth'

interface HeaderProps {
  pageTitle: string
  onLogoutClick: () => void
  showMenuButton?: boolean
  onMenuClick?: () => void
  isMobile?: boolean
}

export default function Header({
  pageTitle,
  onLogoutClick,
  showMenuButton = false,
  onMenuClick,
  isMobile = false,
}: HeaderProps) {
  const { userEmail } = useAuthStore()

  return (
    <header
      style={{
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: isMobile ? '12px 16px' : '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            aria-label="Menuyu Ac"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #475569',
              color: '#cbd5e1',
              background: '#0f172a',
              fontSize: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            MENU
          </button>
        )}

        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: isMobile ? '18px' : '22px',
              fontWeight: 600,
              color: '#fff',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pageTitle}
          </h1>
          {userEmail && (
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '12px' }}>
              {userEmail}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onLogoutClick}
        style={{
          background: '#ef4444',
          color: 'white',
          padding: isMobile ? '8px 12px' : '8px 16px',
          borderRadius: '6px',
          fontSize: isMobile ? '13px' : '14px',
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Cikis Yap
      </button>
    </header>
  )
}

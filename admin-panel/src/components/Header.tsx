import { useAuthStore } from '../store/auth'

interface HeaderProps {
  pageTitle: string
  onLogoutClick: () => void
}

export default function Header({ pageTitle, onLogoutClick }: HeaderProps) {
  const { userEmail } = useAuthStore()

  return (
    <header
      style={{
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 600,
            color: '#fff',
            margin: 0,
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

      <button
        onClick={onLogoutClick}
        style={{
          background: '#ef4444',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '6px',
          fontSize: '14px',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Cikis Yap
      </button>
    </header>
  )
}

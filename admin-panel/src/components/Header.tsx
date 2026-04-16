interface HeaderProps {
  onLogoutClick: () => void
}

export default function Header({ onLogoutClick }: HeaderProps) {
  return (
    <header style={{
      background: '#1e293b',
      borderBottom: '1px solid #334155',
      padding: '20px 30px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginLeft: '260px'
    }}>
      <h1 style={{
        fontSize: '24px',
        fontWeight: '600',
        color: '#fff'
      }}>Dashboard</h1>

      <button onClick={onLogoutClick} style={{
        background: '#ef4444',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '6px',
        fontSize: '14px',
        border: 'none',
        cursor: 'pointer'
      }}>
        Çıkış Yap
      </button>
    </header>
  )
}

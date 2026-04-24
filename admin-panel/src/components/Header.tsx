import { useAuthStore } from '../store/auth'
import { useAdminStore, type AdminTheme } from '../store/admin'
import { Button } from './ui/Button'

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
  const { theme, setTheme } = useAdminStore()

  const handleThemeChange = (value: string) => {
    setTheme(value as AdminTheme)
  }

  return (
    <header className={`admin-header${isMobile ? ' is-mobile' : ''}`}>
      <div className="admin-header-left">
        {showMenuButton && (
          <Button
            onClick={onMenuClick}
            aria-label="Menuyu Ac"
            variant="ghost"
            size="sm"
            neon={false}
            className="admin-icon-btn"
          >
            MENU
          </Button>
        )}

        <div className="admin-header-titles">
          <h1 className="admin-page-title">{pageTitle}</h1>
          {userEmail && <p className="admin-user-email">{userEmail}</p>}
        </div>
      </div>

      <div className="admin-header-actions">
        <select
          value={theme}
          onChange={(event) => handleThemeChange(event.target.value)}
          className="admin-theme-select"
          aria-label="Tema sec"
        >
          <option value="mono">Siyah Beyaz</option>
          <option value="mono-orange">Turuncu Siyah Beyaz</option>
          <option value="ocean">Ocean</option>
          <option value="emerald">Emerald</option>
          <option value="sunset">Sunset</option>
        </select>
        <span className="admin-status-chip">Canli Yonetim</span>
        <Button
          onClick={onLogoutClick}
          className="admin-logout-btn"
          variant="ghost"
          size="sm"
          neon={false}
        >
          Cikis Yap
        </Button>
      </div>

      <select
        value={theme}
        onChange={(event) => handleThemeChange(event.target.value)}
        className="admin-theme-select admin-theme-select-mobile"
        aria-label="Tema sec"
      >
        <option value="mono">Siyah Beyaz</option>
        <option value="mono-orange">Turuncu Siyah Beyaz</option>
        <option value="ocean">Ocean</option>
        <option value="emerald">Emerald</option>
        <option value="sunset">Sunset</option>
      </select>

      <Button
        onClick={onLogoutClick}
        className="admin-logout-btn admin-logout-btn-mobile"
        variant="ghost"
        size="sm"
        neon={false}
      >
        Cikis Yap
      </Button>
    </header>
  )
}

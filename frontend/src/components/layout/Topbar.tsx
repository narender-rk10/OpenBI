import { useState } from 'react'
import { Sun, Moon, LogOut, User } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../shared/ConfirmDialog'

export default function Topbar() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false)

  const handleLogoutClick = () => {
    setIsLogoutDialogOpen(true)
  }

  const confirmLogout = () => {
    setIsLogoutDialogOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <header className="h-20 flex items-center justify-between px-6 shrink-0 relative z-10 transition-all duration-300">
      {/* Left spacer - dashboard components could add breadcrumbs here later */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] hidden md:block opacity-0 animate-fade-in" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
          Overview
        </h2>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--border-color)] rounded-2xl px-2 py-1.5 shadow-[var(--shadow-sm)] animate-slide-in-right" style={{ animationDelay: '100ms' }}>
        
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] group"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <div className="relative">
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 transition-transform duration-500 group-hover:rotate-90" />
            ) : (
              <Moon className="w-5 h-5 transition-transform duration-500 group-hover:-rotate-12" />
            )}
          </div>
        </button>

        <div className="w-px h-6 bg-[var(--border-color)] mix-blend-overlay mx-1" />

        {/* User menu */}
        <div className="flex items-center gap-3 pl-2 pr-2">
          <div className="hidden sm:flex flex-col items-end">
            <p className="text-sm font-semibold leading-none text-[var(--text-primary)]">
              {user?.name || 'Admin'}
            </p>
            <p className="text-[11px] font-medium mt-1 text-[var(--text-muted)] uppercase tracking-wider">
              {user?.role?.replace('_', ' ') || 'OWNER'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity border border-[var(--border-color)] cursor-pointer">
            <User className="w-5 h-5" />
          </div>

          <button
            onClick={handleLogoutClick}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-red-500/10 hover:text-red-500 text-[var(--text-muted)] ml-1 border border-transparent hover:border-red-500/20"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isLogoutDialogOpen}
        title="Log out of OpenBI?"
        message="Are you sure you want to end your session? You will need to sign in again to access your projects."
        confirmText="Log out"
        onConfirm={confirmLogout}
        onCancel={() => setIsLogoutDialogOpen(false)}
        isDestructive={true}
      />
    </header>
  )
}

import * as React from 'react'
import { Link } from 'react-router-dom'
import { Bell, User2, LogOut, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { logout, useAccessToken } from './Auth'
import { http } from '@/lib/http'

type UserInfo = {
  id: string
  email: string
  name?: string
}

export function Topbar() {
  const [userMenuOpen, setUserMenuOpen] = React.useState(false)
  const token = useAccessToken()
  const userMenuRef = React.useRef<HTMLDivElement>(null)
  
  const { data: userData } = useQuery<UserInfo>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me')
      return res.data
    },
    enabled: !!token, // Only fetch if authenticated
  })

  // Close menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userMenuOpen])

  async function handleLogout() {
    setUserMenuOpen(false)
    await logout()
  }

  return (
    <header className="bg-[color:var(--color-panel)] border-b border-[color:var(--color-border)] sticky top-0 z-10 print:hidden">
      <a href="#content" className="skip-link">Skip to content</a>
      <div className="mx-auto max-w-7xl px-4 h-14 md:h-16 flex items-center justify-center relative" role="banner">
        <Link to="/" className="inline-flex items-center gap-3 text-[color:var(--color-text)] leading-none" aria-label="BOAZ-OS home">
          <img src="/boaz-os-logo.png" alt="BOAZ-OS" className="h-12 md:h-14 w-auto object-contain" />
          <span className="text-sm sm:text-base font-semibold">Back Office Applications ZoneOS (BOAZ-OS)</span>
        </Link>
        <div className="absolute right-4 flex items-center gap-3">
          <Link to="/apps/support" className="hidden sm:inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-1.5 text-sm hover:bg-[color:var(--color-muted)]">Support</Link>
          <button className="rounded-full p-2 hover:bg-[color:var(--color-muted)]" aria-label="Notifications">
            <Bell className="w-5 h-5" />
          </button>
          {token && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[color:var(--color-muted)] transition-colors"
                aria-label="User menu"
                aria-expanded={userMenuOpen}
              >
                <User2 className="w-5 h-5 flex-shrink-0" />
                <div className="text-left min-w-0">
                  <div className="text-sm font-medium text-[color:var(--color-text)] truncate">
                    {userData?.name || 'User'}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-lg py-2">
                  <div className="px-4 py-2 border-b border-[color:var(--color-border)]">
                    <div className="text-sm font-medium text-[color:var(--color-text)]">
                      {userData?.name || 'User'}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)] truncate">
                      {userData?.email || ''}
                    </div>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)] transition-colors"
                  >
                    <User2 className="w-4 h-4" />
                    <span>Settings</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)] transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}



import { NavLink } from 'react-router-dom'
import { Home, Grid3X3, Store, Settings, Shield } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useAccessToken } from './Auth'

const linkBase = 'flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-[color:var(--color-muted)]'

export function Sidebar() {
  const token = useAccessToken()
  
  // Check if user has admin permissions
  const { data: rolesData } = useQuery<{ roles: Array<{ name: string; permissions: string[] }> }>({
    queryKey: ['user', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      return res.data
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const isAdmin = rolesData?.roles?.some(r => r.permissions.includes('*')) || false

  return (
    <aside className="bg-[color:var(--color-panel)] border-r border-[color:var(--color-border)] h-full flex flex-col">
      <div className="p-4 flex-1">
        <div className="text-xs uppercase text-[color:var(--color-text-muted)] mb-2">Main</div>
        <nav className="grid gap-1">
          <NavLink to="/" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>
            <Home className="w-4 h-4" /> Home
          </NavLink>
          <NavLink to="/workspace/me" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>
            <Grid3X3 className="w-4 h-4" /> Workspace
          </NavLink>
          <NavLink to="/marketplace" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>
            <Store className="w-4 h-4" /> Marketplace
          </NavLink>
        </nav>
        <div className="text-xs uppercase text-[color:var(--color-text-muted)] mt-6 mb-2">Admin</div>
        <nav className="grid gap-1">
          <NavLink to="/settings" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>
            <Settings className="w-4 h-4" /> Settings
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>
              <Shield className="w-4 h-4" /> Admin Portal
            </NavLink>
          )}
        </nav>
      </div>
      <div className="p-4 border-t border-[color:var(--color-border)]">
        <img src="/boaz-os-logo.png" alt="BOAZ-OS" className="mx-auto h-14 md:h-16 w-auto opacity-90" />
      </div>
    </aside>
  )
}



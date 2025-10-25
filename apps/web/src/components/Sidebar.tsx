import { NavLink } from 'react-router-dom'
import { Home, Grid3X3, Store, Settings } from 'lucide-react'

const linkBase = 'flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-[color:var(--color-muted)]'

export function Sidebar() {
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
        </nav>
      </div>
      <div className="p-4 border-t border-[color:var(--color-border)]">
        <img src="/boaz-os-logo.png" alt="BOAZ-OS" className="mx-auto h-14 md:h-16 w-auto opacity-90" />
      </div>
    </aside>
  )
}



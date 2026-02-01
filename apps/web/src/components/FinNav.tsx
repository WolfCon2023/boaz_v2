import { NavLink } from 'react-router-dom'

const base = 'inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]'

export function FinNav() {
  return (
    <div className="flex flex-wrap items-center gap-2 p-4">
      <NavLink to="/apps/finhub" end className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>FinHub</NavLink>
      <NavLink to="/apps/finhub/financial-intelligence" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Financial Intelligence</NavLink>
      <NavLink to="/apps/finhub/revenue-intelligence" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Revenue Intelligence</NavLink>
    </div>
  )
}

import { Link } from 'react-router-dom'

export function AppFooter() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-center text-sm text-[color:var(--color-text-muted)] sm:flex-row">
      <div>
        © 2025 Wolf Consulting Group, LLC. BOAZ-OS Version 2. All rights reserved.
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
        <Link to="/about" className="hover:text-[color:var(--color-primary-600)]">
          About
        </Link>
        <span className="text-[color:var(--color-border)]">|</span>
        <Link to="/legal/eula" className="hover:text-[color:var(--color-primary-600)]">
          EULA
        </Link>
        <span className="text-[color:var(--color-border)]">|</span>
        <Link to="/legal/terms" className="hover:text-[color:var(--color-primary-600)]">
          Terms
        </Link>
        <span className="text-[color:var(--color-border)]">|</span>
        <Link to="/legal/privacy" className="hover:text-[color:var(--color-primary-600)]">
          Privacy
        </Link>
      </div>
    </div>
  )
}



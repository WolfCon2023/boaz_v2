import { Link } from 'react-router-dom'
import { Bell, User2 } from 'lucide-react'

export function Topbar() {
  return (
    <header className="bg-[color:var(--color-panel)] border-b border-[color:var(--color-border)] sticky top-0 z-10 print:hidden">
      <a href="#content" className="skip-link">Skip to content</a>
      <div className="mx-auto max-w-7xl px-4 h-14 md:h-16 flex items-center justify-center relative" role="banner">
        <Link to="/" className="inline-flex items-center gap-3 text-[color:var(--color-text)] leading-none" aria-label="BOAZ-OS home">
          <img src="/boaz-os-logo.png" alt="BOAZ-OS" className="h-12 md:h-14 w-auto object-contain" />
          <span className="text-sm sm:text-base font-semibold">Back Office Applications ZoneOS (BOAZ-OS)</span>
        </Link>
        <div className="absolute right-4 flex items-center gap-3">
          <button className="rounded-full p-2 hover:bg-[color:var(--color-muted)]">
            <Bell className="w-5 h-5" />
          </button>
          <button className="rounded-full p-2 hover:bg-[color:var(--color-muted)]">
            <User2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  )
}



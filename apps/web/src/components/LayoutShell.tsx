import type { ReactNode } from 'react'
import { Topbar } from '@/components/Topbar'
import { Sidebar } from '@/components/Sidebar'

export function LayoutShell({ children }: { children?: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-rows-[auto,1fr,auto] lg:grid-cols-[280px,1fr]">
      {/* Header */}
      <div className="row-start-1 lg:col-span-2">
        <Topbar />
      </div>
      {/* Sidebar - spans main and footer to maintain consistent left menu height */}
      <div className="row-start-2 row-span-2 hidden h-full lg:block print:hidden">
        <Sidebar />
      </div>
      {/* Main content */}
      <main id="content" className="row-start-2 lg:col-start-2" role="main">
        <div className="mx-auto max-w-7xl p-4">
          {children}
        </div>
      </main>
      {/* Footer pinned to bottom across pages */}
      <footer className="row-start-3 lg:col-start-2 border-t border-[color:var(--color-border)] py-6 text-center text-sm text-[color:var(--color-text-muted)] print:hidden">
        Built and maintained by <span className="font-semibold text-[color:var(--color-primary)]">Wolf Consulting Group, LLC</span> — Agile. Strategic. Powerful.
      </footer>
    </div>
  )
}



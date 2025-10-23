import { ReactNode } from 'react'
import { Topbar } from '@/components/Topbar'
import { Sidebar } from '@/components/Sidebar'

export function LayoutShell({ children }: { children?: ReactNode }) {
  return (
    <div className="grid grid-rows-[auto,1fr] lg:grid-cols-[280px,1fr] min-h-screen">
      <div className="lg:col-span-2 row-start-1">
        <Topbar />
      </div>
      <div className="hidden lg:block row-start-2">
        <Sidebar />
      </div>
      <main id="content" className="row-start-2 lg:col-start-2" role="main">
        <div className="mx-auto max-w-7xl p-4">
          {children}
          <footer className="mt-10 border-t border-[color:var(--color-border)] py-6 text-center text-sm text-[color:var(--color-text-muted)]">
            Built and maintained by <span className="font-semibold text-[color:var(--color-primary)]">Wolf Consulting Group, LLC</span> — Agile. Strategic. Powerful.
          </footer>
        </div>
      </main>
    </div>
  )
}



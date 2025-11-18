import type { ReactNode } from 'react'
import { AppFooter } from '@/components/AppFooter'

export function PublicShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto max-w-5xl p-4">
          <div className="flex items-center justify-center py-2">
            <img src="/boaz-os-logo.png" alt="BOAZ-OS" className="h-16 md:h-20 w-auto object-contain" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        {children}
      </main>
      <footer className="border-t border-[color:var(--color-border)] py-4">
        <AppFooter />
      </footer>
    </div>
  )
}



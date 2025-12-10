import { Moon, Sun } from 'lucide-react'
import { useCustomerPortalTheme } from './CustomerPortalThemeProvider'

export function CustomerPortalThemeToggle() {
  const { theme, toggleTheme } = useCustomerPortalTheme()

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
    >
      {isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {isDark ? 'Light' : 'Dark'} mode
      </span>
    </button>
  )
}



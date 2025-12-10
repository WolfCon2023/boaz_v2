import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

type CustomerPortalThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const CustomerPortalThemeContext = createContext<CustomerPortalThemeContextValue | undefined>(undefined)

export function CustomerPortalThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  // Initialize from localStorage or default
  useEffect(() => {
    const stored = localStorage.getItem('customer_portal_theme')
    if (stored === 'light' || stored === 'dark') {
      setThemeState(stored)
      document.documentElement.setAttribute('data-theme', stored)
      return
    }

    // Default to dark (matches internal app default)
    document.documentElement.setAttribute('data-theme', 'dark')
    setThemeState('dark')
  }, [])

  // Apply theme and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('customer_portal_theme', theme)
  }, [theme])

  function setTheme(next: Theme) {
    setThemeState(next)
  }

  function toggleTheme() {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <CustomerPortalThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </CustomerPortalThemeContext.Provider>
  )
}

export function useCustomerPortalTheme() {
  const ctx = useContext(CustomerPortalThemeContext)
  if (!ctx) {
    throw new Error('useCustomerPortalTheme must be used within a CustomerPortalThemeProvider')
  }
  return ctx
}



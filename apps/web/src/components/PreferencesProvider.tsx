import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useAccessToken } from './Auth'

type Preferences = {
  theme?: 'light' | 'dark'
  layout?: 'default' | 'compact'
  timezone?: string
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  timeFormat?: '12h' | '24h'
  emailNotifications?: boolean
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const token = useAccessToken()
  
  // Only fetch preferences if user is authenticated
  const { data: preferencesData } = useQuery<{ data: { preferences: Preferences } }>({
    queryKey: ['preferences', 'me'],
    queryFn: async () => {
      const res = await http.get('/api/preferences/me')
      return res.data
    },
    enabled: !!token, // Only fetch if authenticated
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
  
  useEffect(() => {
    const el = document.documentElement
    
    if (!preferencesData?.data?.preferences) {
      // Default to dark theme and default layout if no preferences
      if (!el.hasAttribute('data-theme')) {
        el.setAttribute('data-theme', 'dark')
      }
      if (!el.hasAttribute('data-layout')) {
        el.setAttribute('data-layout', 'default')
      }
      return
    }
    
    const prefs = preferencesData.data.preferences
    
    // Apply theme
    if (prefs.theme) {
      el.setAttribute('data-theme', prefs.theme)
    } else {
      // Default to dark if not set
      el.setAttribute('data-theme', 'dark')
    }
    
    // Apply layout - use data attribute for CSS selectors
    if (prefs.layout === 'compact') {
      el.setAttribute('data-layout', 'compact')
      el.style.setProperty('--dashboard-gap', '0.75rem')
      el.style.setProperty('--spacing-xs', '2px')
      el.style.setProperty('--spacing-sm', '4px')
      el.style.setProperty('--spacing-md', '6px')
      el.style.setProperty('--spacing-lg', '10px')
      el.style.setProperty('--spacing-xl', '16px')
      el.style.setProperty('--spacing-2xl', '24px')
      el.style.setProperty('--spacing-3xl', '32px')
      el.style.setProperty('--layout-padding', '0.75rem')
      el.style.setProperty('--layout-gap', '0.5rem')
      el.style.setProperty('--section-gap', '1rem')
    } else {
      el.setAttribute('data-layout', 'default')
      el.style.setProperty('--dashboard-gap', '1.5rem')
      el.style.setProperty('--spacing-xs', '4px')
      el.style.setProperty('--spacing-sm', '8px')
      el.style.setProperty('--spacing-md', '12px')
      el.style.setProperty('--spacing-lg', '16px')
      el.style.setProperty('--spacing-xl', '24px')
      el.style.setProperty('--spacing-2xl', '32px')
      el.style.setProperty('--spacing-3xl', '40px')
      el.style.setProperty('--layout-padding', '1rem')
      el.style.setProperty('--layout-gap', '1rem')
      el.style.setProperty('--section-gap', '1.5rem')
    }
  }, [preferencesData])
  
  // Listen for preference updates - no need to invalidate, just refetch when cache updates
  // The query will automatically update when the cache is updated by mutations
  
  return <>{children}</>
}


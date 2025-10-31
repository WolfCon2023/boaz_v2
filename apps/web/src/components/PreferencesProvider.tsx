import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
  
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
    if (!preferencesData?.data?.preferences) {
      // Default to dark theme if no preferences
      const el = document.documentElement
      if (!el.hasAttribute('data-theme')) {
        el.setAttribute('data-theme', 'dark')
      }
      return
    }
    
    const prefs = preferencesData.data.preferences
    const el = document.documentElement
    
    // Apply theme
    if (prefs.theme) {
      el.setAttribute('data-theme', prefs.theme)
    } else {
      // Default to dark if not set
      el.setAttribute('data-theme', 'dark')
    }
    
    // Apply layout
    if (prefs.layout === 'compact') {
      el.style.setProperty('--dashboard-gap', '0.75rem')
      el.style.setProperty('--spacing-md', '8px')
      el.style.setProperty('--spacing-lg', '12px')
    } else {
      el.style.setProperty('--dashboard-gap', '1.5rem')
      el.style.setProperty('--spacing-md', '12px')
      el.style.setProperty('--spacing-lg', '16px')
    }
  }, [preferencesData])
  
  // Listen for preference updates - no need to invalidate, just refetch when cache updates
  // The query will automatically update when the cache is updated by mutations
  
  return <>{children}</>
}


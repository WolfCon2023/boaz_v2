import { QueryClient } from '@tanstack/react-query'

type Preferences = {
  theme?: 'light' | 'dark'
  layout?: 'default' | 'compact'
  locale?: string
  timezone?: string
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  timeFormat?: '12h' | '24h'
  emailNotifications?: boolean
}

type PreferencesData = {
  data: {
    preferences: Preferences
  }
}

// Store queryClient reference globally so it can be accessed from non-hook functions
let globalQueryClient: QueryClient | null = null

export function setQueryClientForDateFormat(client: QueryClient) {
  globalQueryClient = client
}

/**
 * Get user preferences from React Query cache
 */
function getPreferences(): Preferences | null {
  if (!globalQueryClient) return null
  
  try {
    const data = globalQueryClient.getQueryData<PreferencesData>(['preferences', 'me'])
    return data?.data?.preferences || null
  } catch {
    return null
  }
}

/**
 * Format a date according to user preferences
 */
function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return '-'
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  
  const prefs = getPreferences()
  const dateFormat = prefs?.dateFormat || 'MM/DD/YYYY'
  const timezone = prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  
  // Convert to user's timezone using Intl.DateTimeFormat
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  
  const parts = formatter.formatToParts(d)
  const year = parts.find(p => p.type === 'year')?.value || ''
  const month = parts.find(p => p.type === 'month')?.value || ''
  const day = parts.find(p => p.type === 'day')?.value || ''
  
  // Apply user's preferred format
  switch (dateFormat) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`
  }
}

/**
 * Format a time according to user preferences
 */
function formatTime(date: Date | string | number | null | undefined): string {
  if (!date) return '-'
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  
  const prefs = getPreferences()
  const timeFormat = prefs?.timeFormat || '12h'
  const timezone = prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }
  
  if (timeFormat === '24h') {
    options.hour = '2-digit'
    options.hour12 = false
  } else {
    options.hour12 = true
  }
  
  const formatter = new Intl.DateTimeFormat('en-US', options)
  return formatter.format(d)
}

/**
 * Format a date and time according to user preferences
 */
function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return '-'
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  
  return `${formatDate(d)} ${formatTime(d)}`
}

/**
 * Get date string in ISO format for date inputs (YYYY-MM-DD)
 * This is always in ISO format regardless of user preferences since it's for inputs
 */
function formatDateForInput(date: Date | string | number | null | undefined): string {
  if (!date) return ''
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  
  // Date inputs always need YYYY-MM-DD format
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * React hook to get formatted date/time functions that react to preference changes
 */
export function useDateFormat() {
  // Import here to avoid circular dependency issues
  const { useQueryClient } = require('@tanstack/react-query')
  const queryClient = useQueryClient()
  
  // Store queryClient reference globally so non-hook functions can access it
  setQueryClientForDateFormat(queryClient)
  
  const prefsData = queryClient.getQueryData<PreferencesData>(['preferences', 'me'])
  const preferences = prefsData?.data?.preferences
  
  return {
    formatDate,
    formatTime,
    formatDateTime,
    formatDateForInput,
    preferences,
  }
}

// Export non-hook versions for use outside components
export { formatDate, formatTime, formatDateTime, formatDateForInput }


import axios from 'axios'

function pickBaseUrl(): string {
  const rawEnv = (import.meta as any)?.env?.VITE_API_URL as string | undefined
  const rawRuntime = typeof window !== 'undefined' ? (window as any).__API_URL as string | undefined : undefined
  const rawStored = typeof window !== 'undefined' ? (localStorage.getItem('API_URL') || undefined) : undefined
  
  // In production (Railway), we should always have VITE_API_URL set
  // In development, default to /api which uses Vite proxy
  const isProduction = import.meta.env.PROD
  const defaultUrl = isProduction ? (typeof window !== 'undefined' ? window.location.origin : '') : '/api'
  
  const candidate = [rawEnv, rawRuntime, rawStored, defaultUrl].find((v) => typeof v === 'string' && String(v).trim() !== '') as string
  return candidate.replace(/\/$/, '')
}

const baseURL = pickBaseUrl()
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log('[http] baseURL =', baseURL)
}

export const http = axios.create({ baseURL })
export const apiBaseURL = baseURL

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Helper function to get the full API URL for fetch requests
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  
  // If baseURL is '/api', we're in dev mode and should use the Vite proxy (just return the path)
  if (baseURL === '/api') {
    // Dev mode - use Vite proxy, return path as-is
    return cleanPath
  }
  
  // Production mode or custom API URL - construct full URL
  // Keep the full path including /api since routes are mounted at /api/auth, /api/crm, etc.
  // Example: baseURL = 'https://api.example.com', path = '/api/auth/login' -> 'https://api.example.com/api/auth/login'
  
  // Ensure baseURL doesn't end with / and path starts with /
  const cleanBase = baseURL.replace(/\/$/, '')
  const cleanPath2 = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`
  
  return `${cleanBase}${cleanPath2}`
}



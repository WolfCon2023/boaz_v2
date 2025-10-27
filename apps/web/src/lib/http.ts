import axios from 'axios'

function pickBaseUrl(): string {
  const rawEnv = (import.meta as any)?.env?.VITE_API_URL as string | undefined
  const rawRuntime = typeof window !== 'undefined' ? (window as any).__API_URL as string | undefined : undefined
  const rawStored = typeof window !== 'undefined' ? (localStorage.getItem('API_URL') || undefined) : undefined
  const candidate = [rawEnv, rawRuntime, rawStored, '/api'].find((v) => typeof v === 'string' && String(v).trim() !== '') as string
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



export function getPortalUrl(): string {
  const env = (import.meta as any)?.env?.VITE_PORTAL_URL as string | undefined
  const stored = typeof window !== 'undefined' ? (localStorage.getItem('PORTAL_URL') || undefined) : undefined
  const base = (env && env.trim()) || (stored && stored.trim()) || (typeof window !== 'undefined' ? window.location.origin : '')
  const root = base.replace(/\/$/, '')
  return `${root}/portal`
}



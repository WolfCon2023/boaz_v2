import { Store, ExternalLink, Copy, CheckCircle2 } from 'lucide-react'
import { catalog, getInstalledApps, installApp, uninstallApp } from '@/lib/apps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { Link } from 'react-router-dom'
import * as React from 'react'
import { useToast } from '@/components/Toast'

export default function Marketplace() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [copiedUrl, setCopiedUrl] = React.useState(false)
  const { data: installed = [] } = useQuery({ queryKey: ['installedApps'], queryFn: async () => getInstalledApps() })
  
  // Get user's application access
  const { data: userAccessData } = useQuery<{ applications: string[] }>({
    queryKey: ['user', 'applications'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/applications')
      return res.data
    },
    staleTime: 30 * 1000,
  })

  // Get user's access requests
  const { data: userRequestsData } = useQuery<{ requests: Array<{ id: string; appKey: string; status: string }> }>({
    queryKey: ['user', 'app-access-requests'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/app-access-requests')
      return res.data
    },
    staleTime: 30 * 1000,
  })
  
  const userHasAccess = (appKey: string) => {
    return userAccessData?.applications?.includes(appKey) || false
  }

  const hasPendingRequest = (appKey: string) => {
    return userRequestsData?.requests?.some(
      (req) => req.appKey === appKey && req.status === 'pending'
    ) || false
  }
  
  const install = useMutation({
    mutationFn: async (key: string) => installApp(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installedApps'] }),
  })
  const remove = useMutation({
    mutationFn: async (key: string) => uninstallApp(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installedApps'] }),
  })
  
  const [requestedApps, setRequestedApps] = React.useState<Set<string>>(new Set())
  
  const requestAccess = useMutation({
    mutationFn: async (appKey: string) => {
      const res = await http.post(`/api/auth/me/applications/${appKey}/request`)
      return { appKey, data: res.data }
    },
    onSuccess: (result) => {
      setRequestedApps(prev => new Set(prev).add(result.appKey))
      queryClient.invalidateQueries({ queryKey: ['user', 'applications'] })
      queryClient.invalidateQueries({ queryKey: ['user', 'app-access-requests'] })
      setTimeout(() => {
        setRequestedApps(prev => {
          const next = new Set(prev)
          next.delete(result.appKey)
          return next
        })
      }, 5000)
    },
  })
  
  const copyPortalUrl = () => {
    const url = `${window.location.origin}/portal/login`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true)
      showToast('Portal URL copied to clipboard', 'success')
      setTimeout(() => setCopiedUrl(false), 3000)
    }).catch(() => {
      showToast('Failed to copy URL', 'error')
    })
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Marketplace</h1>
      </div>
      
      {/* External Portals Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text)]">External Portals</h2>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Public-facing portals for external customers and partners
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Customer Portal */}
          <div className="block h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-base font-semibold text-[color:var(--color-text)]">Customer Portal</div>
                <div className="text-xs text-[color:var(--color-text-muted)] mt-1">
                  Self-service portal for customers to view invoices, tickets, and quotes
                </div>
              </div>
              <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                External
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <Link
                  to="/portal/login"
                  target="_blank"
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Portal
                </Link>
                <button
                  onClick={copyPortalUrl}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2 hover:bg-[color:var(--color-muted)] transition-colors"
                  title="Copy portal URL to share with customers"
                >
                  {copiedUrl ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-[color:var(--color-text-muted)]">
                💡 Use "Open Portal" to test or "Copy" to share the link with customers
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Applications Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Applications</h2>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Internal applications for your team
          </p>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((app) => {
          const hasAccess = userHasAccess(app.key)
          const isInstalled = installed.includes(app.key)
          
          return (
            <li key={app.key}>
              <div className="block h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
                <div className="text-base font-semibold">{app.name}</div>
                <div className="text-xs text-[color:var(--color-text-muted)] mt-1">{app.description}</div>
                <div className="mt-4 text-sm">
                  {hasAccess ? (
                    isInstalled ? (
                      <button onClick={() => remove.mutate(app.key)} className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 hover:bg-[color:var(--color-muted)]">Uninstall</button>
                    ) : (
                      <button onClick={() => install.mutate(app.key)} className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-1 text-white hover:bg-[color:var(--color-primary-700)]">Install</button>
                    )
                  ) : hasPendingRequest(app.key) ? (
                    <Link
                      to="/request-status"
                      className="inline-block rounded-lg border border-[color:var(--color-border)] px-3 py-1 hover:bg-[color:var(--color-muted)]"
                    >
                      Check Request Status
                    </Link>
                  ) : (
                    <button 
                      onClick={() => requestAccess.mutate(app.key)}
                      disabled={requestAccess.isPending}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      {requestAccess.isPending ? 'Requesting...' : 'Request Access'}
                    </button>
                  )}
                </div>
                {requestedApps.has(app.key) && (
                  <div className="mt-2 text-xs text-green-600">Your access request has been submitted</div>
                )}
              </div>
            </li>
          )
        })}
        </ul>
      </div>
    </div>
  )
}



import { Store } from 'lucide-react'
import { catalog, getInstalledApps, installApp, uninstallApp } from '@/lib/apps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { Link } from 'react-router-dom'
import * as React from 'react'

export default function Marketplace() {
  const queryClient = useQueryClient()
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
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Marketplace</h1>
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
  )
}



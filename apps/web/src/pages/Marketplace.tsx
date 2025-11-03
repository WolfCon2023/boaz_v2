import { Store } from 'lucide-react'
import { catalog, getInstalledApps, installApp, uninstallApp } from '@/lib/apps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export default function Marketplace() {
  const queryClient = useQueryClient()
  const { data: installed = [] } = useQuery({ queryKey: ['installedApps'], queryFn: async () => getInstalledApps() })
  const install = useMutation({
    mutationFn: async (key: string) => installApp(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installedApps'] }),
  })
  const remove = useMutation({
    mutationFn: async (key: string) => uninstallApp(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installedApps'] }),
  })
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Marketplace</h1>
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((app) => (
          <li key={app.key}>
            <a href={`/apps/${app.key}`} className="block h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 hover:bg-[color:var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-bg)]">
              <div className="text-base font-semibold">{app.name}</div>
              <div className="text-xs text-[color:var(--color-text-muted)] mt-1">{app.description}</div>
              <div className="mt-4 text-sm">
                {installed.includes(app.key) ? (
                  <button onClick={(e) => { e.preventDefault(); remove.mutate(app.key) }} className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 hover:bg-[color:var(--color-muted)]">Uninstall</button>
                ) : (
                  <button onClick={(e) => { e.preventDefault(); install.mutate(app.key) }} className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-1 text-white hover:bg-[color:var(--color-primary-700)]">Install</button>
                )}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}



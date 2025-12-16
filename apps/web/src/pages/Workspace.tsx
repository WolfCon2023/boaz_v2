import { Grid3X3 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catalog, getInstalledApps, uninstallApp, getWorkspaceOrder, setWorkspaceOrder } from '@/lib/apps'
import { DndContext, type DragEndEvent, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState } from 'react'
import { http } from '@/lib/http'
import { Link } from 'react-router-dom'
import { useToast } from '@/components/Toast'

export default function Workspace() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
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
  
  const remove = useMutation({
    mutationFn: async (key: string) => uninstallApp(key),
    onSuccess: (_data, key) => {
      const cleaned = getWorkspaceOrder().filter((k) => k !== key)
      setWorkspaceOrder(cleaned)
      setOrderedKeys((prev) => prev.filter((k) => k !== key))
      queryClient.invalidateQueries({ queryKey: ['installedApps'] })
    },
  })
  
  const [requestedApps, setRequestedApps] = useState<Set<string>>(new Set())
  
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
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to request access.'
      showToast(String(msg), 'error')
      queryClient.invalidateQueries({ queryKey: ['user', 'applications'] })
      queryClient.invalidateQueries({ queryKey: ['user', 'app-access-requests'] })
    },
  })
  
  const apps = useMemo(() => catalog.filter((a) => installed.includes(a.key)), [installed])
  const computeOrderedKeys = (baseApps: typeof apps) => {
    const order = getWorkspaceOrder()
    return order.length
      ? order.filter((k) => baseApps.some((a) => a.key === k)).concat(
          baseApps.map((a) => a.key).filter((k) => !order.includes(k))
        )
      : baseApps.map((a) => a.key)
  }
  const [orderedKeys, setOrderedKeys] = useState<string[]>(computeOrderedKeys(apps))
  useEffect(() => {
    setOrderedKeys(computeOrderedKeys(apps))
  }, [installed])
  const orderedApps = orderedKeys
    .map((k) => apps.find((a) => a.key === k)!)
    .filter(Boolean)

  // DnD sensors (must be hooks at top-level, not inside conditionals)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const current = orderedKeys
    const oldIndex = current.indexOf(String(active.id))
    const newIndex = current.indexOf(String(over.id))
    const next = arrayMove(current, oldIndex, newIndex)
    setOrderedKeys(next)
    setWorkspaceOrder(next)
  }

  function SortableTile({ appKey, name, description }: { appKey: string; name: string; description: string }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: appKey })
    const style = { transform: CSS.Transform.toString(transform), transition }
    const hasAccess = userHasAccess(appKey)
    const href = catalog.find((c) => c.key === appKey)?.href
    
    return (
      <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <div className="h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold">{name}</div>
              <div className="text-xs text-[color:var(--color-text-muted)] mt-1">{description}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); remove.mutate(appKey) }} className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]">Remove</button>
          </div>
          <div className="mt-4 text-sm">
            {hasAccess ? (
              href ? (
                <a href={href} className="text-[color:var(--color-primary)] underline">Open</a>
              ) : (
                <span className="text-xs text-[color:var(--color-text-muted)]">Coming soon</span>
              )
            ) : hasPendingRequest(appKey) ? (
              <Link
                to="/request-status"
                onClick={(e) => e.stopPropagation()}
                className="inline-block rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)]"
              >
                Check Request Status
              </Link>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    requestAccess.mutate(appKey)
                  }}
                  disabled={requestAccess.isPending}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                >
                  {requestAccess.isPending ? 'Requesting...' : 'Request Access'}
                </button>
                {requestedApps.has(appKey) && (
                  <div className="mt-2 text-xs text-green-600">Your access request has been submitted</div>
                )}
              </>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Grid3X3 className="h-5 w-5" />
        <h1 className="text-xl font-semibold">My Workspace</h1>
      </div>
      {apps.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-sm text-[color:var(--color-text-muted)]">No apps installed yet. Visit the <a className="underline" href="/marketplace">Marketplace</a> to add apps to your workspace.</div>
      ) : (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
          <SortableContext items={orderedKeys} strategy={rectSortingStrategy}>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {orderedApps.map((app) => (
                <SortableTile key={app.key} appKey={app.key} name={app.name} description={app.description} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}



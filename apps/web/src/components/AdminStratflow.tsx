import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { Trash2, Users, Plus, Search, X } from 'lucide-react'

type Project = {
  _id: string
  name: string
  key: string
  type: string
  ownerId: string
  teamIds: string[]
  createdAt?: string | null
  updatedAt?: string | null
  owner?: { id: string; email: string; name?: string } | null
}

type AdminProjectsResponse = { data: { items: Project[] } }

type Member = { id: string; email: string; name: string }
type MembersResponse = { data: { ownerId: string; teamIds: string[]; users: Member[] } }

type Component = { _id: string; name: string; createdAt?: string | null }
type ComponentsResponse = { data: { items: Component[] } }

type AdminUser = { id: string; email: string; name?: string }
type AdminUsersResponse = { users: AdminUser[] }

export function AdminStratflow() {
  const qc = useQueryClient()
  const toast = useToast()

  const projectsQ = useQuery<AdminProjectsResponse>({
    queryKey: ['admin', 'stratflow', 'projects'],
    queryFn: async () => (await http.get('/api/stratflow/admin/projects')).data,
    retry: false,
  })

  const projects = projectsQ.data?.data.items ?? []
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>('')
  React.useEffect(() => {
    if (selectedProjectId) return
    if (projects[0]?._id) setSelectedProjectId(projects[0]._id)
  }, [projects, selectedProjectId])

  const membersQ = useQuery<MembersResponse>({
    queryKey: ['admin', 'stratflow', 'project', selectedProjectId, 'members'],
    queryFn: async () => (await http.get(`/api/stratflow/admin/projects/${selectedProjectId}/members`)).data,
    enabled: Boolean(selectedProjectId),
    retry: false,
  })

  const componentsQ = useQuery<ComponentsResponse>({
    queryKey: ['admin', 'stratflow', 'project', selectedProjectId, 'components'],
    queryFn: async () => (await http.get(`/api/stratflow/admin/projects/${selectedProjectId}/components`)).data,
    enabled: Boolean(selectedProjectId),
    retry: false,
  })

  const delProject = useMutation({
    mutationFn: async (projectId: string) => (await http.delete(`/api/stratflow/admin/projects/${projectId}`)).data,
    onSuccess: async () => {
      toast.showToast('Project deleted.', 'success')
      setSelectedProjectId('')
      await qc.invalidateQueries({ queryKey: ['admin', 'stratflow', 'projects'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to delete project.', 'error'),
  })

  const [newComponent, setNewComponent] = React.useState('')
  const addComponent = useMutation({
    mutationFn: async () => {
      const name = newComponent.trim()
      if (!name) throw new Error('Enter a component name.')
      return (await http.post(`/api/stratflow/admin/projects/${selectedProjectId}/components`, { name })).data
    },
    onSuccess: async () => {
      setNewComponent('')
      await qc.invalidateQueries({ queryKey: ['admin', 'stratflow', 'project', selectedProjectId, 'components'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to create component.', 'error'),
  })

  const delComponent = useMutation({
    mutationFn: async (componentId: string) =>
      (await http.delete(`/api/stratflow/admin/projects/${selectedProjectId}/components/${componentId}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'stratflow', 'project', selectedProjectId, 'components'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to delete component.', 'error'),
  })

  const [userSearch, setUserSearch] = React.useState('')
  const usersQ = useQuery<AdminUsersResponse>({
    queryKey: ['admin', 'users', 'for-project', userSearch],
    queryFn: async () => {
      const params = userSearch ? { search: userSearch, limit: '50' } : { limit: '50' }
      const res = await http.get('/api/auth/admin/users', { params })
      return res.data
    },
    retry: false,
  })
  const allUsers = usersQ.data?.users ?? []

  const addMember = useMutation({
    mutationFn: async (userId: string) => (await http.post(`/api/stratflow/admin/projects/${selectedProjectId}/members`, { userId })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'stratflow', 'project', selectedProjectId, 'members'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to add member.', 'error'),
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => (await http.delete(`/api/stratflow/admin/projects/${selectedProjectId}/members/${userId}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'stratflow', 'project', selectedProjectId, 'members'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to remove member.', 'error'),
  })

  const members = membersQ.data?.data.users ?? []
  const ownerId = membersQ.data?.data.ownerId ?? ''
  const memberIds = new Set(members.map((m) => m.id))

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">StratFlow Admin</div>
            <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">Delete projects, manage members, and manage Components.</div>
          </div>
          <div className="text-sm text-[color:var(--color-text-muted)]">{projectsQ.isFetching ? 'Refreshing…' : `${projects.length} project(s)`}</div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.key}) · {p.type}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
            disabled={!selectedProjectId || delProject.isPending}
            onClick={() => {
              const p = projects.find((x) => x._id === selectedProjectId)
              const label = p ? `${p.name} (${p.key})` : selectedProjectId
              if (confirm(`Delete StratFlow project ${label}? This will remove boards, issues, sprints, components, and comments.`)) {
                delProject.mutate(selectedProjectId)
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            {delProject.isPending ? 'Deleting…' : 'Delete project'}
          </button>
        </div>
      </div>

      {selectedProjectId ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <div className="text-lg font-semibold">Project members</div>
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">{membersQ.isFetching ? 'Loading…' : `${members.length}`}</div>
            </div>

            <div className="rounded-xl border border-[color:var(--color-border)] p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-text-muted)]" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] pl-10 pr-10 py-2 text-sm"
                  placeholder="Search users to add…"
                />
                {userSearch ? (
                  <button
                    type="button"
                    onClick={() => setUserSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-[color:var(--color-border)] rounded-lg border border-[color:var(--color-border)]">
                {allUsers
                  .filter((u) => !memberIds.has(u.id))
                  .slice(0, 50)
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-[color:var(--color-muted)] flex items-center justify-between gap-3"
                      onClick={() => addMember.mutate(u.id)}
                      disabled={addMember.isPending}
                      title="Add to project"
                    >
                      <div>
                        <div className="text-sm font-medium">{u.email}</div>
                        {u.name ? <div className="text-xs text-[color:var(--color-text-muted)]">{u.name}</div> : null}
                      </div>
                      <span className="text-xs rounded-lg border border-[color:var(--color-border)] px-2 py-1">Add</span>
                    </button>
                  ))}
                {!allUsers.length ? <div className="px-3 py-3 text-sm text-[color:var(--color-text-muted)]">No users found.</div> : null}
              </div>
            </div>

            <div className="mt-4 divide-y divide-[color:var(--color-border)] rounded-xl border border-[color:var(--color-border)]">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.name || m.email}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)] truncate">{m.email}</div>
                    {m.id === ownerId ? <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Owner</div> : null}
                  </div>
                  <button
                    type="button"
                    disabled={removeMember.isPending || m.id === ownerId}
                    onClick={() => {
                      if (m.id === ownerId) return
                      if (confirm(`Remove ${m.email} from this project? They will no longer be assignable.`)) removeMember.mutate(m.id)
                    }}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    title={m.id === ownerId ? 'Owner cannot be removed' : 'Remove member'}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!members.length && !membersQ.isLoading ? <div className="px-4 py-6 text-sm text-[color:var(--color-text-muted)]">No members.</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                <div className="text-lg font-semibold">Components</div>
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">{componentsQ.isFetching ? 'Loading…' : `${(componentsQ.data?.data.items ?? []).length}`}</div>
            </div>

            <div className="flex items-center gap-2">
              <input
                value={newComponent}
                onChange={(e) => setNewComponent(e.target.value)}
                className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                placeholder="New component name…"
              />
              <button
                type="button"
                className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                disabled={addComponent.isPending || !newComponent.trim()}
                onClick={() => addComponent.mutate()}
              >
                Add
              </button>
            </div>

            <div className="mt-4 divide-y divide-[color:var(--color-border)] rounded-xl border border-[color:var(--color-border)]">
              {(componentsQ.data?.data.items ?? []).map((c) => (
                <div key={c._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="text-sm font-medium">{c.name}</div>
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                    disabled={delComponent.isPending}
                    onClick={() => {
                      if (confirm(`Delete component "${c.name}"? It will be removed from any issues using it.`)) delComponent.mutate(c._id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
              {!(componentsQ.data?.data.items ?? []).length && !componentsQ.isLoading ? (
                <div className="px-4 py-6 text-sm text-[color:var(--color-text-muted)]">No components yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}


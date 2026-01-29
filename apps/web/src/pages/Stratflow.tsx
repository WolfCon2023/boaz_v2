import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { CRMNav } from '@/components/CRMNav'
import { KBHelpButton } from '@/components/KBHelpButton'

type Project = {
  _id: string
  name: string
  key: string
  description?: string | null
  type: 'SCRUM' | 'KANBAN' | 'TRADITIONAL' | 'HYBRID'
  status: 'Active' | 'On Hold' | 'Completed' | 'Archived'
  createdAt?: string | null
  updatedAt?: string | null
}

type TemplateKey = Project['type']
type WizardStep = 'template' | 'details'

function suggestKeyFromName(name: string) {
  const n = String(name || '').trim()
  if (!n) return ''
  const letters = n
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').charAt(0))
    .join('')
    .toUpperCase()
  return letters || n.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()
}

const TEMPLATE_PREVIEWS: Record<TemplateKey, { name: string; bullets: string[]; creates: string[] }> = {
  KANBAN: {
    name: 'Kanban',
    bullets: ['Continuous flow', 'WIP visibility', 'Great for ops + support'],
    creates: ['Board (To Do / In Progress / Done)'],
  },
  SCRUM: {
    name: 'Scrum',
    bullets: ['Backlog + sprint board', 'Sprint planning friendly', 'Velocity-ready'],
    creates: ['Backlog', 'Sprint Board (To Do / In Progress / Done)'],
  },
  TRADITIONAL: {
    name: 'Traditional',
    bullets: ['Milestones + phases', 'Great for fixed-scope projects', 'Roadmap oriented'],
    creates: ['Milestones board (Not Started / In Progress / Blocked / Complete)'],
  },
  HYBRID: {
    name: 'Hybrid',
    bullets: ['Mix of backlog + board', 'Flexible for teams', 'Good transition path'],
    creates: ['Board (To Do / In Progress / Done)', 'Backlog'],
  },
}

export default function Stratflow() {
  const qc = useQueryClient()
  const toast = useToast()
  const nav = useNavigate()

  const projectsQ = useQuery<{ data: { items: Project[] } }>({
    queryKey: ['stratflow', 'projects'],
    queryFn: async () => (await http.get('/api/stratflow/projects')).data,
    retry: false,
  })

  const [createOpen, setCreateOpen] = React.useState(false)
  const [step, setStep] = React.useState<WizardStep>('template')
  const [name, setName] = React.useState('')
  const [key, setKey] = React.useState('')
  const [type, setType] = React.useState<Project['type']>('KANBAN')
  const [description, setDescription] = React.useState('')

  React.useEffect(() => {
    if (!createOpen) return
    setStep('template')
  }, [createOpen])

  React.useEffect(() => {
    if (!createOpen) return
    if (key.trim()) return
    const suggested = suggestKeyFromName(name)
    if (suggested) setKey(suggested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, createOpen])

  const createProject = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        key: key.trim(),
        description: description.trim() || null,
        type,
      }
      return (await http.post('/api/stratflow/projects', payload)).data
    },
    onSuccess: async (data: any) => {
      toast.showToast('Project created.', 'success')
      setCreateOpen(false)
      const newId = data?.data?._id
      const defaultBoardId = data?.data?.defaultBoardId
      setName('')
      setKey('')
      setDescription('')
      setType('KANBAN')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projects'] })
      if (newId) {
        const qs = defaultBoardId ? `?board=${encodeURIComponent(String(defaultBoardId))}` : ''
        nav(`/apps/stratflow/${encodeURIComponent(String(newId))}${qs}`)
      }
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to create project.', 'error'),
  })

  const projects = projectsQ.data?.data.items ?? []

  return (
    <div className="space-y-4">
      <CRMNav />

      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">StratFlow Projects</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">A modern project + work management hub (Scrum, Kanban, Traditional).</p>
        </div>
        <div className="flex items-center gap-2">
          <KBHelpButton href="/apps/crm/support/kb/stratflow-guide" title="StratFlow KB: Getting started" ariaLabel="Open StratFlow Knowledge Base (Getting started)" />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
          >
            New project
          </button>
          <Link to="/apps/crm" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">
            CRM Hub
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
          <div className="text-sm font-semibold">Projects</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">{projectsQ.isFetching ? 'Refreshing…' : `${projects.length} total`}</div>
        </div>
        <div className="divide-y divide-[color:var(--color-border)]">
          {projects.map((p) => (
            <div key={p._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                    {p.key}
                  </span>
                  <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                    {p.type}
                  </span>
                </div>
                {p.description ? <div className="text-xs text-[color:var(--color-text-muted)]">{p.description}</div> : null}
              </div>
              <Link
                to={`/apps/stratflow/${encodeURIComponent(p._id)}`}
                className="inline-flex items-center justify-center rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
              >
                Open Flow Hub
              </Link>
            </div>
          ))}
          {!projects.length && !projectsQ.isLoading && (
            <div className="px-4 py-10 text-center text-sm text-[color:var(--color-text-muted)]">
              No projects yet. Create your first project to get started.
            </div>
          )}
        </div>
      </section>

      {createOpen && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCreateOpen(false)}>
          <div
            className="w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[color:var(--color-border)] pb-3">
              <div>
                <div className="text-base font-semibold">New project</div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {step === 'template' ? 'Step 1 of 2 · Choose a template' : 'Step 2 of 2 · Name and details'}
                </div>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="p-2 rounded hover:bg-[color:var(--color-muted)]">
                ✕
              </button>
            </div>

            {step === 'template' ? (
              <div className="space-y-3">
                <div className="text-sm text-[color:var(--color-text-muted)]">
                  Pick the workflow you want. We’ll generate a default board setup you can refine later.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(TEMPLATE_PREVIEWS) as TemplateKey[]).map((k) => {
                    const t = TEMPLATE_PREVIEWS[k]
                    const active = type === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setType(k)}
                        className={[
                          'text-left rounded-2xl border p-4 hover:bg-[color:var(--color-muted)]',
                          active ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)]',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">{t.name}</div>
                          {active ? (
                            <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-[color:var(--color-text-muted)]">
                          {t.bullets.map((b) => (
                            <li key={b}>- {b}</li>
                          ))}
                        </ul>
                        <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
                          <div className="text-[10px] font-semibold text-[color:var(--color-text-muted)]">Creates</div>
                          <div className="mt-1 space-y-1 text-xs text-[color:var(--color-text-muted)]">
                            {t.creates.map((c) => (
                              <div key={c}>{c}</div>
                            ))}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Project name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                    placeholder="e.g., Website Revamp"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Project key</label>
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                    placeholder="e.g., WEB"
                  />
                  <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">Short identifier. We’ll auto-format it (A–Z, 0–9, hyphen).</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Template</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                  >
                    <option value="SCRUM">Scrum</option>
                    <option value="KANBAN">Kanban</option>
                    <option value="TRADITIONAL">Traditional</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Description (optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                    placeholder="What are you trying to manage?"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[color:var(--color-border)] mt-4">
              {step === 'details' ? (
                <button
                  type="button"
                  onClick={() => setStep('template')}
                  className="px-4 py-2 text-sm rounded-lg border border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]"
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  createProject.isPending ||
                  (step === 'details' ? (!name.trim() || !key.trim()) : false)
                }
                onClick={() => {
                  if (step === 'template') {
                    setStep('details')
                    return
                  }
                  createProject.mutate()
                }}
                className="px-4 py-2 text-sm rounded-lg border bg-[color:var(--color-primary-600)] text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                {step === 'template'
                  ? 'Continue'
                  : createProject.isPending
                    ? 'Creating…'
                    : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


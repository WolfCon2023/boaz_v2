import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { DocumentsList } from '@/components/DocumentsList'

type Contact = { _id: string; name?: string; email?: string; company?: string; mobilePhone?: string; officePhone?: string; isPrimary?: boolean; primaryPhone?: 'mobile' | 'office' }

type ContactSurveyStatusSummary = {
  contactId: string
  responseCount: number
  lastResponseAt: string | null
  lastScore: number | null
}

async function fetchContacts({ pageParam, queryKey }: { pageParam?: string; queryKey: any[] }) {
  const [_key, q, page] = queryKey as [string, string, number]
  const params: any = { q }
  if (pageParam !== undefined) params.cursor = pageParam
  else params.page = page
  const res = await http.get('/api/crm/contacts', { params })
  return res.data as { data: { items: Contact[]; nextCursor?: string | null; page?: number; pageSize?: number; total?: number } }
}

export default function CRMContacts() {
  const qc = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'name'|'email'|'company'>('name')
  const [dir, setDir] = React.useState<'asc'|'desc'>('asc')
  const [page, setPage] = React.useState(0)
  type ColumnDef = { key: string; visible: boolean; label: string }
  const defaultCols: ColumnDef[] = [
    { key: 'name', visible: true, label: 'Name' },
    { key: 'email', visible: true, label: 'Email' },
    { key: 'company', visible: true, label: 'Company' },
    { key: 'mobilePhone', visible: true, label: 'Mobile' },
    { key: 'officePhone', visible: true, label: 'Office' },
    { key: 'isPrimary', visible: true, label: 'Primary' },
    { key: 'primaryPhone', visible: true, label: 'Primary phone' },
    { key: 'surveyStatus', visible: true, label: 'Survey' },
  ]
  function ensureSurveyCol(cols: ColumnDef[]): ColumnDef[] {
    if (!cols.some((c) => c.key === 'surveyStatus')) {
      return [...cols, { key: 'surveyStatus', visible: true, label: 'Survey' }]
    }
    return cols
  }
  const [cols, setCols] = React.useState<ColumnDef[]>(ensureSurveyCol(defaultCols))
  const [savedViews, setSavedViews] = React.useState<Array<{ id: string; name: string; config: any }>>([])
  const [showSaveViewDialog, setShowSaveViewDialog] = React.useState(false)
  const [savingViewName, setSavingViewName] = React.useState('')
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [draggedCol, setDraggedCol] = React.useState<string | null>(null)
  const initializedFromUrl = React.useRef(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null)
  const [inlineName, setInlineName] = React.useState<string>('')
  const [inlineEmail, setInlineEmail] = React.useState<string>('')
  const [inlineCompany, setInlineCompany] = React.useState<string>('')
  const [inlineMobilePhone, setInlineMobilePhone] = React.useState<string>('')
  const [inlineOfficePhone, setInlineOfficePhone] = React.useState<string>('')
  const create = useMutation({
    mutationFn: async (payload: { name: string; email?: string; company?: string; mobilePhone?: string; officePhone?: string; isPrimary?: boolean; primaryPhone?: 'mobile' | 'office' }) => {
      const res = await http.post('/api/crm/contacts', payload)
      return res.data as { data: Contact }
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      const contactName = created.data?.name || 'Contact'
      const contactEmail = created.data?.email ? ` (${created.data.email})` : ''
      toast.showToast(`Contact "${contactName}${contactEmail}" has been added successfully.`, 'success')
    },
  })
  const { data, refetch, isFetching } = useInfiniteQuery({
    queryKey: ['contacts', q, page],
    queryFn: fetchContacts,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/contacts/${id}`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })

  const update = useMutation({
    mutationFn: async (payload: Partial<Contact> & { _id: string }) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/crm/contacts/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.showToast('BOAZ says: Contact saved.', 'success')
    },
  })

  function startInlineEdit(c: Contact) {
    setInlineEditId(c._id)
    setInlineName(c.name ?? '')
    setInlineEmail(c.email ?? '')
    setInlineCompany(c.company ?? '')
    setInlineMobilePhone(c.mobilePhone ?? '')
    setInlineOfficePhone(c.officePhone ?? '')
  }
  async function saveInlineEdit() {
    if (!inlineEditId) return
    const payload: any = { _id: inlineEditId }
    payload.name = inlineName || undefined
    payload.email = inlineEmail || undefined
    payload.company = inlineCompany || undefined
    payload.mobilePhone = inlineMobilePhone || undefined
    payload.officePhone = inlineOfficePhone || undefined
    await update.mutateAsync(payload)
    cancelInlineEdit()
  }
  function cancelInlineEdit() {
    setInlineEditId(null)
    setInlineName('')
    setInlineEmail('')
    setInlineCompany('')
    setInlineMobilePhone('')
    setInlineOfficePhone('')
  }

  const [editing, setEditing] = React.useState<Contact | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!editing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'contact-editor')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      try { document.body.removeChild(el) } catch {}
      setPortalEl(null)
    }
  }, [editing])

  const items = data?.pages.flatMap((p) => p.data.items) ?? []
  const total = data?.pages[0]?.data.total
  const pageSize = data?.pages[0]?.data.pageSize ?? 25
  const totalPages = total ? Math.ceil(total / pageSize) : 0

  const visibleItems = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = items
    if (ql) {
      rows = rows.filter((c) =>
        [c.name, c.email, c.company, c.mobilePhone, c.officePhone]
          .some((v) => (v ?? '').toString().toLowerCase().includes(ql))
      )
    }
    const dirMul = dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sort]
      const bv = b[sort]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return String(av).localeCompare(String(bv)) * dirMul
    })
    return rows
  }, [items, q, sort, dir])
  const anySelected = selectedIds.size > 0
  const allSelected = (visibleItems.length > 0) && visibleItems.every((c) => selectedIds.has(c._id))

  const contactIdsParam = React.useMemo(
    () => (visibleItems.length ? visibleItems.map((c) => c._id).join(',') : ''),
    [visibleItems],
  )

  const { data: contactSurveyStatusData } = useQuery({
    queryKey: ['contacts-survey-status', contactIdsParam],
    enabled: !!contactIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/contacts/status', {
        params: { contactIds: contactIdsParam },
      })
      return res.data as { data: { items: ContactSurveyStatusSummary[] } }
    },
  })

  const contactSurveyStatusMap = React.useMemo(() => {
    const map = new Map<string, ContactSurveyStatusSummary>()
    for (const s of contactSurveyStatusData?.data.items ?? []) {
      map.set(s.contactId, s)
    }
    return map
  }, [contactSurveyStatusData?.data.items])

  // Outreach: sequences list for enroll action
  const seqs = useQuery({
    queryKey: ['outreach-sequences-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/sequences', { params: { sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string }> } }
    },
  })
  const enrollmentsQ = useQuery({
    queryKey: ['outreach-enrollments', editing?._id],
    enabled: Boolean(editing?._id),
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/enroll', { params: { contactId: editing?._id, includeCompleted: false } })
      return res.data as { data: { items: Array<{ _id: string; sequenceId: string; startedAt: string; lastStepIndex?: number; completedAt?: string | null }> } }
    },
  })

  // Refs for outreach action inputs to avoid nested forms
  const seqSelectRef = React.useRef<HTMLSelectElement | null>(null)
  const oneOffSubjectRef = React.useRef<HTMLInputElement | null>(null)
  const oneOffTextRef = React.useRef<HTMLTextAreaElement | null>(null)
  const oneOffAttachmentRef = React.useRef<HTMLInputElement | null>(null)
  const seqNameById = React.useMemo(() => {
    const list = seqs.data?.data.items ?? []
    return new Map(list.map((s) => [s._id, s.name ?? 'Sequence']))
  }, [seqs.data])
  const [showHistory, setShowHistory] = React.useState(false)
  const historyQ = useQuery({
    queryKey: ['contact-history', editing?._id, showHistory],
    enabled: Boolean(editing?._id && showHistory),
    queryFn: async () => {
      const res = await http.get(`/api/crm/contacts/${editing?._id}/history`)
      return res.data as { data: { createdAt: string; enrollments: Array<{ sequenceName: string; startedAt: string; completedAt?: string|null }>; events: Array<{ channel: string; event: string; at: string; recipient?: string|null }> } }
    },
  })

  const { data: surveyProgramsData } = useQuery({
    queryKey: ['surveys-programs-contacts'],
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/programs')
      return res.data as {
        data: { items: Array<{ _id: string; name: string; type: 'NPS' | 'CSAT' | 'Post‑interaction' }> }
      }
    },
  })
  const surveyPrograms = React.useMemo(
    () => surveyProgramsData?.data.items ?? [],
    [surveyProgramsData?.data.items],
  )

  const [surveyProgramId, setSurveyProgramId] = React.useState('')
  const [surveyRecipientName, setSurveyRecipientName] = React.useState('')
  const [surveyRecipientEmail, setSurveyRecipientEmail] = React.useState('')

  React.useEffect(() => {
    if (!editing) return
    setSurveyRecipientName(editing.name ?? '')
    setSurveyRecipientEmail(editing.email ?? '')
  }, [editing])

  const sendSurveyEmail = useMutation({
    mutationFn: async (payload: {
      programId: string
      recipientName?: string
      recipientEmail: string
      contactId: string
      accountId?: string
    }) => {
      const { programId, ...rest } = payload
      const res = await http.post(`/api/crm/surveys/programs/${programId}/send-email`, rest)
      return res.data
    },
    onSuccess: () => {
      toast.showToast('Survey email sent', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to send survey email'
      toast.showToast(msg, 'error')
    },
  })

  // Initialize from URL and localStorage once
  React.useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true
    const get = (key: string) => searchParams.get(key) || ''
    const q0 = get('q')
    const sort0 = (get('sort') as any) || 'name'
    const dir0 = (get('dir') as any) || 'asc'
    if (q0) setQ(q0)
    setSort(sort0)
    setDir(dir0)
    try {
      const stored = localStorage.getItem('CONTACTS_COLS')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) setCols(ensureSurveyCol(parsed))
      }
    } catch {}
    try {
      const views = localStorage.getItem('CONTACTS_SAVED_VIEWS')
      if (views) {
        const parsed = JSON.parse(views)
        if (Array.isArray(parsed)) setSavedViews(parsed)
      }
    } catch {}
    ;(async () => {
      try {
        const res = await http.get('/api/views', { params: { viewKey: 'contacts' } })
        const items = (res.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config }))
        if (Array.isArray(items)) setSavedViews(items)
        if (items.length === 0) {
          const seeds = [
            { name: 'Primary contacts', config: { q: '', sort: 'name', dir: 'asc' } },
            { name: 'Recently added', config: { q: '', sort: 'name', dir: 'desc' } },
          ]
          for (const s of seeds) { try { await http.post('/api/views', { viewKey: 'contacts', name: s.name, config: s.config }) } catch {} }
          try { const res2 = await http.get('/api/views', { params: { viewKey: 'contacts' } }); const items2 = (res2.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config })); if (Array.isArray(items2)) setSavedViews(items2) } catch {}
        }
      } catch {}
    })()
  }, [searchParams])

  // Persist to URL/localStorage
  React.useEffect(() => {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (sort !== 'name') params.sort = sort
    if (dir !== 'asc') params.dir = dir
    const colKeys = cols.filter((c) => c.visible).map((c) => c.key).join(',')
    if (colKeys) params.cols = colKeys
    setSearchParams(params, { replace: true })
    try { localStorage.setItem('CONTACTS_COLS', JSON.stringify(cols)) } catch {}
    try { localStorage.setItem('CONTACTS_SAVED_VIEWS', JSON.stringify(savedViews)) } catch {}
  }, [q, sort, dir, cols, savedViews, setSearchParams])

  async function saveCurrentView() {
    const viewConfig = { q, sort, dir, cols }
    const name = savingViewName || `View ${savedViews.length + 1}`
    try {
      const res = await http.post('/api/views', { viewKey: 'contacts', name, config: viewConfig })
      const doc = res.data?.data
      const newItem = doc && doc._id ? { id: String(doc._id), name: doc.name, config: doc.config } : { id: Date.now().toString(), name, config: viewConfig }
      setSavedViews((prev) => [...prev, newItem])
    } catch {
      setSavedViews((prev) => [...prev, { id: Date.now().toString(), name, config: viewConfig }])
    }
    setShowSaveViewDialog(false)
    setSavingViewName('')
  }
  function loadView(view: { id: string; name: string; config: any }) {
    const c = view.config
    if (c.q !== undefined) setQ(c.q)
    if (c.sort) setSort(c.sort)
    if (c.dir) setDir(c.dir)
    if (c.cols) setCols(c.cols)
    setPage(0)
  }
  async function deleteView(id: string) { try { await http.delete(`/api/views/${id}`) } catch {}; setSavedViews((prev) => prev.filter((v) => v.id !== id)) }
  function copyShareLink() {
    const url = window.location.origin + window.location.pathname + '?' + searchParams.toString()
    navigator.clipboard?.writeText(url).then(() => toast.showToast('Link copied', 'success')).catch(() => toast.showToast('Failed to copy', 'error'))
  }
  function getColValue(c: Contact, key: string) {
    if (key === 'name') return c.name ?? '-'
    if (key === 'email') return c.email ?? '-'
    if (key === 'company') return c.company ?? '-'
    if (key === 'mobilePhone') return c.mobilePhone ?? '-'
    if (key === 'officePhone') return c.officePhone ?? '-'
    if (key === 'isPrimary') return c.isPrimary ? 'Yes' : 'No'
    if (key === 'primaryPhone') return c.primaryPhone ?? '-'
    if (key === 'surveyStatus') {
      const status = contactSurveyStatusMap.get(c._id)
      if (!status || status.responseCount === 0) {
        return (
          <span className="inline-flex rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]">
            No surveys
          </span>
        )
      }
      return (
        <div className="flex flex-col gap-0.5 text-[11px]">
          <span className="inline-flex rounded-full border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
            {status.responseCount} response{status.responseCount === 1 ? '' : 's'}
          </span>
          <span className="text-[10px] text-[color:var(--color-text-muted)]">
            Last score:{' '}
            <span className="font-semibold text-[color:var(--color-text)]">
              {status.lastScore != null ? status.lastScore.toFixed(1) : '-'}
            </span>
          </span>
        </div>
      )
    }
    return ''
  }
  function handleDragStart(key: string) { setDraggedCol(key) }
  function handleDragOver(e: React.DragEvent) { e.preventDefault() }
  function handleDrop(targetKey: string) {
    if (!draggedCol || draggedCol === targetKey) return
    const draggedIndex = cols.findIndex((c) => c.key === draggedCol)
    const targetIndex = cols.findIndex((c) => c.key === targetKey)
    if (draggedIndex === -1 || targetIndex === -1) return
    const newCols = [...cols]
    const [removed] = newCols.splice(draggedIndex, 1)
    newCols.splice(targetIndex, 0, removed)
    setCols(newCols)
    setDraggedCol(null)
  }

  React.useEffect(() => {
    if (!showColsMenu) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-cols-menu]')) setShowColsMenu(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showColsMenu])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Contacts</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.mutate({ name: String(fd.get('name')||''), email: String(fd.get('email')||'' )|| undefined, company: String(fd.get('company')||'')|| undefined, mobilePhone: String(fd.get('mobilePhone')||'')|| undefined, officePhone: String(fd.get('officePhone')||'')|| undefined, isPrimary: fd.get('isPrimary') === 'on', primaryPhone: (fd.get('primaryPhone') as 'mobile'|'office'|null) || undefined }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="email" placeholder="Email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="company" placeholder="Company" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="mobilePhone" placeholder="Mobile phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="officePhone" placeholder="Office phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" /> Primary contact</label>
            <label className="flex items-center gap-2 text-sm">
              Primary phone:
              <select
                name="primaryPhone"
                className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
              >
                <option value="">Select</option>
                <option value="mobile">Mobile</option>
                <option value="office">Office</option>
              </select>
            </label>
          </div>
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add contact</button>
        </form>
        <div className="flex items-center justify-between px-4 gap-2">
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); refetch() }} placeholder="Search contacts..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
            <button type="button" onClick={() => { setQ(''); setSort('name'); setDir('asc'); setPage(0) }} disabled={!q && sort === 'name' && dir === 'asc'}
              className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Reset</button>
            <div className="relative">
              <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowSaveViewDialog(true)}>Save view</button>
            </div>
            <div className="relative">
              <select className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)]" onChange={(e) => {
                const selected = savedViews.find((v) => v.id === e.target.value)
                if (selected) loadView(selected)
                e.target.value = ''
              }}>
                <option value="">Saved views</option>
                {savedViews.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={copyShareLink}>Share link</button>
            <div className="relative" data-cols-menu>
              <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowColsMenu((v) => !v)}>Columns</button>
              {showColsMenu && (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2 shadow space-y-1">
                  <div className="text-xs text-[color:var(--color-text-muted)] pb-1 border-b">Drag to reorder</div>
                  {cols.map((col) => (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={() => handleDragStart(col.key)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(col.key)}
                      className={`flex items-center gap-2 p-1 text-sm cursor-move rounded ${draggedCol === col.key ? 'opacity-50 bg-[color:var(--color-muted)]' : 'hover:bg-[color:var(--color-muted)]'}`}
                    >
                      <span className="text-xs text-[color:var(--color-text-muted)]">≡</span>
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={(e) => setCols(cols.map((c) => c.key === col.key ? { ...c, visible: e.target.checked } : c))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>{col.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
            >
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="company">Company</option>
            </select>
            <select
              value={dir}
              onChange={(e) => setDir(e.target.value as any)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
            <button
              className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              onClick={() => {
                const visibleCols = cols.filter((c) => c.visible)
                const headers = visibleCols.map((c) => c.label)
                const rows = visibleItems.map((c) => visibleCols.map((col) => getColValue(c, col.key)))
                const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'contacts.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >Export CSV</button>
          </div>
          {!anySelected && (
            <span className="ml-auto text-[11px] text-[color:var(--color-text-muted)]">Tip: select rows to bulk enroll in a sequence</span>
          )}
          {anySelected && (
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm">
              <span className="text-[color:var(--color-text-muted)]">{selectedIds.size} selected</span>
              <label className="flex items-center gap-1">Enroll in
                <select ref={seqSelectRef} className="ml-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)] font-semibold">
                  {(seqs.data?.data.items ?? []).map((s) => (<option key={s._id} value={s._id}>{s.name ?? 'Sequence'}</option>))}
                </select>
              </label>
              <button type="button" className="rounded-lg border px-2 py-1" onClick={async () => {
                const sequenceId = seqSelectRef.current?.value || ''
                if (!sequenceId) return
                const ids = Array.from(selectedIds)
                await Promise.allSettled(ids.map((id) => http.post('/api/crm/outreach/enroll', { contactId: id, sequenceId })))
                toast.showToast('Enrollments queued', 'success')
                setSelectedIds(new Set())
              }}>Apply</button>
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={allSelected} onChange={(e) => { const next = new Set(selectedIds); if (e.target.checked) visibleItems.forEach((c)=> next.add(c._id)); else visibleItems.forEach((c)=> next.delete(c._id)); setSelectedIds(next) }} />
                  <span>Select</span>
                </div>
              </th>
              {cols.filter((c) => c.visible).map((col) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={() => handleDragStart(col.key)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(col.key)}
                  className={`px-4 py-2 cursor-move ${draggedCol === col.key ? 'opacity-50' : ''}`}
                  title="Drag to reorder"
                >{col.label}</th>
              ))}
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((c) => (
              <tr key={c._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(c._id)} onChange={(e) => { const next = new Set(selectedIds); if (e.target.checked) next.add(c._id); else next.delete(c._id); setSelectedIds(next) }} />
                </td>
                {cols.filter((c) => c.visible).map((col) => (
                  <td key={col.key} className="px-4 py-2">
                    {inlineEditId === c._id ? (
                      col.key === 'name' ? (
                        <input value={inlineName} onChange={(e) => setInlineName(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : col.key === 'email' ? (
                        <input type="email" value={inlineEmail} onChange={(e) => setInlineEmail(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : col.key === 'company' ? (
                        <input value={inlineCompany} onChange={(e) => setInlineCompany(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : col.key === 'mobilePhone' ? (
                        <input value={inlineMobilePhone} onChange={(e) => setInlineMobilePhone(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : col.key === 'officePhone' ? (
                        <input value={inlineOfficePhone} onChange={(e) => setInlineOfficePhone(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : (
                        getColValue(c, col.key)
                      )
                    ) : (
                      getColValue(c, col.key)
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {inlineEditId === c._id ? (
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={saveInlineEdit}>Save</button>
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={cancelInlineEdit}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => startInlineEdit(c)}>Edit</button>
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => setEditing(c)}>Open</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-4 text-sm">
          <div>
            {typeof total === 'number' ? `Total: ${total}` : ''}
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => { setPage((p) => Math.max(0, p - 1)); refetch() }} disabled={isFetching || page <= 0}>
              Prev
            </button>
            <span>Page {page + 1}{totalPages ? ` / ${totalPages}` : ''}</span>
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => { setPage((p) => p + 1); refetch() }} disabled={isFetching || (totalPages ? page + 1 >= totalPages : false)}>
              Next
            </button>
          </div>
        </div>
      </div>
      {editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
            <div className="mb-3 text-base font-semibold">Edit contact</div>
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                update.mutate({
                  _id: editing._id,
                  name: String(fd.get('name') || '') || undefined,
                  email: String(fd.get('email') || '') || undefined,
                  company: String(fd.get('company') || '') || undefined,
                  mobilePhone: String(fd.get('mobilePhone') || '') || undefined,
                  officePhone: String(fd.get('officePhone') || '') || undefined,
                  isPrimary: fd.get('isPrimary') === 'on',
                  primaryPhone: (fd.get('primaryPhone') as 'mobile' | 'office' | null) || undefined,
                })
                setEditing(null)
              }}
            >
              <input name="name" defaultValue={editing.name ?? ''} placeholder="Name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="email" defaultValue={editing.email ?? ''} placeholder="Email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="company" defaultValue={editing.company ?? ''} placeholder="Company" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="mobilePhone" defaultValue={editing.mobilePhone ?? ''} placeholder="Mobile phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="officePhone" defaultValue={editing.officePhone ?? ''} placeholder="Office phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPrimary" defaultChecked={Boolean(editing.isPrimary)} /> Primary contact
              </label>
              <label className="flex items-center gap-2 text-sm">
                Primary phone:
                <select
                  name="primaryPhone"
                  defaultValue={editing.primaryPhone ?? ''}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
                >
                  <option value="">Select</option>
                  <option value="mobile">Mobile</option>
                  <option value="office">Office</option>
                </select>
              </label>

              <div className="col-span-full mt-4 rounded-xl border border-[color:var(--color-border)] p-3">
                <div className="mb-2 text-sm font-semibold">Outreach actions</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs">Enroll in sequence</label>
                    <select ref={seqSelectRef} className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                      {(seqs.data?.data.items ?? []).map((s) => (<option key={s._id} value={s._id}>{s.name ?? 'Sequence'}</option>))}
                    </select>
                    <button type="button" className="mt-2 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => { const sequenceId = seqSelectRef.current?.value || ''; if (sequenceId) { http.post('/api/crm/outreach/enroll', { contactId: editing._id, sequenceId }).then(() => toast.showToast('Enrolled', 'success')) } }}>
                      Enroll
                    </button>
                  </div>
                  <div>
                    <label className="text-xs">Send one‑off email</label>
                    <input ref={oneOffSubjectRef} placeholder="Subject" className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-sm" />
                    <textarea ref={oneOffTextRef} placeholder="Body" rows={3} className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-sm" />
                    <input 
                      ref={oneOffAttachmentRef}
                      type="file"
                      className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs file:mr-4 file:rounded file:border-0 file:bg-[color:var(--color-primary-600)] file:px-3 file:py-1 file:text-xs file:text-white file:hover:bg-[color:var(--color-primary-700)]"
                    />
                    <button type="button" className="mt-2 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={async () => { 
                      const to = editing.email || ''
                      const subject = oneOffSubjectRef.current?.value || ''
                      const text = oneOffTextRef.current?.value || ''
                      const file = oneOffAttachmentRef.current?.files?.[0]
                      
                      if (!to) {
                        toast.showToast('Contact email is required', 'warning')
                        return
                      }
                      if (!subject) {
                        toast.showToast('Email subject is required', 'warning')
                        return
                      }
                      if (!text) {
                        toast.showToast('Email body is required', 'warning')
                        return
                      }
                      
                      try {
                        const formData = new FormData()
                        formData.append('to', to)
                        formData.append('subject', subject)
                        formData.append('text', text)
                        if (file) {
                          formData.append('attachment', file)
                        }
                        
                        const res = await http.post('/api/crm/outreach/send/email', formData, {
                          headers: {
                            'Content-Type': 'multipart/form-data',
                          },
                        })
                        const data = res.data?.data
                        if (data?.queued) {
                          const provider = data.provider || 'email service'
                          const warning = data.warning ? ` (${data.warning})` : ''
                          toast.showToast(`Email sent successfully via ${provider}!${warning}`, 'success')
                          if (oneOffSubjectRef.current) oneOffSubjectRef.current.value = ''
                          if (oneOffTextRef.current) oneOffTextRef.current.value = ''
                          if (oneOffAttachmentRef.current) oneOffAttachmentRef.current.value = ''
                        } else {
                          toast.showToast('Email may not have been sent. Please check the server logs.', 'warning')
                        }
                      } catch (err: any) {
                        const errorMsg = err?.response?.data?.error || err?.message || 'Failed to send email'
                        const details = err?.response?.data?.details
                        const detailsMsg = details ? ` (${JSON.stringify(details)})` : ''
                        toast.showToast(`Error: ${errorMsg}${detailsMsg}`, 'error')
                        console.error('Email send error:', err)
                      }
                    }}>
                      Send
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs">
                  <div className="mb-1 font-semibold">Current enrollments</div>
                  <ul className="list-disc pl-5">
                    {(enrollmentsQ.data?.data.items ?? []).map((en) => {
                      const label = seqNameById.get(en.sequenceId) ?? en.sequenceId
                      return (
                        <li key={en._id} className="flex items-center gap-2">Seq: {label} • Started: {formatDate(en.startedAt)} • Step: {(en.lastStepIndex ?? -1) + 1} {en.completedAt ? '• Completed' : ''}
                          {!en.completedAt && (
                            <button type="button" className="ml-2 rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] hover:bg-[color:var(--color-muted)]" onClick={() => { http.post(`/api/crm/outreach/enroll/${en._id}/unenroll`).then(() => enrollmentsQ.refetch()) }}>Unenroll</button>
                          )}
                        </li>
                      )
                    })}
                    {((enrollmentsQ.data?.data.items ?? []).length === 0) && <li>None</li>}
                  </ul>
                  {(enrollmentsQ.data?.data.items ?? []).some((en) => !en.completedAt) && (
                    <button type="button" className="mt-2 rounded border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => { http.post('/api/crm/outreach/enroll/bulk/unenroll', { contactId: editing._id }).then(() => enrollmentsQ.refetch()) }}>Unenroll all</button>
                  )}
                </div>
              </div>

              {surveyPrograms.length > 0 && (
                <div className="col-span-full mt-4 rounded-xl border border-[color:var(--color-border)] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Surveys &amp; Feedback</div>
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      Send a CSAT/NPS survey directly to this contact.
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                      <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                        Survey program
                      </label>
                      <select
                        value={surveyProgramId}
                        onChange={(e) => setSurveyProgramId(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                      >
                        <option value="">Select a program…</option>
                        {surveyPrograms.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} ({p.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                        Customer name (for email)
                      </label>
                      <input
                        type="text"
                        value={surveyRecipientName}
                        onChange={(e) => setSurveyRecipientName(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                        placeholder="Customer name"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                        Customer email (for survey link)
                      </label>
                      <input
                        type="email"
                        value={surveyRecipientEmail}
                        onChange={(e) => setSurveyRecipientEmail(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                        placeholder="name@example.com"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-60"
                      disabled={
                        !editing ||
                        !surveyProgramId ||
                        !surveyRecipientEmail ||
                        sendSurveyEmail.isPending
                      }
                      onClick={() => {
                        if (!editing || !surveyProgramId || !surveyRecipientEmail) return
                        sendSurveyEmail.mutate({
                          programId: surveyProgramId,
                          recipientName: surveyRecipientName || undefined,
                          recipientEmail: surveyRecipientEmail,
                          contactId: editing._id,
                        })
                      }}
                    >
                      {sendSurveyEmail.isPending ? 'Sending…' : 'Send survey email to contact'}
                    </button>
                  </div>
                </div>
              )}

              <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                <button type="button" className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]" onClick={() => { if (editing?._id) remove.mutate(editing._id); setEditing(null) }}>Delete</button>
                <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide history' : 'View history'}</button>
                <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
              </div>
              {showHistory && (
                <div className="col-span-full mt-3 rounded-xl border border-[color:var(--color-border)] p-3 text-xs">
                  <div className="mb-1 font-semibold">History</div>
                  {historyQ.isLoading && <div>Loading…</div>}
                  {historyQ.data && (
                    <div className="space-y-2">
                      <div>Created: {formatDateTime(historyQ.data.data.createdAt)}</div>
                      <div>
                        <div className="font-semibold">Enrollments</div>
                        <ul className="list-disc pl-5">
                          {historyQ.data.data.enrollments.map((e, idx) => (
                            <li key={idx}>{e.sequenceName} (enrolled: {formatDateTime(e.startedAt)}{e.completedAt ? `; completed: ${formatDateTime(e.completedAt)}` : ''})</li>
                          ))}
                          {historyQ.data.data.enrollments.length === 0 && <li>None</li>}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold">Outreach events</div>
                        <ul className="list-disc pl-5">
                          {historyQ.data.data.events.map((ev, idx) => (
                            <li key={idx}>{formatDateTime(ev.at)} — {ev.channel} {ev.event}{ev.recipient ? ` (${ev.recipient})` : ''}</li>
                          ))}
                          {historyQ.data.data.events.length === 0 && <li>None</li>}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="col-span-full mt-4 pt-4 border-t">
                <DocumentsList
                  relatedToType="contact"
                  relatedToId={editing._id}
                  relatedToName={editing.name || editing.email}
                  compact={true}
                />
              </div>
            </form>
            </div>
          </div>
        </div>,
        portalEl
      )}
      {showSaveViewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowSaveViewDialog(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-base font-semibold">Save view</div>
            <input
              value={savingViewName}
              onChange={(e) => setSavingViewName(e.target.value)}
              placeholder="View name"
              className="mb-3 w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { saveCurrentView() } else if (e.key === 'Escape') setShowSaveViewDialog(false) }}
            />
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => { setShowSaveViewDialog(false); setSavingViewName('') }}>Cancel</button>
              <button type="button" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={saveCurrentView}>Save</button>
            </div>
            {savedViews.length > 0 && (
              <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
                <div className="mb-2 text-xs text-[color:var(--color-text-muted)]">Saved views</div>
                <div className="space-y-1">
                  {savedViews.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] p-2 text-sm">
                      <button type="button" className="flex-1 text-left hover:underline" onClick={() => { loadView(v); setShowSaveViewDialog(false) }}>{v.name}</button>
                      <button type="button" className="ml-2 rounded-lg border border-red-400 text-red-400 px-2 py-1 text-xs hover:bg-red-50" onClick={() => { if (confirm(`Delete "${v.name}"?`)) deleteView(v.id) }}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}



import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Segment = { _id: string; name: string; description?: string }
type Campaign = { _id: string; name: string; subject?: string; status?: string; segmentId?: string | null; mjml?: string; previewText?: string }
type Template = { key: string; name: string; mjml: string }

export default function Marketing() {
  const [tab, setTab] = React.useState<'campaigns'|'segments'|'analytics'>('campaigns')
  return (
    <div className="space-y-6">
      <CRMNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Marketing</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('campaigns')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='campaigns'?'bg-[color:var(--color-muted)]':''}`}>Campaigns</button>
          <button onClick={() => setTab('segments')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='segments'?'bg-[color:var(--color-muted)]':''}`}>Segments</button>
          <button onClick={() => setTab('analytics')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='analytics'?'bg-[color:var(--color-muted)]':''}`}>Analytics</button>
        </div>
      </div>
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'segments' && <SegmentsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </div>
  )
}

function LinkBuilder({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [url, setUrl] = React.useState('')
  const [utmSource, setUtmSource] = React.useState('email')
  const [utmMedium, setUtmMedium] = React.useState('email')
  const [result, setResult] = React.useState<string>('')
  const [isBuilding, setIsBuilding] = React.useState(false)
  async function build() {
    if (!/^https?:\/\//i.test(url)) { alert('Enter a valid http(s) URL'); return }
    setIsBuilding(true)
    try {
      const utmCampaign = campaignName?.toLowerCase().replace(/\s+/g, '-') || ''
      const res = await http.post('/api/marketing/links', { campaignId, url, utmSource, utmMedium, utmCampaign })
      const token = res.data?.data?.token
      const apiBase = (import.meta as any)?.env?.VITE_API_URL || window.location.origin
      setResult(String(apiBase).replace(/\/$/,'') + `/api/marketing/r/${token}`)
    } catch (e) {
      alert('Failed to generate link')
    } finally {
      setIsBuilding(false)
    }
  }
  async function copyToClipboard(text: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      alert('Copied')
    } catch {
      alert('Copy failed. Select and copy manually.')
    }
  }
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Target URL (https://...)" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="utm_source" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="utm_medium" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={build} disabled={isBuilding}>{isBuilding ? 'Generating…' : 'Generate link'}</button>
        {result && (
          <>
            <input readOnly value={result} className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent" />
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => { void copyToClipboard(result) }}>Copy</button>
          </>
        )}
      </div>
    </div>
  )
}

function SegmentsTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['mkt-segments'], queryFn: async () => (await http.get('/api/marketing/segments')).data })
  const create = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => http.post('/api/marketing/segments', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mkt-segments'] }),
  })
  const save = useMutation({
    mutationFn: async (payload: { id: string; name?: string; description?: string; rules?: any[]; emails?: string[] }) =>
      http.put(`/api/marketing/segments/${payload.id}`, {
        name: payload.name,
        description: payload.description,
        rules: payload.rules,
        emails: payload.emails || [],
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mkt-segments'] }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => http.delete(`/api/marketing/segments/${id}`),
    onSuccess: async () => { setEditing(null); await qc.invalidateQueries({ queryKey: ['mkt-segments'] }) },
  })
  const [editing, setEditing] = React.useState<any | null>(null)
  const [rules, setRules] = React.useState<Array<{ field: string; operator: string; value: string }>>([])
  const [preview, setPreview] = React.useState<{ total: number; contacts: any[]; directEmails?: string[] } | null>(null)
  const [emailsText, setEmailsText] = React.useState<string>('')
  const [segName, setSegName] = React.useState<string>('')
  const [segDesc, setSegDesc] = React.useState<string>('')
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renamingName, setRenamingName] = React.useState<string>('')
  function addRule() { setRules((r) => [...r, { field: 'email', operator: 'contains', value: '' }]) }
  function removeRule(idx: number) { setRules((r) => r.filter((_, i) => i !== idx)) }
  async function previewSegment() {
    if (!editing) return
    const res = await http.get(`/api/marketing/segments/${editing._id}/preview`)
    setPreview(res.data?.data ?? { total: 0, contacts: [], directEmails: [] })
  }
  React.useEffect(() => {
    if (editing) {
      setSegName(String(editing.name || ''))
      setSegDesc(String(editing.description || ''))
    } else {
      setSegName('')
      setSegDesc('')
    }
  }, [editing])
  return (
    <div className="space-y-4">
      <form className="rounded-2xl border p-4 grid gap-2 sm:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault(); const fd = new FormData(e.currentTarget as HTMLFormElement)
        await create.mutateAsync({ name: String(fd.get('name')||''), description: String(fd.get('description')||'') })
        ;(e.currentTarget as HTMLFormElement).reset()
      }}>
        <input name="name" placeholder="Segment name" required className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <input name="description" placeholder="Description (optional)" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <button className="rounded-lg border px-3 py-2 text-sm">Add segment</button>
      </form>
      <div className="rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b"><th className="p-2 text-left">Name</th><th className="p-2 text-left">Description</th></tr>
          </thead>
          <tbody>
            {(data?.data?.items ?? []).map((s: any) => (
              <tr key={s._id} className="border-b hover:bg-[color:var(--color-muted)]">
                <td className="p-2">
                  {renamingId === String(s._id) ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={renamingName}
                        onChange={(e) => setRenamingName(e.target.value)}
                        className="rounded-lg border px-2 py-1 text-sm bg-transparent"
                      />
                      <button
                        className="rounded-lg border px-2 py-1 text-xs"
                        onClick={async (e) => {
                          e.stopPropagation()
                          await save.mutateAsync({ id: String(s._id), name: renamingName || undefined })
                          setRenamingId(null)
                          setRenamingName('')
                        }}
                      >Save</button>
                      <button
                        className="rounded-lg border px-2 py-1 text-xs"
                        onClick={(e) => { e.stopPropagation(); setRenamingId(null); setRenamingName('') }}
                      >Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        className="text-left truncate"
                        onClick={() => { setEditing(s); setRules(Array.isArray(s.rules) ? s.rules : []); setEmailsText(Array.isArray(s.emails) ? s.emails.join('\n') : ''); setPreview(null) }}
                      >{s.name}</button>
                      <button
                        className="rounded-lg border px-2 py-1 text-xs"
                        onClick={(e) => { e.stopPropagation(); setRenamingId(String(s._id)); setRenamingName(String(s.name || '')) }}
                      >Rename</button>
                      <button
                        className="rounded-lg border border-red-400 text-red-400 px-2 py-1 text-xs"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm('Delete this segment? This cannot be undone.')) return
                          await remove.mutateAsync(String(s._id))
                        }}
                      >Delete</button>
                    </div>
                  )}
                </td>
                <td className="p-2 cursor-pointer" onClick={() => { setEditing(s); setRules(Array.isArray(s.rules) ? s.rules : []); setEmailsText(Array.isArray(s.emails) ? s.emails.join('\n') : ''); setPreview(null) }}>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Segment — {editing.name}</div>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-red-400 text-red-400 px-2 py-1 text-sm" onClick={async () => { if (!editing) return; if (!confirm('Delete this segment? This cannot be undone.')) return; await remove.mutateAsync(editing._id) }}>Delete</button>
              <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => { setEditing(null); setRules([]); setPreview(null); setEmailsText('') }}>Close</button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="Segment name" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
            <input value={segDesc} onChange={(e) => setSegDesc(e.target.value)} placeholder="Description (optional)" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={async () => { if (!editing) return; await save.mutateAsync({ id: editing._id, name: segName || undefined, description: segDesc || undefined }); alert('Details saved') }}>Save details</button>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-[color:var(--color-text-muted)]">Rules (AND)</div>
            {rules.map((r, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-4">
                <select value={r.field} onChange={(e) => setRules((cur) => cur.map((x, i) => i===idx?{...x, field:e.target.value}:x))} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:bg-[color:var(--color-panel)] focus:text-[color:var(--color-text)]">
                  <option value="email">Contact email</option>
                  <option value="name">Contact name</option>
                  <option value="company">Contact company</option>
                </select>
                <select value={r.operator} onChange={(e) => setRules((cur) => cur.map((x, i) => i===idx?{...x, operator:e.target.value}:x))} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:bg-[color:var(--color-panel)] focus:text-[color:var(--color-text)]">
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="startsWith">starts with</option>
                </select>
                <input value={r.value} onChange={(e) => setRules((cur) => cur.map((x, i) => i===idx?{...x, value:e.target.value}:x))} placeholder="Value" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
                <div>
                  <button type="button" className="rounded-lg border px-2 py-2 text-sm" onClick={() => removeRule(idx)}>Remove</button>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={addRule}>Add rule</button>
              <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={async () => { if (!editing) return; const emails = emailsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean); await save.mutateAsync({ id: editing._id, rules, emails }); alert('Saved segment') }}>Save segment</button>
              <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={previewSegment}>Preview matches</button>
              {preview && <span className="text-xs text-[color:var(--color-text-muted)]">Matches: {preview.total}</span>}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[color:var(--color-text-muted)]">Additional recipients (one email per line)</div>
              <textarea value={emailsText} onChange={(e) => setEmailsText(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent h-28" placeholder="user1@example.com\nuser2@example.com" />
            </div>
            {preview && (
              <div className="rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b"><th className="p-2 text-left">Name</th><th className="p-2 text-left">Email</th></tr></thead>
                  <tbody>
                    {preview.contacts.map((c: any) => (<tr key={String(c._id)} className="border-b"><td className="p-2">{c.name}</td><td className="p-2">{c.email}</td></tr>))}
                    {(preview.directEmails || []).map((em: string, i: number) => (<tr key={`direct-${i}`} className="border-b"><td className="p-2 text-[color:var(--color-text-muted)]">(direct)</td><td className="p-2">{em}</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CampaignsTab() {
  const qc = useQueryClient()
  const { data: segments } = useQuery({ queryKey: ['mkt-segments'], queryFn: async () => (await http.get('/api/marketing/segments')).data })
  const { data } = useQuery({ queryKey: ['mkt-campaigns'], queryFn: async () => (await http.get('/api/marketing/campaigns')).data })
  const { data: tplData } = useQuery({ queryKey: ['mkt-templates'], queryFn: async () => (await http.get('/api/marketing/templates')).data })
  const create = useMutation({
    mutationFn: async (payload: { name: string; subject?: string; html?: string; mjml?: string; previewText?: string; segmentId?: string }) => http.post('/api/marketing/campaigns', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mkt-campaigns'] }),
  })
  const save = useMutation({
    mutationFn: async (payload: { id: string; subject?: string; previewText?: string; mjml?: string; html?: string; segmentId?: string }) => http.put(`/api/marketing/campaigns/${payload.id}`, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mkt-campaigns'] })
    },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => http.delete(`/api/marketing/campaigns/${id}`),
    onSuccess: async (_d, _v, _c) => {
      setEditing(null)
      await qc.invalidateQueries({ queryKey: ['mkt-campaigns'] })
    },
  })
  const rename = useMutation({
    mutationFn: async (payload: { id: string; name: string }) => http.put(`/api/marketing/campaigns/${payload.id}`, { name: payload.name }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mkt-campaigns'] })
    },
  })
  const [editing, setEditing] = React.useState<Campaign | null>(null)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renamingName, setRenamingName] = React.useState<string>('')
  const [mjml, setMjml] = React.useState<string>('')
  const [previewHtml, setPreviewHtml] = React.useState<string>('')
  const [subject, setSubject] = React.useState<string>('')
  const [previewText, setPreviewText] = React.useState<string>('')
  const [segmentId, setSegmentId] = React.useState<string>('')
  React.useEffect(() => {
    if (editing) {
      setSubject(editing.subject || '')
      setPreviewText(editing.previewText || '')
      setMjml(editing.mjml || '')
      setSegmentId(String(editing.segmentId || ''))
    }
  }, [editing])
  const [testTo, setTestTo] = React.useState<string>('')
  const [testing, setTesting] = React.useState<boolean>(false)
  const [sending, setSending] = React.useState<boolean>(false)
  const [sendResult, setSendResult] = React.useState<{ total: number; skipped: number; sent: number; errors: number } | null>(null)
  async function renderPreview() {
    if (!mjml.trim()) {
      alert('Please paste or insert an MJML template first.')
      return
    }
    try {
      const res = await http.post('/api/marketing/mjml/preview', { mjml })
      setPreviewHtml(String(res.data?.data?.html || ''))
    } catch (e) {
      alert('Failed to render MJML. Please check your template syntax.')
    }
  }
  async function sendTest() {
    if (!editing) return
    if (!testTo || !/.+@.+\..+/.test(testTo)) { alert('Enter a valid test email'); return }
    setTesting(true)
    try {
      await http.post(`/api/marketing/campaigns/${editing._id}/test-send`, { to: testTo, mjml, subject: subject || editing.subject || editing.name })
      alert('Test email sent (if SMTP is configured).')
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Failed to send test email.'
      alert(msg)
    } finally {
      setTesting(false)
    }
  }
  async function saveCampaign() {
    if (!editing) return
    let html: string | undefined = undefined
    if (mjml) {
      try { const r = await http.post('/api/marketing/mjml/preview', { mjml }); html = String(r.data?.data?.html || '') } catch {}
    }
    await save.mutateAsync({ id: editing._id, subject, previewText, mjml, html, segmentId: segmentId || undefined })
    alert('Saved')
  }
  async function sendCampaign(dryRun: boolean) {
    if (!editing) return
    if (!segmentId) { alert('Please select a segment and Save before sending.'); return }
    if (!mjml && !(editing as any).html) { alert('Please add MJML and Save before sending.'); return }
    if (!dryRun && !confirm('Send this campaign to the segment now?')) return
    setSending(true); setSendResult(null)
    try {
      // Compile and save latest content before sending
      let html: string | undefined = undefined
      if (mjml) {
        try { const r = await http.post('/api/marketing/mjml/preview', { mjml }); html = String(r.data?.data?.html || '') } catch {}
      }
      await save.mutateAsync({ id: editing._id, subject, previewText, mjml, html, segmentId: segmentId || undefined })
      const res = await http.post(`/api/marketing/campaigns/${editing._id}/send`, { dryRun })
      setSendResult(res.data?.data || null)
    } catch (e: any) {
      const err = e?.response?.data?.error
      const msg = err === 'missing_segment' ? 'This campaign has no segment. Select one and Save.'
        : err === 'missing_html' ? 'No HTML found. Add MJML and Save first.'
        : err || 'Send failed. Check SMTP env and try again.'
      alert(msg)
    } finally {
      setSending(false)
    }
  }

  function ensureSkeleton(content: string, block: string) {
    const hasRoot = /<mjml[\s>]/i.test(content)
    const hasBody = /<mj-body[\s>]/i.test(content)
    if (hasRoot && hasBody) return content + "\n" + block
    const skeleton = `\n<mjml>\n  <mj-body>\n${block.split('\n').map((l) => '    ' + l).join('\n')}\n  </mj-body>\n</mjml>`
    return (content || '').trim() ? content + skeleton : skeleton.trim()
  }
  function insertSnippet(kind: string) {
    const snippets: Record<string, string> = {
      hero: `<mj-section background-color="#111827">\n  <mj-column>\n    <mj-text align="center" color="#e5e7eb" font-size="24px" font-weight="700">Your headline</mj-text>\n    <mj-text align="center" color="#cbd5e1" font-size="14px">Your subhead goes here</mj-text>\n    <mj-button href="https://example.com" background-color="#22c55e">Call to action</mj-button>\n  </mj-column>\n</mj-section>`,
      text: `<mj-section background-color="#ffffff">\n  <mj-column>\n    <mj-text font-size="16px">Hello, this is a text block. Add your content here.</mj-text>\n  </mj-column>\n</mj-section>`,
      button: `<mj-section background-color="#ffffff">\n  <mj-column>\n    <mj-button href="https://example.com" background-color="#2563eb">Click me</mj-button>\n  </mj-column>\n</mj-section>`,
      twoCols: `<mj-section background-color="#ffffff">\n  <mj-column>\n    <mj-text>Left column</mj-text>\n  </mj-column>\n  <mj-column>\n    <mj-text>Right column</mj-text>\n  </mj-column>\n</mj-section>`,
      footer: `<mj-section>\n  <mj-column>\n    <mj-text font-size="12px" color="#64748b">You received this email because you subscribed. <a href="#">Unsubscribe</a></mj-text>\n  </mj-column>\n</mj-section>`,
    }
    const block = snippets[kind]
    if (!block) return
    setMjml((prev) => ensureSkeleton(prev || '', block))
  }
  return (
    <div className="space-y-4">
      <form className="rounded-2xl border p-4 grid gap-2 sm:grid-cols-4" onSubmit={async (e) => {
        e.preventDefault(); const fd = new FormData(e.currentTarget as HTMLFormElement)
        await create.mutateAsync({ name: String(fd.get('name')||''), subject: String(fd.get('subject')||''), html: String(fd.get('html')||''), segmentId: String(fd.get('segmentId')||'') || undefined })
        ;(e.currentTarget as HTMLFormElement).reset()
      }}>
        <input name="name" placeholder="Campaign name" required className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <input name="subject" placeholder="Subject" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <select name="segmentId" className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:bg-[color:var(--color-panel)] focus:text-[color:var(--color-text)]">
          <option value="">No segment</option>
          {(segments?.data?.items ?? []).map((s: Segment) => (<option key={s._id} value={s._id}>{s.name}</option>))}
        </select>
        <button className="rounded-lg border px-3 py-2 text-sm">Add campaign</button>
        <textarea name="html" placeholder="Email HTML (basic)" className="sm:col-span-4 rounded-lg border px-3 py-2 text-sm bg-transparent h-28" />
      </form>
      <div className="rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b"><th className="p-2 text-left">Name</th><th className="p-2 text-left">Subject</th><th className="p-2 text-left">Status</th></tr>
          </thead>
          <tbody>
            {(data?.data?.items ?? []).map((c: Campaign) => (
              <tr key={c._id} className="border-b hover:bg-[color:var(--color-muted)]">
                <td className="p-2">
                  {renamingId === String(c._id) ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={renamingName}
                        onChange={(e) => setRenamingName(e.target.value)}
                        className="rounded-lg border px-2 py-1 text-sm bg-transparent"
                      />
                      <button
                        className="rounded-lg border px-2 py-1 text-xs"
                        onClick={async (e) => {
                          e.stopPropagation()
                          await rename.mutateAsync({ id: String(c._id), name: renamingName })
                          setRenamingId(null)
                          setRenamingName('')
                        }}
                      >Save</button>
                      <button
                        className="rounded-lg border px-2 py-1 text-xs"
                        onClick={(e) => { e.stopPropagation(); setRenamingId(null); setRenamingName('') }}
                      >Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button className="text-left truncate" onClick={() => { setEditing(c) }}>{c.name}</button>
                      <button
                        className="rounded-lg border px-2 py-1 text-xs"
                        onClick={(e) => { e.stopPropagation(); setRenamingId(String(c._id)); setRenamingName(String(c.name || '')) }}
                      >Rename</button>
                    </div>
                  )}
                </td>
                <td className="p-2 cursor-pointer" onClick={() => { setEditing(c) }}>{c.subject}</td>
                <td className="p-2 cursor-pointer" onClick={() => { setEditing(c) }}>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Builder — {editing.name}</div>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => { setEditing(null); setPreviewHtml(''); setMjml('') }}>Close</button>
              <button className="rounded-lg border border-red-400 text-red-400 px-2 py-1 text-sm" onClick={async () => {
                if (!editing) return
                if (!confirm('Delete this campaign? This cannot be undone.')) return
                await remove.mutateAsync(editing._id)
              }}>Delete</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
                <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Preview text (inbox snippet)" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
                <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:bg-[color:var(--color-panel)] focus:text-[color:var(--color-text)]">
                  <option value="">Select segment…</option>
                  {((segments?.data?.items ?? []) as any[]).map((s) => (<option key={s._id} value={s._id}>{s.name}</option>))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select onChange={(e) => {
                  const key = e.target.value
                  const t = (tplData?.data?.items as Template[] | undefined)?.find((x) => x.key === key)
                  if (t) setMjml(t.mjml)
                }} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:bg-[color:var(--color-panel)] focus:text-[color:var(--color-text)]">
                  <option value="">Insert template…</option>
                  {(tplData?.data?.items ?? []).map((t: Template) => (<option key={t.key} value={t.key}>{t.name}</option>))}
                </select>
                <select onChange={(e) => { insertSnippet(e.target.value); e.currentTarget.selectedIndex = 0 }} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:bg-[color:var(--color-panel)] focus:text-[color:var(--color-text)]">
                  <option value="">Insert block…</option>
                  <option value="hero">Hero</option>
                  <option value="text">Text</option>
                  <option value="button">Button</option>
                  <option value="twoCols">Two columns</option>
                  <option value="footer">Footer</option>
                </select>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={saveCampaign}>Save</button>
              </div>
              <div className="text-xs text-[color:var(--color-text-muted)]">MJML</div>
              <textarea value={mjml} onChange={(e) => setMjml(e.target.value)} className="h-72 w-full rounded-lg border px-3 py-2 text-sm bg-transparent" placeholder="<mjml>...</mjml>" />
              <div className="text-[11px] text-[color:var(--color-text-muted)]">
                Tip: MJML uses tags like {`<mj-section>`}, {`<mj-column>`}, {`<mj-text>`}, {`<mj-image>`}, {`<mj-button>`}. Use “Insert block…” to add common pieces.
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={renderPreview}>Render preview</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setMjml(''); setPreviewHtml('') }}>Clear</button>
                <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Test email to" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={sendTest} disabled={!testTo || testing}>{testing ? 'Sending…' : 'Send test'}</button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-[color:var(--color-text-muted)]">Preview</div>
              <div className="rounded-lg border overflow-hidden min-h-72 bg-white">
                {previewHtml ? (
                  <iframe title="preview" className="w-full h-72" srcDoc={previewHtml} />
                ) : (
                  <div className="p-4 text-xs text-[color:var(--color-text-muted)]">No preview yet. Click "Render preview".</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => sendCampaign(true)} disabled={sending}>Dry run</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => sendCampaign(false)} disabled={sending}>Send</button>
                {sending && <span className="text-xs text-[color:var(--color-text-muted)]">Sending…</span>}
                {sendResult && (
                  <span className="text-xs text-[color:var(--color-text-muted)]">Total {sendResult.total}, skipped {sendResult.skipped}, sent {sendResult.sent}, errors {sendResult.errors}</span>
                )}
              </div>
              {editing && (
                <div className="space-y-2">
                  <div className="text-xs text-[color:var(--color-text-muted)]">UTM Link Builder</div>
                  <LinkBuilder campaignId={editing._id} campaignName={editing.name} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnalyticsTab() {
  const [startDate, setStartDate] = React.useState<string>('')
  const [endDate, setEndDate] = React.useState<string>('')
  const [selected, setSelected] = React.useState<string>('')
  const { data } = useQuery({ queryKey: ['mkt-metrics', startDate, endDate], queryFn: async () => (await http.get('/api/marketing/metrics', { params: { startDate: startDate || undefined, endDate: endDate || undefined } })).data, refetchInterval: 60000 })
  const { data: campaigns } = useQuery({ queryKey: ['mkt-campaigns'], queryFn: async () => (await http.get('/api/marketing/campaigns')).data })
  const [filterCampaign, setFilterCampaign] = React.useState<string>('')
  const { data: linkMetrics } = useQuery({
    queryKey: ['mkt-link-metrics', filterCampaign, startDate, endDate],
    queryFn: async () => (await http.get('/api/marketing/metrics/links', { params: { campaignId: filterCampaign || undefined, startDate: startDate || undefined, endDate: endDate || undefined } })).data,
    refetchInterval: 60000,
  })
  const { data: roiMetrics } = useQuery({
    queryKey: ['mkt-roi-metrics', filterCampaign, startDate, endDate],
    queryFn: async () => (await http.get('/api/marketing/metrics/roi', { params: { campaignId: filterCampaign || undefined, startDate: startDate || undefined, endDate: endDate || undefined } })).data,
    refetchInterval: 60000,
  })
  const rows = (data?.data?.byCampaign ?? []) as { campaignId: string; opens: number; clicks: number; visits: number }[]
  const linkRows = (linkMetrics?.data?.items ?? []) as { token: string; url: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; clicks: number; campaignId?: string }[]
  const roiRows = (roiMetrics?.data?.items ?? []) as { campaignId: string; revenue: number; dealsCount: number }[]

  // Build a combined ROI view so the table always shows campaigns with 0s
  const roiByCampaignId = React.useMemo(() => {
    const map = new Map<string, { revenue: number; dealsCount: number }>()
    for (const r of roiRows) {
      map.set(String(r.campaignId), { revenue: r.revenue, dealsCount: r.dealsCount })
    }
    return map
  }, [roiRows])
  const allCampaignItems = ((campaigns?.data?.items ?? []) as any[])
  const roiDisplayRows = React.useMemo(() => {
    const base = allCampaignItems.map((c) => ({
      campaignId: String(c._id),
      name: c.name as string,
      revenue: roiByCampaignId.get(String(c._id))?.revenue ?? 0,
      dealsCount: roiByCampaignId.get(String(c._id))?.dealsCount ?? 0,
    }))
    const filtered = filterCampaign ? base.filter((r) => r.campaignId === String(filterCampaign)) : base
    // Show campaigns with any ROI first
    return [...filtered].sort((a, b) => (b.revenue - a.revenue) || (b.dealsCount - a.dealsCount) || a.name.localeCompare(b.name))
  }, [allCampaignItems, roiByCampaignId, filterCampaign])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border px-2 py-2 text-sm bg-transparent" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border px-2 py-2 text-sm bg-transparent" />
        <button type="button" className="rounded-lg border px-2 py-2 text-sm" onClick={() => { setStartDate(''); setEndDate('') }} disabled={!startDate && !endDate}>Clear dates</button>
      </div>
      <div className="rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b"><th className="p-2 text-left">Campaign</th><th className="p-2 text-left">Opens</th><th className="p-2 text-left">Clicks</th><th className="p-2 text-left">Visits</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const list = ((campaigns?.data?.items ?? []) as any[])
              const found = list.find((c) => String(c._id) === String(r.campaignId))
              const name = found?.name || String(r.campaignId)
              return (
                <tr key={String(r.campaignId)} className="border-b"><td className="p-2">{name}</td><td className="p-2">{r.opens}</td><td className="p-2">{r.clicks}</td><td className="p-2">{r.visits}</td></tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">Per-link performance</div>
        <select value={filterCampaign} onChange={(e) => setFilterCampaign(e.target.value)} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)]">
          <option value="">All campaigns</option>
          {((campaigns?.data?.items ?? []) as any[]).map((c) => (<option key={c._id} value={c._id}>{c.name}</option>))}
        </select>
      </div>
      <div className="rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b"><th className="p-2 text-left">Short</th><th className="p-2 text-left">Target URL</th><th className="p-2 text-left">UTM</th><th className="p-2 text-left">Clicks</th></tr>
          </thead>
          <tbody>
            {linkRows.map((r) => {
              const apiBase = (import.meta as any)?.env?.VITE_API_URL || window.location.origin
              const shortUrl = String(apiBase).replace(/\/$/,'') + `/api/marketing/r/${r.token}`
              const utm = [r.utmSource && `source=${r.utmSource}`, r.utmMedium && `medium=${r.utmMedium}`, r.utmCampaign && `campaign=${r.utmCampaign}`].filter(Boolean).join(' · ')
              return (
                <tr key={r.token} className="border-b">
                  <td className="p-2"><a className="underline" href={shortUrl} target="_blank" rel="noopener noreferrer">{r.token.slice(0,8)}</a></td>
                  <td className="p-2 truncate max-w-[32rem]"><a className="underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a></td>
                  <td className="p-2 text-[color:var(--color-text-muted)]">{utm || '-'}</td>
                  <td className="p-2">{r.clicks}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">ROI Attribution</div>
        <select value={filterCampaign} onChange={(e) => setFilterCampaign(e.target.value)} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)]">
          <option value="">All campaigns</option>
          {allCampaignItems.map((c) => (<option key={c._id} value={c._id}>{c.name}</option>))}
        </select>
      </div>
      <div className="rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b"><th className="p-2 text-left">Campaign</th><th className="p-2 text-left">Revenue</th><th className="p-2 text-left">Closed Won Deals</th></tr>
          </thead>
          <tbody>
            {roiDisplayRows.map((r) => (
              <tr key={r.campaignId} className="border-b hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setSelected(r.campaignId)}>
                <td className="p-2">{r.name}</td>
                <td className="p-2 font-semibold">${r.revenue.toLocaleString()}</td>
                <td className="p-2">{r.dealsCount}</td>
              </tr>
            ))}
            {roiDisplayRows.length === 0 && (
              <tr><td className="p-2 text-[color:var(--color-text-muted)]" colSpan={3}>No campaigns found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <RoiDrilldown selectedCampaignId={(selected || filterCampaign) || undefined} startDate={startDate || undefined} endDate={endDate || undefined} campaigns={allCampaignItems} onClear={() => setSelected('')} />
    </div>
  )
}

function RoiDrilldown({ selectedCampaignId, startDate, endDate, campaigns, onClear }: { selectedCampaignId?: string; startDate?: string; endDate?: string; campaigns: any[]; onClear?: () => void }) {
  const { data } = useQuery({
    queryKey: ['roi-deals', selectedCampaignId, startDate, endDate],
    enabled: Boolean(selectedCampaignId),
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', { params: {
        stage: 'Contract Signed / Closed Won',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: 0,
        limit: 1000,
        marketingCampaignId: selectedCampaignId, // if ignored by API, filter client-side
      } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; amount?: number; closeDate?: string; marketingCampaignId?: string }> } }
    },
  })
  const items = (data?.data.items ?? []).filter((d) => !selectedCampaignId || String(d.marketingCampaignId) === String(selectedCampaignId))
  if (!selectedCampaignId) return null
  const name = campaigns.find((c) => String(c._id) === String(selectedCampaignId))?.name || 'Campaign'
  return (
    <div className="rounded-2xl border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">Closed Won deals for: {name}</div>
        <button type="button" className="rounded-lg border px-2 py-1 text-sm" onClick={onClear}>Close</button>
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b"><th className="p-2 text-left">Title</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Close date</th></tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d._id} className="border-b">
              <td className="p-2">{d.title ?? '-'}</td>
              <td className="p-2">{typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : '-'}</td>
              <td className="p-2">{d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '-'}</td>
            </tr>
          ))}
          {items.length === 0 && (<tr><td className="p-2 text-[color:var(--color-text-muted)]" colSpan={3}>No deals in range.</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}



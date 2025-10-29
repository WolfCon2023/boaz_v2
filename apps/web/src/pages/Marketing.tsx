import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'

type Segment = { _id: string; name: string; description?: string }
type Campaign = { _id: string; name: string; subject?: string; status?: string; segmentId?: string | null; mjml?: string; previewText?: string }
type Template = { key: string; name: string; mjml: string }

export default function Marketing() {
  const [tab, setTab] = React.useState<'campaigns'|'segments'|'analytics'>('campaigns')
  return (
    <div className="space-y-6">
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
  async function build() {
    if (!/^https?:\/\//i.test(url)) { alert('Enter a valid http(s) URL'); return }
    const utmCampaign = campaignName?.toLowerCase().replace(/\s+/g, '-') || ''
    const res = await http.post('/api/marketing/links', { campaignId, url, utmSource, utmMedium, utmCampaign })
    const token = res.data?.data?.token
    const apiBase = (import.meta as any)?.env?.VITE_API_URL || window.location.origin
    setResult(String(apiBase).replace(/\/$/,'') + `/api/marketing/r/${token}`)
  }
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Target URL (https://...)" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="utm_source" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
        <input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="utm_medium" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={build}>Generate link</button>
        {result && (
          <>
            <input readOnly value={result} className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent" />
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => { navigator.clipboard.writeText(result) }}>Copy</button>
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
    mutationFn: async (payload: { id: string; rules: any[] }) => http.put(`/api/marketing/segments/${payload.id}`, { rules: payload.rules }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mkt-segments'] }),
  })
  const [editing, setEditing] = React.useState<any | null>(null)
  const [rules, setRules] = React.useState<Array<{ field: string; operator: string; value: string }>>([])
  const [preview, setPreview] = React.useState<{ total: number; contacts: any[] } | null>(null)
  function addRule() { setRules((r) => [...r, { field: 'email', operator: 'contains', value: '' }]) }
  function removeRule(idx: number) { setRules((r) => r.filter((_, i) => i !== idx)) }
  async function previewSegment() {
    if (!editing) return
    const res = await http.get(`/api/marketing/segments/${editing._id}/preview`)
    setPreview(res.data?.data ?? { total: 0, contacts: [] })
  }
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
              <tr key={s._id} className="border-b hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => { setEditing(s); setRules(Array.isArray(s.rules) ? s.rules : []) }}>
                <td className="p-2">{s.name}</td><td className="p-2">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Segment — {editing.name}</div>
            <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => { setEditing(null); setRules([]); setPreview(null) }}>Close</button>
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
              <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={async () => { if (!editing) return; await save.mutateAsync({ id: editing._id, rules }); alert('Saved rules') }}>Save rules</button>
              <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={previewSegment}>Preview matches</button>
              {preview && <span className="text-xs text-[color:var(--color-text-muted)]">Matches: {preview.total}</span>}
            </div>
            {preview && (
              <div className="rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b"><th className="p-2 text-left">Name</th><th className="p-2 text-left">Email</th></tr></thead>
                  <tbody>
                    {preview.contacts.map((c: any) => (<tr key={String(c._id)} className="border-b"><td className="p-2">{c.name}</td><td className="p-2">{c.email}</td></tr>))}
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
    mutationFn: async (payload: { id: string; subject?: string; previewText?: string; mjml?: string; html?: string }) => http.put(`/api/marketing/campaigns/${payload.id}`, payload),
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
  const [editing, setEditing] = React.useState<Campaign | null>(null)
  const [mjml, setMjml] = React.useState<string>('')
  const [previewHtml, setPreviewHtml] = React.useState<string>('')
  const [subject, setSubject] = React.useState<string>('')
  const [previewText, setPreviewText] = React.useState<string>('')
  React.useEffect(() => {
    if (editing) {
      setSubject(editing.subject || '')
      setPreviewText(editing.previewText || '')
      setMjml(editing.mjml || '')
    }
  }, [editing])
  const [testTo, setTestTo] = React.useState<string>('')
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
    await http.post(`/api/marketing/campaigns/${editing._id}/test-send`, { to: testTo, mjml, subject: editing.subject || editing.name })
    alert('Test email sent (if SMTP is configured).')
  }
  async function saveCampaign() {
    if (!editing) return
    let html: string | undefined = undefined
    if (mjml) {
      try { const r = await http.post('/api/marketing/mjml/preview', { mjml }); html = String(r.data?.data?.html || '') } catch {}
    }
    await save.mutateAsync({ id: editing._id, subject, previewText, mjml, html })
    alert('Saved')
  }
  async function sendCampaign(dryRun: boolean) {
    if (!editing) return
    if (!dryRun && !confirm('Send this campaign to the segment now?')) return
    setSending(true); setSendResult(null)
    try {
      const res = await http.post(`/api/marketing/campaigns/${editing._id}/send`, { dryRun })
      setSendResult(res.data?.data || null)
    } catch (e) {
      alert('Send failed. Check SMTP env and try again.')
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
              <tr key={c._id} className="border-b hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => { setEditing(c) }}>
                <td className="p-2">{c.name}</td><td className="p-2">{c.subject}</td><td className="p-2">{c.status}</td>
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
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
                <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Preview text (inbox snippet)" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
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
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={sendTest} disabled={!testTo}>Send test</button>
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
  const { data } = useQuery({ queryKey: ['mkt-metrics'], queryFn: async () => (await http.get('/api/marketing/metrics')).data, refetchInterval: 60000 })
  const rows = (data?.data?.byCampaign ?? []) as { campaignId: string; opens: number; clicks: number; visits: number }[]
  return (
    <div className="rounded-2xl border">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b"><th className="p-2 text-left">Campaign</th><th className="p-2 text-left">Opens</th><th className="p-2 text-left">Clicks</th><th className="p-2 text-left">Visits</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.campaignId)} className="border-b"><td className="p-2">{String(r.campaignId)}</td><td className="p-2">{r.opens}</td><td className="p-2">{r.clicks}</td><td className="p-2">{r.visits}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}



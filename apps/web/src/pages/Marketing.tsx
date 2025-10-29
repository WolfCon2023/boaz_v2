import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'

type Segment = { _id: string; name: string; description?: string }
type Campaign = { _id: string; name: string; subject?: string; status?: string; segmentId?: string | null }

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

function SegmentsTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['mkt-segments'], queryFn: async () => (await http.get('/api/marketing/segments')).data })
  const create = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => http.post('/api/marketing/segments', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mkt-segments'] }),
  })
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
            {(data?.data?.items ?? []).map((s: Segment) => (
              <tr key={s._id} className="border-b"><td className="p-2">{s.name}</td><td className="p-2">{s.description}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CampaignsTab() {
  const qc = useQueryClient()
  const { data: segments } = useQuery({ queryKey: ['mkt-segments'], queryFn: async () => (await http.get('/api/marketing/segments')).data })
  const { data } = useQuery({ queryKey: ['mkt-campaigns'], queryFn: async () => (await http.get('/api/marketing/campaigns')).data })
  const create = useMutation({
    mutationFn: async (payload: { name: string; subject?: string; html?: string; segmentId?: string }) => http.post('/api/marketing/campaigns', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mkt-campaigns'] }),
  })
  const [editing, setEditing] = React.useState<Campaign | null>(null)
  const [mjml, setMjml] = React.useState<string>('')
  const [previewHtml, setPreviewHtml] = React.useState<string>('')
  const [testTo, setTestTo] = React.useState<string>('')
  async function renderPreview() {
    const res = await http.post('/api/marketing/mjml/preview', { mjml })
    setPreviewHtml(String(res.data?.data?.html || ''))
  }
  async function sendTest() {
    if (!editing) return
    await http.post(`/api/marketing/campaigns/${editing._id}/test-send`, { to: testTo, mjml, subject: editing.subject || editing.name })
    alert('Test email sent (if SMTP is configured).')
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
        <select name="segmentId" className="rounded-lg border px-3 py-2 text-sm bg-transparent">
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
            <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => { setEditing(null); setPreviewHtml(''); setMjml('') }}>Close</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs text-[color:var(--color-text-muted)]">MJML</div>
              <textarea value={mjml} onChange={(e) => setMjml(e.target.value)} className="h-72 w-full rounded-lg border px-3 py-2 text-sm bg-transparent" placeholder="<mjml>...</mjml>" />
              <div className="flex items-center gap-2">
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={renderPreview}>Render preview</button>
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



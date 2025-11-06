import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http, apiBaseURL, getApiUrl } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { Type, Image, MousePointerClick, Minus, Columns } from 'lucide-react'

type Segment = { _id: string; name: string; description?: string }
type Campaign = { _id: string; name: string; subject?: string; status?: string; segmentId?: string | null; mjml?: string; previewText?: string }
type Template = { key: string; name: string; mjml: string }

export default function Marketing() {
  const [tab, setTab] = React.useState<'campaigns'|'segments'|'analytics'|'unsubscribes'>('campaigns')
  return (
    <div className="space-y-6">
      <CRMNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Marketing</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('campaigns')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='campaigns'?'bg-[color:var(--color-muted)]':''}`}>Campaigns</button>
          <button onClick={() => setTab('segments')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='segments'?'bg-[color:var(--color-muted)]':''}`}>Segments</button>
          <button onClick={() => setTab('analytics')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='analytics'?'bg-[color:var(--color-muted)]':''}`}>Analytics</button>
          <button onClick={() => setTab('unsubscribes')} className={`rounded-lg border px-3 py-1 text-sm ${tab==='unsubscribes'?'bg-[color:var(--color-muted)]':''}`}>Do Not Contact</button>
        </div>
      </div>
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'segments' && <SegmentsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'unsubscribes' && <UnsubscribesTab />}
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

type SimpleBlock = {
  id: string
  type: 'text' | 'heading' | 'image' | 'button' | 'divider' | 'two-columns'
  content: string
  imageUrl?: string
  buttonUrl?: string
  buttonText?: string
  backgroundColor?: string
  textColor?: string
  align?: 'left' | 'center' | 'right'
}

function SimpleBuilderUI({
  blocks,
  setBlocks,
  onRender,
  onSave,
  testTo,
  setTestTo,
  onSendTest,
  testing,
}: {
  blocks: SimpleBlock[]
  setBlocks: React.Dispatch<React.SetStateAction<SimpleBlock[]>>
  onRender: () => void
  onSave: () => void
  testTo: string
  setTestTo: (v: string) => void
  onSendTest: () => void
  testing: boolean
}) {
  const [editingBlockId, setEditingBlockId] = React.useState<string | null>(null)
  const [editingBlock, setEditingBlock] = React.useState<Partial<SimpleBlock> | null>(null)
  
  function addBlock(type: SimpleBlock['type']) {
    const newBlock: SimpleBlock = {
      id: Date.now().toString(),
      type,
      content: '',
      backgroundColor: '#ffffff',
      textColor: '#000000',
      align: 'left',
    }
    if (type === 'button') {
      newBlock.buttonText = 'Click here'
      newBlock.buttonUrl = 'https://example.com'
    }
    setBlocks([...blocks, newBlock])
    setEditingBlockId(newBlock.id)
    setEditingBlock(newBlock)
  }
  
  function updateBlock(id: string, updates: Partial<SimpleBlock>) {
    setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b))
    if (editingBlockId === id) {
      setEditingBlock({ ...editingBlock, ...updates })
    }
  }
  
  function removeBlock(id: string) {
    setBlocks(blocks.filter(b => b.id !== id))
    if (editingBlockId === id) {
      setEditingBlockId(null)
      setEditingBlock(null)
    }
  }
  
  function moveBlock(id: string, direction: 'up' | 'down') {
    const index = blocks.findIndex(b => b.id === id)
    if (index === -1) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= blocks.length) return
    const newBlocks = [...blocks]
    ;[newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]]
    setBlocks(newBlocks)
  }
  
  function startEdit(id: string) {
    const block = blocks.find(b => b.id === id)
    if (block) {
      setEditingBlockId(id)
      setEditingBlock({ ...block })
    }
  }
  
  function saveEdit() {
    if (editingBlockId && editingBlock) {
      updateBlock(editingBlockId, editingBlock)
      setEditingBlockId(null)
      setEditingBlock(null)
    }
  }
  
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => addBlock('heading')} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
          <Type size={14} /> Heading
        </button>
        <button type="button" onClick={() => addBlock('text')} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
          <Type size={14} /> Text
        </button>
        <button type="button" onClick={() => addBlock('image')} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
          <Image size={14} /> Image
        </button>
        <button type="button" onClick={() => addBlock('button')} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
          <MousePointerClick size={14} /> Button
        </button>
        <button type="button" onClick={() => addBlock('divider')} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
          <Minus size={14} /> Divider
        </button>
        <button type="button" onClick={() => addBlock('two-columns')} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
          <Columns size={14} /> Two Columns
        </button>
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {blocks.length === 0 ? (
          <div className="text-center py-8 text-sm text-[color:var(--color-text-muted)]">
            No blocks yet. Add a block above to get started.
          </div>
        ) : (
          blocks.map((block, index) => (
            <div key={block.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                    {block.type === 'heading' && '📝 Heading'}
                    {block.type === 'text' && '📄 Text'}
                    {block.type === 'image' && '🖼️ Image'}
                    {block.type === 'button' && '🔘 Button'}
                    {block.type === 'divider' && '➖ Divider'}
                    {block.type === 'two-columns' && '📊 Two Columns'}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveBlock(block.id, 'up')}
                    disabled={index === 0}
                    className="p-1 disabled:opacity-50"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(block.id, 'down')}
                    disabled={index === blocks.length - 1}
                    className="p-1 disabled:opacity-50"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {editingBlockId === block.id ? (
                    <>
                      <button type="button" onClick={saveEdit} className="text-xs px-2 py-1 rounded border">Save</button>
                      <button type="button" onClick={() => { setEditingBlockId(null); setEditingBlock(null) }} className="text-xs px-2 py-1 rounded border">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(block.id)} className="text-xs px-2 py-1 rounded border">Edit</button>
                      <button type="button" onClick={() => removeBlock(block.id)} className="text-xs px-2 py-1 rounded border border-red-400 text-red-400">Remove</button>
                    </>
                  )}
                </div>
              </div>
              
              {editingBlockId === block.id && editingBlock ? (
                <div className="space-y-2 pt-2 border-t">
                  {block.type === 'heading' || block.type === 'text' || block.type === 'two-columns' ? (
                    <>
                      <textarea
                        value={editingBlock.content || ''}
                        onChange={(e) => setEditingBlock({ ...editingBlock, content: e.target.value })}
                        placeholder={block.type === 'two-columns' ? 'Left content ||| Right content' : 'Enter content...'}
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent h-24"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="color"
                          value={editingBlock.backgroundColor || '#ffffff'}
                          onChange={(e) => setEditingBlock({ ...editingBlock, backgroundColor: e.target.value })}
                          className="h-8 rounded border"
                          title="Background color"
                        />
                        <input
                          type="color"
                          value={editingBlock.textColor || '#000000'}
                          onChange={(e) => setEditingBlock({ ...editingBlock, textColor: e.target.value })}
                          className="h-8 rounded border"
                          title="Text color"
                        />
                        <select
                          value={editingBlock.align || 'left'}
                          onChange={(e) => setEditingBlock({ ...editingBlock, align: e.target.value as 'left' | 'center' | 'right' })}
                          className="rounded-lg border px-2 py-1 text-sm bg-[color:var(--color-panel)]"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </>
                  ) : block.type === 'image' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            
                            try {
                              const formData = new FormData()
                              formData.append('image', file)
                              
                              const res = await http.post('/api/marketing/images/upload', formData, {
                                headers: { 'Content-Type': 'multipart/form-data' },
                              })
                              
                              if (res.data?.data?.url) {
                                // Construct the full image URL using the API base URL
                                const imageUrl = getApiUrl(res.data.data.url)
                                setEditingBlock({ ...editingBlock, imageUrl })
                              }
                            } catch (err: any) {
                              alert(`Failed to upload image: ${err?.response?.data?.error || err?.message || 'Unknown error'}`)
                            }
                            
                            // Reset the input
                            e.target.value = ''
                          }}
                          className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent text-xs"
                        />
                        {editingBlock.imageUrl && (
                          <img 
                            src={editingBlock.imageUrl} 
                            alt="Preview" 
                            className="h-12 w-12 object-cover rounded border"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        value={editingBlock.imageUrl || ''}
                        onChange={(e) => setEditingBlock({ ...editingBlock, imageUrl: e.target.value })}
                        placeholder="Or enter image URL"
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                      />
                      <input
                        type="text"
                        value={editingBlock.content || ''}
                        onChange={(e) => setEditingBlock({ ...editingBlock, content: e.target.value })}
                        placeholder="Alt text"
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                      />
                      <input
                        type="color"
                        value={editingBlock.backgroundColor || '#ffffff'}
                        onChange={(e) => setEditingBlock({ ...editingBlock, backgroundColor: e.target.value })}
                        className="h-8 rounded border"
                        title="Background color"
                      />
                    </>
                  ) : block.type === 'button' ? (
                    <>
                      <input
                        type="text"
                        value={editingBlock.buttonText || ''}
                        onChange={(e) => setEditingBlock({ ...editingBlock, buttonText: e.target.value })}
                        placeholder="Button text"
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                      />
                      <input
                        type="text"
                        value={editingBlock.buttonUrl || ''}
                        onChange={(e) => setEditingBlock({ ...editingBlock, buttonUrl: e.target.value })}
                        placeholder="Button URL"
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                      />
                      <input
                        type="color"
                        value={editingBlock.backgroundColor || '#ffffff'}
                        onChange={(e) => setEditingBlock({ ...editingBlock, backgroundColor: e.target.value })}
                        className="h-8 rounded border"
                        title="Background color"
                      />
                    </>
                  ) : block.type === 'divider' ? (
                    <input
                      type="color"
                      value={editingBlock.backgroundColor || '#ffffff'}
                      onChange={(e) => setEditingBlock({ ...editingBlock, backgroundColor: e.target.value })}
                      className="h-8 rounded border"
                      title="Background color"
                    />
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-[color:var(--color-text-muted)]">
                  {block.type === 'heading' && <div className="font-bold text-lg">{block.content || '(Empty heading)'}</div>}
                  {block.type === 'text' && <div>{block.content || '(Empty text)'}</div>}
                  {block.type === 'image' && (
                    <div className="space-y-1">
                      {block.imageUrl ? (
                        <img 
                          src={block.imageUrl} 
                          alt={block.content || 'Image'} 
                          className="max-w-full h-24 object-contain rounded border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                            const parent = (e.target as HTMLImageElement).parentElement
                            if (parent) {
                              const errorDiv = document.createElement('div')
                              errorDiv.textContent = `🖼️ ${block.imageUrl}`
                              errorDiv.className = 'text-xs'
                              parent.appendChild(errorDiv)
                            }
                          }}
                        />
                      ) : (
                        <div>🖼️ (No image URL)</div>
                      )}
                    </div>
                  )}
                  {block.type === 'button' && <div>🔘 {block.buttonText || '(Empty button)'}</div>}
                  {block.type === 'divider' && <div className="border-t my-2"></div>}
                  {block.type === 'two-columns' && <div className="grid grid-cols-2 gap-2 text-xs">{block.content.split('|||')[0] || '(Left)'} | {block.content.split('|||')[1] || '(Right)'}</div>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      <div className="flex items-center gap-2 pt-2 border-t">
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onRender}>Render preview</button>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onSave}>Save campaign</button>
        <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Test email" className="rounded-lg border px-3 py-2 text-sm bg-transparent flex-1" />
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onSendTest} disabled={!testTo || testing}>
          {testing ? 'Sending…' : 'Send test'}
        </button>
      </div>
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
  const [builderMode, setBuilderMode] = React.useState<'simple' | 'mjml'>('simple')
  const [mjml, setMjml] = React.useState<string>('')
  const [previewHtml, setPreviewHtml] = React.useState<string>('')
  const [subject, setSubject] = React.useState<string>('')
  const [previewText, setPreviewText] = React.useState<string>('')
  const [segmentId, setSegmentId] = React.useState<string>('')
  
  // Simple builder state
  type SimpleBlock = {
    id: string
    type: 'text' | 'heading' | 'image' | 'button' | 'divider' | 'two-columns'
    content: string
    imageUrl?: string
    buttonUrl?: string
    buttonText?: string
    backgroundColor?: string
    textColor?: string
    align?: 'left' | 'center' | 'right'
  }
  const [simpleBlocks, setSimpleBlocks] = React.useState<SimpleBlock[]>([])
  
  React.useEffect(() => {
    if (editing) {
      setSubject(editing.subject || '')
      setPreviewText(editing.previewText || '')
      setMjml(editing.mjml || '')
      setSegmentId(String(editing.segmentId || ''))
      
      // Try to parse existing MJML into simple blocks if possible
      if (editing.mjml && builderMode === 'simple') {
        try {
          const parsed = parseMjmlToBlocks(editing.mjml)
          if (parsed.length > 0) {
            setSimpleBlocks(parsed)
          }
        } catch {
          // If parsing fails, start with empty blocks
          setSimpleBlocks([])
        }
      }
    } else {
      setSimpleBlocks([])
    }
  }, [editing, builderMode])
  
  // Convert simple blocks to MJML
  function blocksToMjml(blocks: SimpleBlock[]): string {
    if (blocks.length === 0) {
      return '<mjml>\n  <mj-body>\n  </mj-body>\n</mjml>'
    }
    
    const sections = blocks.map((block) => {
      const bgColor = block.backgroundColor || '#ffffff'
      const textColor = block.textColor || '#000000'
      const align = block.align || 'left'
      
      switch (block.type) {
        case 'heading':
          return `    <mj-section background-color="${bgColor}">
      <mj-column>
        <mj-text align="${align}" color="${textColor}" font-size="24px" font-weight="700">${escapeHtml(block.content)}</mj-text>
      </mj-column>
    </mj-section>`
        
        case 'text':
          return `    <mj-section background-color="${bgColor}">
      <mj-column>
        <mj-text align="${align}" color="${textColor}" font-size="16px">${escapeHtml(block.content).replace(/\n/g, '<br />')}</mj-text>
      </mj-column>
    </mj-section>`
        
        case 'image':
          return `    <mj-section background-color="${bgColor}">
      <mj-column>
        <mj-image src="${escapeHtml(block.imageUrl || '')}" alt="${escapeHtml(block.content)}" />
      </mj-column>
    </mj-section>`
        
        case 'button':
          return `    <mj-section background-color="${bgColor}">
      <mj-column>
        <mj-button href="${escapeHtml(block.buttonUrl || '#')}" background-color="#2563eb" color="#ffffff">${escapeHtml(block.buttonText || block.content)}</mj-button>
      </mj-column>
    </mj-section>`
        
        case 'divider':
          return `    <mj-section background-color="${bgColor}">
      <mj-column>
        <mj-divider border-color="#e5e7eb" border-width="1px" />
      </mj-column>
    </mj-section>`
        
        case 'two-columns':
          const [left, right] = block.content.split('|||')
          return `    <mj-section background-color="${bgColor}">
      <mj-column>
        <mj-text align="${align}" color="${textColor}" font-size="16px">${escapeHtml(left || '').replace(/\n/g, '<br />')}</mj-text>
      </mj-column>
      <mj-column>
        <mj-text align="${align}" color="${textColor}" font-size="16px">${escapeHtml(right || '').replace(/\n/g, '<br />')}</mj-text>
      </mj-column>
    </mj-section>`
        
        default:
          return ''
      }
    }).filter(Boolean).join('\n')
    
    return `<mjml>
  <mj-body>
${sections}
    <mj-section>
      <mj-column>
        <mj-text align="center" font-size="12px" color="#64748b">© ${new Date().getFullYear()} — <a href="{{unsubscribeUrl}}" style="color:#60a5fa">Unsubscribe</a></mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
  }
  
  function escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
  
  function parseMjmlToBlocks(mjml: string): SimpleBlock[] {
    // Simple parser - try to extract common patterns
    const blocks: SimpleBlock[] = []
    const sectionRegex = /<mj-section[^>]*background-color="([^"]*)"[^>]*>([\s\S]*?)<\/mj-section>/gi
    let match
    let id = 0
    
    while ((match = sectionRegex.exec(mjml)) !== null) {
      const bgColor = match[1] || '#ffffff'
      const sectionContent = match[2]
      
      // Check for heading
      if (/<mj-text[^>]*font-size="24px"[^>]*font-weight="700"[^>]*>([\s\S]*?)<\/mj-text>/i.test(sectionContent)) {
        const textMatch = sectionContent.match(/<mj-text[^>]*>([\s\S]*?)<\/mj-text>/i)
        if (textMatch) {
          blocks.push({ id: String(id++), type: 'heading', content: textMatch[1].replace(/<[^>]*>/g, ''), backgroundColor: bgColor })
        }
      }
      // Check for button
      else if (/<mj-button/i.test(sectionContent)) {
        const buttonMatch = sectionContent.match(/<mj-button[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/mj-button>/i)
        if (buttonMatch) {
          blocks.push({ id: String(id++), type: 'button', content: buttonMatch[2], buttonUrl: buttonMatch[1], buttonText: buttonMatch[2], backgroundColor: bgColor })
        }
      }
      // Check for image
      else if (/<mj-image/i.test(sectionContent)) {
        const imageMatch = sectionContent.match(/<mj-image[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/i)
        if (imageMatch) {
          blocks.push({ id: String(id++), type: 'image', content: imageMatch[2], imageUrl: imageMatch[1], backgroundColor: bgColor })
        }
      }
      // Check for divider
      else if (/<mj-divider/i.test(sectionContent)) {
        blocks.push({ id: String(id++), type: 'divider', content: '', backgroundColor: bgColor })
      }
      // Default to text
      else {
        const textMatch = sectionContent.match(/<mj-text[^>]*>([\s\S]*?)<\/mj-text>/i)
        if (textMatch) {
          const text = textMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
          const columns = sectionContent.match(/<mj-column>/g)
          if (columns && columns.length >= 2) {
            const colMatches = sectionContent.matchAll(/<mj-column>[\s\S]*?<mj-text[^>]*>([\s\S]*?)<\/mj-text>[\s\S]*?<\/mj-column>/gi)
            const cols = Array.from(colMatches).map(m => m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
            blocks.push({ id: String(id++), type: 'two-columns', content: cols.join('|||'), backgroundColor: bgColor })
          } else {
            blocks.push({ id: String(id++), type: 'text', content: text, backgroundColor: bgColor })
          }
        }
      }
    }
    
    return blocks
  }
  
  // Update MJML when simple blocks change
  React.useEffect(() => {
    if (builderMode === 'simple') {
      const generatedMjml = blocksToMjml(simpleBlocks)
      setMjml(generatedMjml)
    }
  }, [simpleBlocks, builderMode])
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
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => setBuilderMode('simple')}
                  className={`px-3 py-1 text-xs rounded ${builderMode === 'simple' ? 'bg-[color:var(--color-primary-600)] text-white' : ''}`}
                >
                  Simple Builder
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderMode('mjml')}
                  className={`px-3 py-1 text-xs rounded ${builderMode === 'mjml' ? 'bg-[color:var(--color-primary-600)] text-white' : ''}`}
                >
                  MJML Builder
                </button>
              </div>
              <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => { setEditing(null); setPreviewHtml(''); setMjml(''); setSimpleBlocks([]) }}>Close</button>
              <button className="rounded-lg border border-red-400 text-red-400 px-2 py-1 text-sm" onClick={async () => {
                if (!editing) return
                if (!confirm('Delete this campaign? This cannot be undone.')) return
                await remove.mutateAsync(editing._id)
              }}>Delete</button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
            <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Preview text (inbox snippet)" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
            <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:bg-[color:var(--color-panel)] focus:text-[color:var(--color-text)]">
              <option value="">Select segment…</option>
              {((segments?.data?.items ?? []) as any[]).map((s) => (<option key={s._id} value={s._id}>{s.name}</option>))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              {builderMode === 'simple' ? (
                <SimpleBuilderUI
                  blocks={simpleBlocks}
                  setBlocks={setSimpleBlocks}
                  onRender={renderPreview}
                  onSave={saveCampaign}
                  testTo={testTo}
                  setTestTo={setTestTo}
                  onSendTest={sendTest}
                  testing={testing}
                />
              ) : (
                <>
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
                    Tip: MJML uses tags like {`<mj-section>`}, {`<mj-column>`}, {`<mj-text>`}, {`<mj-image>`}, {`<mj-button>`}. Use "Insert block…" to add common pieces.
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={renderPreview}>Render preview</button>
                    <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setMjml(''); setPreviewHtml('') }}>Clear</button>
                    <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Test email to" className="rounded-lg border px-3 py-2 text-sm bg-transparent" />
                    <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={sendTest} disabled={!testTo || testing}>{testing ? 'Sending…' : 'Send test'}</button>
                  </div>
                </>
              )}
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
              <td className="p-2">{d.closeDate ? formatDate(d.closeDate) : '-'}</td>
            </tr>
          ))}
          {items.length === 0 && (<tr><td className="p-2 text-[color:var(--color-text-muted)]" colSpan={3}>No deals in range.</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

function UnsubscribesTab() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'email' | 'at' | 'campaignId'>('at')
  const [dir, setDir] = React.useState<'asc' | 'desc'>('desc')
  const [removingId, setRemovingId] = React.useState<string | null>(null)
  
  // Check if user is admin
  const { data: userRolesData } = useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      return res.data as { roles: Array<{ name: string; permissions: string[] }>; isAdmin: boolean }
    },
  })
  const isAdmin = userRolesData?.isAdmin || false
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['marketing-unsubscribes', q, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/marketing/unsubscribes', { params: { q, sort, dir } })
      return res.data as { data: { items: Array<{
        _id: string
        email: string
        name?: string | null
        campaignId?: string | null
        campaignName?: string | null
        at: string
      }> } }
    },
    retry: false,
  })
  
  const items = data?.data.items ?? []
  
  const removeFromDNC = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/marketing/unsubscribes/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-unsubscribes'] })
      setRemovingId(null)
      alert('Subscriber has been removed from the Do Not Contact list and will receive emails again.')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || err?.message || 'Failed to remove from DNC list'
      alert(`Error: ${errorMsg}`)
      setRemovingId(null)
    },
  })
  
  const handleRemove = (item: { _id: string; email: string; name?: string | null }) => {
    const displayName = item.name || item.email
    if (confirm(`Are you sure you want to remove ${displayName} from the Do Not Contact list? They will begin receiving marketing emails again.`)) {
      setRemovingId(item._id)
      removeFromDNC.mutate(item._id)
    }
  }
  
  const handleSort = (field: 'email' | 'at' | 'campaignId') => {
    if (sort === field) {
      setDir(dir === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(field)
      setDir('asc')
    }
  }
  
  const getSortIndicator = (field: string) => {
    if (sort !== field) return ''
    return dir === 'asc' ? ' ↑' : ' ↓'
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email..."
          className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
        >
          <option value="at">Unsubscribed Date</option>
          <option value="email">Email</option>
          <option value="campaignId">Campaign</option>
        </select>
        <select
          value={dir}
          onChange={(e) => setDir(e.target.value as any)}
          className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
        >
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>
      
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)] bg-[color:var(--color-muted)]">
            <tr>
              <th 
                className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                onClick={() => handleSort('email')}
              >
                Email {getSortIndicator('email')}
              </th>
              <th className="px-4 py-2">Name</th>
              <th 
                className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                onClick={() => handleSort('campaignId')}
              >
                Campaign {getSortIndicator('campaignId')}
              </th>
              <th 
                className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                onClick={() => handleSort('at')}
              >
                Unsubscribed {getSortIndicator('at')}
              </th>
              {isAdmin && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-[color:var(--color-text-muted)]">
                  Loading...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-red-600">
                  {(error as any)?.response?.status === 401 
                    ? 'Please log in to view the unsubscribe list.'
                    : 'Failed to load unsubscribes. Please try again.'}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-[color:var(--color-text-muted)]">
                  No unsubscribes found
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2 font-medium">{item.email}</td>
                  <td className="px-4 py-2">{item.name || item.email || '—'}</td>
                  <td className="px-4 py-2">
                    {item.campaignName ? (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                        {item.campaignName}
                      </span>
                    ) : (
                      <span className="text-[color:var(--color-text-muted)]">All Campaigns</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{item.at ? formatDateTime(item.at) : '—'}</td>
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => handleRemove(item)}
                        disabled={removingId === item._id}
                        className="rounded border border-green-400 px-2 py-1 text-xs text-green-400 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove from Do Not Contact list"
                      >
                        {removingId === item._id ? 'Removing...' : 'Remove from DNC'}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {items.length > 0 && (
          <div className="p-4 text-sm text-[color:var(--color-text-muted)] border-t border-[color:var(--color-border)]">
            Showing {items.length} unsubscribe{items.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
        <p className="font-semibold mb-1">Do Not Contact List</p>
        <p>This list shows all email addresses that have unsubscribed from marketing campaigns. These recipients will be automatically excluded from future campaign sends.</p>
      </div>
    </div>
  )
}


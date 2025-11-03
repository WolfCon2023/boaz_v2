import * as React from 'react'
import { http } from '@/lib/http'

export default function SupportPortal() {
  const [submitResult, setSubmitResult] = React.useState<{ ticketNumber: number } | null>(null)
  const [lookupNumber, setLookupNumber] = React.useState('')
  const [found, setFound] = React.useState<any | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function submitTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const shortDescription = String(fd.get('shortDescription') || '')
    const description = String(fd.get('description') || '')
    const requesterName = String(fd.get('requesterName') || '')
    const requesterEmail = String(fd.get('requesterEmail') || '')
    try {
      const res = await http.post('/api/crm/support/portal/tickets', { shortDescription, description, requesterName, requesterEmail })
      setSubmitResult({ ticketNumber: (res.data?.data?.ticketNumber as number) || 0 })
    } catch (err: any) {
      // Fallback to internal route if portal routes aren't deployed yet
      if (err?.response?.status === 404) {
        const res2 = await http.post('/api/crm/support/tickets', { shortDescription, description })
        setSubmitResult({ ticketNumber: (res2.data?.data?.ticketNumber as number) || 0 })
      } else {
        throw err
      }
    }
    ;(e.currentTarget as HTMLFormElement).reset()
  }

  async function lookupTicket(num: string) {
    if (!num) return
    setLoading(true)
    try {
      const r = await http.get(`/api/crm/support/portal/tickets/${num}`)
      setFound(r.data?.data?.item || null)
    } finally {
      setLoading(false)
    }
  }

  async function addComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!found?.ticketNumber) return
    const fd = new FormData(e.currentTarget)
    const body = String(fd.get('body') || '')
    if (!body.trim()) return
    try {
      await http.post(`/api/crm/support/portal/tickets/${found.ticketNumber}/comments`, { body, author: 'customer' })
      setFound((prev: any) => prev ? { ...prev, comments: [ ...(prev.comments || []), { author: 'you', body, at: new Date().toISOString() } ] } : prev)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // Fallback: find by ticketNumber via internal list, then post to internal comments route
        const list = await http.get('/api/crm/support/tickets')
        const items = (list.data?.data?.items as any[]) || []
        const match = items.find((t) => t.ticketNumber === found.ticketNumber)
        if (match?._id) {
          await http.post(`/api/crm/support/tickets/${match._id}/comments`, { body })
          setFound((prev: any) => prev ? { ...prev, comments: [ ...(prev.comments || []), { author: 'you', body, at: new Date().toISOString() } ] } : prev)
        }
      } else {
        throw err
      }
    }
    ;(e.currentTarget as HTMLFormElement).reset()
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="text-center">
        <div className="text-2xl font-semibold">Support Portal</div>
        <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">Submit a ticket or check your ticket status</div>
      </div>

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="mb-4 text-base font-semibold">Submit a ticket</div>
        <form className="space-y-3" onSubmit={submitTicket}>
          <input name="requesterName" placeholder="Your name" className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="requesterEmail" type="email" required placeholder="Your email (required)" className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="shortDescription" required placeholder="Short description" className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <textarea name="description" placeholder="Describe the issue" maxLength={2500} className="w-full h-32 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm resize-y" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Submit</button>
        </form>
        {submitResult && (
          <div className="mt-4 text-sm">Thank you! Your ticket number is <span className="font-semibold">{submitResult.ticketNumber}</span>.</div>
        )}
      </div>

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="mb-4 text-base font-semibold">Check status</div>
        <div className="flex items-center gap-2">
          <input value={lookupNumber} onChange={(e) => setLookupNumber(e.target.value)} placeholder="Ticket number" className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => lookupTicket(lookupNumber)} disabled={!lookupNumber || loading}>Lookup</button>
        </div>
        {loading && <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">Loading...</div>}
        {found && (
          <div className="mt-4 space-y-2">
            <div className="text-sm">Ticket #{found.ticketNumber} • <span className="font-semibold">{found.shortDescription}</span></div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Status: {found.status} • Priority: {found.priority}</div>
            <div className="rounded-lg border border-[color:var(--color-border)] p-2 text-sm whitespace-pre-wrap">{found.description || '-'}</div>
            <div className="rounded-lg border border-[color:var(--color-border)] p-2">
              <div className="mb-2 text-sm font-semibold">Comments</div>
              {(found.comments || []).map((c: any, i: number) => (
                <div key={i} className="mb-1 text-sm">
                  <div className="text-xs text-[color:var(--color-text-muted)]">{c.at ? new Date(c.at).toLocaleString() : ''} • {c.author || 'system'}</div>
                  <div>{c.body}</div>
                </div>
              ))}
              <form className="mt-2 flex gap-2" onSubmit={addComment}>
                <input name="body" placeholder="Add a comment" className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" disabled={!found?.ticketNumber}>Post</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



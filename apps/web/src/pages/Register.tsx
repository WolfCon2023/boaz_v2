import * as React from 'react'
import { getApiUrl } from '@/lib/http'

export default function Register() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [name, setName] = React.useState('')
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [requestSubmitted, setRequestSubmitted] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    setLoading(true)
    const res = await fetch(getApiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError(err.error ?? 'Registration request failed')
      setLoading(false)
      return
    }
    const data = await res.json()
    setLoading(false)
    setRequestSubmitted(true)
    setMessage(data.message || 'Registration request submitted successfully. You will receive an email once your request has been reviewed.')
    // Clear form
    setEmail('')
    setPassword('')
    setName('')
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow">
        <div className="mb-1 text-center text-xl font-semibold">Create account</div>
        <div className="mb-4 text-center text-xs text-[color:var(--color-text-muted)]">Join BOAZ‑OS</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">Email</span>
            <input className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">Password</span>
            <input className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">Name</span>
            <input className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <div className="text-sm text-red-400">{error}</div>}
          {message && !requestSubmitted && <div className="text-sm text-red-400">{message}</div>}
          {requestSubmitted && (
            <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800">
              <div className="font-semibold mb-1">Registration Request Submitted</div>
              <div>{message}</div>
            </div>
          )}
          <button disabled={loading || requestSubmitted} className="mt-2 w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50">
            {loading ? 'Submitting…' : requestSubmitted ? 'Request Submitted' : 'Submit Registration Request'}
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-[color:var(--color-text-muted)]">
          Already have an account? <a className="underline" href="/login">Sign in</a>
        </div>
      </div>
    </div>
  )
}



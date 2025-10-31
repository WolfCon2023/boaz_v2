import * as React from 'react'
import { Link } from 'react-router-dom'

export default function ForgotUsername() {
  const [email, setEmail] = React.useState('')
  const [answer, setAnswer] = React.useState('')
  const [question, setQuestion] = React.useState<string | null>(null)
  const [username, setUsername] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  async function handleRequestQuestion(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setLoading(true)
    setQuestion(null)
    setUsername(null)

    try {
      const res = await fetch('/api/auth/forgot-username/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error ?? 'Request failed')
        setLoading(false)
        return
      }

      const data = await res.json()
      if (data.question) {
        setQuestion(data.question)
      } else {
        setMessage('No security question is set for this account. Please contact support.')
      }
      setLoading(false)
    } catch (err) {
      setMessage('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  async function handleVerifyAnswer(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-username/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, answer }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error ?? 'Verification failed')
        setLoading(false)
        return
      }

      const data = await res.json()
      setUsername(data.email)
      setLoading(false)
    } catch (err) {
      setMessage('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="relative overflow-hidden flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <style>{`
        @keyframes floatX { 0%{transform:translateX(-20%)} 50%{transform:translateX(20%)} 100%{transform:translateX(-20%)} }
        @keyframes floatY { 0%{transform:translateY(-10%)} 50%{transform:translateY(10%)} 100%{transform:translateY(-10%)} }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #22c55e55, transparent 70%)', animation: 'floatX 9s ease-in-out infinite' }} />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% 40% at 50% 50%, #3b82f655, transparent 70%)', animation: 'floatY 11s ease-in-out infinite' }} />
        <div className="absolute top-1/3 -right-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #a855f755, transparent 70%)', animation: 'floatX 13s ease-in-out infinite' }} />
      </div>
      <div className={`w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]'}`}>
        <div className="mb-1 text-center text-xl font-semibold">Forgot Username</div>
        <div className="mb-4 text-center text-xs text-[color:var(--color-text-muted)]">Recover your username</div>

        {!question && !username && (
          <form onSubmit={handleRequestQuestion} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Email</span>
              <input
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            {message && <div className="text-sm text-red-400">{message}</div>}
            <button disabled={loading} className="mt-2 w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50">
              {loading ? 'Loading…' : 'Continue'}
            </button>
          </form>
        )}

        {question && !username && (
          <form onSubmit={handleVerifyAnswer} className="space-y-3">
            <div className="mb-2 text-sm">
              <div className="mb-1 font-medium text-[color:var(--color-text-muted)]">Security Question:</div>
              <div className="text-[color:var(--color-text)]">{question}</div>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Your Answer</span>
              <input
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                type="text"
                placeholder="Enter your answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
                autoFocus
              />
            </label>
            {message && <div className="text-sm text-red-400">{message}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuestion(null)
                  setAnswer('')
                  setMessage(null)
                }}
                className="flex-1 rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Back
              </button>
              <button disabled={loading} className="flex-1 rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50">
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </form>
        )}

        {username && (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-center">
              <div className="mb-2 text-sm font-medium text-green-400">Your username:</div>
              <div className="text-lg font-semibold text-green-300">{username}</div>
            </div>
            <Link to="/login" className="block w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-center text-sm text-white hover:bg-[color:var(--color-primary-700)]">
              Go to Login
            </Link>
          </div>
        )}

        <div className="mt-4 text-center text-xs text-[color:var(--color-text-muted)]">
          <Link to="/login" className="underline">
            Back to Login
          </Link>
          {' • '}
          <Link to="/forgot-password" className="underline">
            Forgot Password
          </Link>
        </div>
      </div>
    </div>
  )
}


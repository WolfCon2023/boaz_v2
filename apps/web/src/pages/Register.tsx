import { useState } from 'react'
import type { AuthResponse } from '@boaz/shared'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setMessage(err.error ?? 'Registration failed')
      return
    }
    const data = (await res.json()) as AuthResponse
    localStorage.setItem('token', data.token)
    setMessage(`Registered ${data.user.email}`)
  }

  return (
    <div className="max-w-sm">
      <h2 className="text-xl font-semibold mb-4">Register</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="w-full border rounded px-3 py-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="px-3 py-2 rounded bg-indigo-600 text-white">Create account</button>
      </form>
      {message && <div className="mt-3 text-sm">{message}</div>}
    </div>
  )
}



import { Router } from 'express'
import { z } from 'zod'
import type { AuthResponse } from '@boaz/shared'
import { createUser, getUserByEmail, verifyCredentials } from './store.js'
import { signToken, verifyToken } from './jwt.js'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = credentialsSchema.extend({ name: z.string().min(1).optional() })

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' })
  const { email, password, name } = parsed.data
  if (getUserByEmail(email)) return res.status(409).json({ error: 'Email already registered' })
  const user = await createUser(email, password, name)
  const token = signToken({ sub: user.id, email: user.email })
  const body: AuthResponse = { token, user }
  res.status(201).json(body)
})

authRouter.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials' })
  const user = await verifyCredentials(parsed.data.email, parsed.data.password)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const token = signToken({ sub: user.id, email: user.email })
  const body: AuthResponse = { token, user }
  res.json(body)
})

authRouter.get('/me', (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const token = auth.slice(7)
  const payload = verifyToken(token)
  if (!payload) return res.status(401).json({ error: 'Unauthorized' })
  const user = getUserByEmail(payload.email)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  res.json({ user })
})



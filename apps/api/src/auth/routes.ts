import { Router } from 'express'
import { z } from 'zod'
import type { AuthResponse } from '@boaz/shared'
import {
  createUser,
  getUserByEmail,
  verifyCredentials,
  verifySecurityAnswer,
  getUserSecurityQuestion,
  createPasswordResetToken,
  resetPasswordWithToken,
} from './store.js'
import { signToken, verifyToken, signAccessToken, signRefreshToken, verifyAny } from './jwt.js'
import { randomUUID } from 'node:crypto'
import { sendAuthEmail } from './email.js'
import { env } from '../env.js'

const cookieOpts = {
  httpOnly: true as const,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/auth',
}

const activeRefresh = new Map<string, { userId: string; email: string; revoked?: boolean }>()

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = credentialsSchema.extend({
  name: z.string().min(1).optional(),
  securityQuestion: z.string().min(1).optional(),
  securityAnswer: z.string().min(1).optional(),
})

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' })
  const { email, password, name, securityQuestion, securityAnswer } = parsed.data
  
  try {
    const user = await createUser(email, password, name, securityQuestion, securityAnswer)
    const access = signAccessToken({ sub: user.id, email: user.email })
    const jti = randomUUID()
    const refresh = signRefreshToken({ sub: user.id, email: user.email, jti })
    activeRefresh.set(jti, { userId: user.id, email: user.email })
    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 })
    const body: AuthResponse = { token: access, user }
    res.status(201).json(body)
  } catch (err: any) {
    if (err.message === 'Email already registered') {
      return res.status(409).json({ error: 'Email already registered' })
    }
    if (err.message === 'Database unavailable') {
      return res.status(503).json({ error: 'Service unavailable' })
    }
    return res.status(500).json({ error: 'Registration failed' })
  }
})

authRouter.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials' })
  
  try {
    const user = await verifyCredentials(parsed.data.email, parsed.data.password)
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const access = signAccessToken({ sub: user.id, email: user.email })
    const jti = randomUUID()
    const refresh = signRefreshToken({ sub: user.id, email: user.email, jti })
    activeRefresh.set(jti, { userId: user.id, email: user.email })
    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 })
    const body: AuthResponse = { token: access, user }
    res.json(body)
  } catch (err: any) {
    if (err.message === 'Database unavailable') {
      return res.status(503).json({ error: 'Service unavailable' })
    }
    return res.status(401).json({ error: 'Invalid credentials' })
  }
})

authRouter.get('/me', async (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const token = auth.slice(7)
  const payload = verifyToken(token)
  if (!payload) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const user = await getUserByEmail(payload.email)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    res.json({ user })
  } catch (err) {
    return res.status(503).json({ error: 'Service unavailable' })
  }
})

authRouter.post('/refresh', (req, res) => {
  const rt = req.cookies?.refresh_token || req.body?.refresh_token
  if (!rt) return res.status(401).json({ error: 'Unauthorized' })
  const payload = verifyAny<{ sub: string; email: string; jti?: string }>(rt)
  if (!payload?.jti) return res.status(401).json({ error: 'Unauthorized' })
  const meta = activeRefresh.get(payload.jti)
  if (!meta || meta.revoked) return res.status(401).json({ error: 'Unauthorized' })
  // rotate
  meta.revoked = true
  const jti = randomUUID()
  activeRefresh.set(jti, { userId: payload.sub, email: payload.email })
  const refresh = signRefreshToken({ sub: payload.sub, email: payload.email, jti })
  const access = signAccessToken({ sub: payload.sub, email: payload.email })
  res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 })
  res.json({ token: access })
})

authRouter.post('/logout', (req, res) => {
  const rt = req.cookies?.refresh_token || req.body?.refresh_token
  if (rt) {
    const payload = verifyAny<{ jti?: string }>(rt)
    if (payload?.jti) {
      const meta = activeRefresh.get(payload.jti)
      if (meta) meta.revoked = true
    }
  }
  res.clearCookie('refresh_token', { ...cookieOpts, maxAge: 0 })
  res.json({ ok: true })
})

// Forgot Username: Step 1 - Get security question
authRouter.post('/forgot-username/request', async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email' })
  }

  try {
    const question = await getUserSecurityQuestion(parsed.data.email)
    // Always return success to prevent email enumeration
    // If no question exists, return null (user hasn't set up security question)
    return res.json({ question })
  } catch (err: any) {
    return res.status(503).json({ error: 'Service unavailable' })
  }
})

// Forgot Username: Step 2 - Verify answer and return username
authRouter.post('/forgot-username/verify', async (req, res) => {
  const parsed = z
    .object({
      email: z.string().email(),
      answer: z.string().min(1),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' })
  }

  try {
    const isValid = await verifySecurityAnswer(parsed.data.email, parsed.data.answer)
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect answer' })
    }

    const user = await getUserByEmail(parsed.data.email)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Return the username (email) if answer is correct
    return res.json({ email: user.email })
  } catch (err: any) {
    return res.status(503).json({ error: 'Service unavailable' })
  }
})

// Forgot Password: Step 1 - Request reset (sends email)
authRouter.post('/forgot-password/request', async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email' })
  }

  try {
    const token = await createPasswordResetToken(parsed.data.email)
    
    // Only send email if token is real (not dummy)
    if (token.startsWith('dummy-token-')) {
      // User doesn't exist, but don't reveal this
      // Return success anyway for security
      return res.json({ message: 'If an account exists, a password reset email has been sent.' })
    }

    // Construct reset URL - try to get from ORIGIN env, fallback to localhost
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    try {
      await sendAuthEmail({
        to: parsed.data.email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Click the link below to reset it:</p>
          <p><a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${resetUrl}</code></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `,
        text: `
Password Reset Request

You requested to reset your password. Click the link below to reset it:

${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email.
        `,
      })
    } catch (emailErr) {
      // Log error but don't reveal to user (security best practice)
      console.error('Failed to send password reset email:', emailErr)
    }

    // Always return success (security best practice - don't reveal if email exists)
    return res.json({ message: 'If an account exists, a password reset email has been sent.' })
  } catch (err: any) {
    return res.status(503).json({ error: 'Service unavailable' })
  }
})

// Forgot Password: Step 2 - Reset password with token
authRouter.post('/forgot-password/reset', async (req, res) => {
  const parsed = z
    .object({
      token: z.string().min(1),
      password: z.string().min(6),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' })
  }

  try {
    const success = await resetPasswordWithToken(parsed.data.token, parsed.data.password)
    if (!success) {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }

    return res.json({ message: 'Password has been reset successfully' })
  } catch (err: any) {
    return res.status(503).json({ error: 'Service unavailable' })
  }
})

// Debug endpoint to check database and list users
authRouter.get('/debug/users', async (req, res) => {
  try {
    const { getDb } = await import('../db.js')
    const db = await getDb()
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable', databaseName: null })
    }

    const databaseName = db.databaseName
    const users = await db.collection('users').find({}).toArray()
    
    // Return user info without password hashes
    const safeUsers = users.map((u: any) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name,
      verified: u.verified,
      failedAttempts: u.failedAttempts,
      lockoutUntil: u.lockoutUntil,
      createdAt: u.createdAt,
    }))

    res.json({
      databaseName,
      userCount: users.length,
      users: safeUsers,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})



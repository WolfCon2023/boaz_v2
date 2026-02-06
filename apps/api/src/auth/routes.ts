import { Router } from 'express'
import { z } from 'zod'
import type { AuthResponse } from '@boaz/shared'
import {
  createUser,
  getUserByEmail,
  verifyCredentials,
  verifySecurityAnswer,
  getRandomSecurityQuestion,
  createPasswordResetToken,
  resetPasswordWithToken,
  createEnrollmentToken,
  verifyEnrollmentToken,
  updateSecurityQuestions,
  completeEnrollment,
  getUserById,
  getUserSecurityQuestions,
  updateUserProfile,
  createUserByAdmin,
  changePassword,
  resetUserToTemporaryPassword,
  createRegistrationRequest,
  getRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
  getUserApplicationAccess,
  hasApplicationAccess,
  grantApplicationAccess,
  revokeApplicationAccess,
  getUserAccessList,
  getAllUsersWithAppAccess,
  APPLICATION_CATALOG,
  createApplicationAccessRequest,
  getApplicationAccessRequests,
  approveApplicationAccessRequest,
  rejectApplicationAccessRequest,
  getUserApplicationAccessRequests,
  getApplicationAccessRequestById,
  generateAccessReport,
} from './store.js'
import { hasEmailNotificationsEnabled } from './preferences-helper.js'
import { signToken, verifyToken, signAccessToken, signRefreshToken, verifyAny } from './jwt.js'
import { requireAuth, requirePermission, ensureDefaultRoles } from './rbac.js'
import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'
import { sendAuthEmail } from './email.js'
import { env } from '../env.js'
import { getDb } from '../db.js'
import {
  createSession,
  updateSessionLastUsed,
  revokeSession,
  revokeAllUserSessions,
  getUserSessions,
  isSessionRevoked,
  getAllSessions,
  getSessionsByUserId,
  adminRevokeSession,
  adminBulkRevokeSessions,
  adminRevokeAllSessions,
  type SessionInfo,
} from './sessions.js'

const cookieOpts = {
  httpOnly: true as const,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth',
}

// Helper function to get client IP
function getClientIp(req: any): string | undefined {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    undefined
  )
}

// Helper function to get user agent
function getUserAgent(req: any): string | undefined {
  return req.headers['user-agent'] || undefined
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const securityQuestionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
})

const registerSchema = credentialsSchema.extend({
  name: z.string().transform((val) => (val.trim() === '' ? undefined : val.trim())).optional(),
  securityQuestions: z.array(securityQuestionSchema).length(3).optional(),
  phoneNumber: z.string().transform((val) => (val.trim() === '' ? undefined : val.trim())).optional(),
  workLocation: z.string().transform((val) => (val.trim() === '' ? undefined : val.trim())).optional(),
})

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      console.error('Registration validation error:', parsed.error)
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }
    
    const { email, password, name, phoneNumber, workLocation } = parsed.data
    console.log('Registration request for:', email)
    
    // Create registration request instead of immediate user account
    const request = await createRegistrationRequest(email, password, name, phoneNumber, workLocation)
    
    // Return success - user will be notified via email after admin approval
    res.status(201).json({
      message: 'Registration request submitted successfully. Your request is pending admin approval. You will receive an email once your request has been reviewed.',
      requestId: request.id,
      status: 'pending',
    })
  } catch (err: any) {
    console.error('Registration request error:', err)
    
    if (err.message === 'Email already registered') {
      return res.status(409).json({ error: 'Email already registered' })
    }
    if (err.message === 'Registration request already pending for this email') {
      return res.status(409).json({ error: 'A registration request for this email is already pending approval' })
    }
    if (err.message === 'Database unavailable') {
      return res.status(503).json({ error: 'Service unavailable' })
    }
    
    // Include error details to help debug
    const errorResponse: any = { 
      error: 'Registration request failed',
      message: err.message || 'Unknown error'
    }
    
    // Include more details in non-production
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.details = {
        name: err.name,
        code: err.code,
        stack: err.stack
      }
    }
    
    return res.status(500).json(errorResponse)
  }
})

authRouter.post('/login', async (req, res) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body)
    if (!parsed.success) {
      console.error('Login validation error:', parsed.error)
      return res.status(400).json({ error: 'Invalid credentials' })
    }
    
    console.log('Login attempt for:', parsed.data.email)
    
    const result = await verifyCredentials(parsed.data.email, parsed.data.password)
    if (!result) {
      console.log('Login failed: Invalid credentials for', parsed.data.email)
      // Audit log: failed login
      logAuditEvent({ action: 'login_failed', email: parsed.data.email, ipAddress: getClientIp(req), userAgent: getUserAgent(req) })
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    const { user, passwordChangeRequired } = result
    
    // If password change is required, don't create session yet - force password change first
    if (passwordChangeRequired) {
      console.log('Login successful but password change required for:', user.email)
      // Still issue a token but with a flag indicating password change is required
      const access = signAccessToken({ sub: user.id, email: user.email })
      return res.json({ 
        token: access, 
        user,
        passwordChangeRequired: true 
      })
    }
    
    console.log('Login successful for:', user.email)
    const access = signAccessToken({ sub: user.id, email: user.email })
    const jti = randomUUID()
    const refresh = signRefreshToken({ sub: user.id, email: user.email, jti })
    
    // Store session in database
    try {
      await createSession(jti, user.id, user.email, getClientIp(req), getUserAgent(req))
    } catch (sessionErr) {
      console.error('Failed to create session:', sessionErr)
      // Continue anyway - session might work with in-memory fallback
    }
    
    // Audit log: successful login
    logAuditEvent({ action: 'login_success', userId: user.id, email: user.email, ipAddress: getClientIp(req), userAgent: getUserAgent(req) })

    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 })
    const body: AuthResponse = { token: access, user }
    res.json(body)
  } catch (err: any) {
    console.error('Login error:', err)
    console.error('Login error stack:', err.stack)
    console.error('Login error message:', err.message)
    
    if (err.message === 'Database unavailable') {
      console.error('Database unavailable during login')
      return res.status(503).json({ error: 'Service unavailable' })
    }
    console.error('Login failed with error:', err.message || 'Unknown error')
    return res.status(401).json({ error: 'Invalid credentials' })
  }
})

authRouter.post('/refresh', async (req, res) => {
  const rt = req.cookies?.refresh_token || req.body?.refresh_token
  if (!rt) return res.status(401).json({ error: 'Unauthorized' })
  const payload = verifyAny<{ sub: string; email: string; jti?: string }>(rt)
  if (!payload?.jti) return res.status(401).json({ error: 'Unauthorized' })
  
  // Check if session is revoked in database
  const isRevoked = await isSessionRevoked(payload.jti)
  if (isRevoked) return res.status(401).json({ error: 'Unauthorized' })
  
  // Update last used timestamp
  await updateSessionLastUsed(payload.jti)
  
  // Rotate token
  const oldJti = payload.jti
  const jti = randomUUID()
  await revokeSession(oldJti, payload.sub)
  
  try {
    await createSession(jti, payload.sub, payload.email, getClientIp(req), getUserAgent(req))
  } catch (sessionErr) {
    console.error('Failed to create new session during refresh:', sessionErr)
  }
  
  const refresh = signRefreshToken({ sub: payload.sub, email: payload.email, jti })
  const access = signAccessToken({ sub: payload.sub, email: payload.email })
  res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 })
  res.json({ token: access })
})

authRouter.post('/logout', async (req, res) => {
  const rt = req.cookies?.refresh_token || req.body?.refresh_token
  let logUserId: string | undefined
  let logEmail: string | undefined
  if (rt) {
    const payload = verifyAny<{ sub?: string; email?: string; jti?: string }>(rt)
    logUserId = payload?.sub
    logEmail = payload?.email
    if (payload?.jti && payload?.sub) {
      await revokeSession(payload.jti, payload.sub)
    }
  }
  // Audit log: logout
  logAuditEvent({ action: 'logout', userId: logUserId, email: logEmail, ipAddress: getClientIp(req), userAgent: getUserAgent(req) })

  res.clearCookie('refresh_token', { ...cookieOpts, maxAge: 0 })
  res.json({ ok: true })
})

// Admin: Trigger a database backup via external webhook
// This is intended to complement the scheduled backup job by allowing on-demand backups from the Admin Portal.
// The actual backup work should be handled by an external service exposed via env.DB_BACKUP_WEBHOOK_URL.
authRouter.post('/admin/db-backup', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }

    if (!env.DB_BACKUP_WEBHOOK_URL) {
      console.error('DB_BACKUP_WEBHOOK_URL is not configured')
      return res.status(500).json({ error: 'backup_webhook_not_configured' })
    }

    const db = await getDb()
    if (!db) {
      console.error('Database unavailable when attempting to log backup run')
      return res.status(500).json({ error: 'db_unavailable' })
    }

    const startedAt = new Date()
    const logBase: any = {
      triggeredByUserId: auth.userId,
      triggeredByEmail: auth.email,
      source: 'admin_portal',
      startedAt,
      createdAt: new Date(),
    }

    // Call external backup webhook
    let backupResponse: Response
    try {
      backupResponse = await fetch(env.DB_BACKUP_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          triggeredBy: auth.email,
          triggeredAt: startedAt.toISOString(),
          source: 'boaz-admin-portal',
        }),
      } as any)
    } catch (err: any) {
      console.error('DB backup webhook network error:', err)

      try {
        await db.collection('backup_logs').insertOne({
          ...logBase,
          status: 'network_error',
          error: err?.message || String(err),
        } as any)
      } catch (logErr) {
        console.error('Failed to log backup network error:', logErr)
      }

      return res.status(500).json({ error: 'failed_to_trigger_backup', details: err.message || String(err) })
    }

    const finishedAt = new Date()

    if (!backupResponse.ok) {
      let bodyText: string | undefined
      try {
        bodyText = await backupResponse.text()
      } catch {
        bodyText = undefined
      }
      console.error('DB backup webhook error response:', {
        status: backupResponse.status,
        body: bodyText,
      })

      try {
        await db.collection('backup_logs').insertOne({
          ...logBase,
          finishedAt,
          status: 'failed',
          error: { status: backupResponse.status, body: bodyText },
        } as any)
      } catch (logErr) {
        console.error('Failed to log failed backup run:', logErr)
      }

      return res.status(500).json({
        error: 'failed_to_trigger_backup',
        details: { status: backupResponse.status, body: bodyText },
      })
    }

    // Attempt to send completion email to support
    try {
      await sendAuthEmail({
        to: 'support@wolfconsultingnc.com',
        subject: 'BOAZ DB Backup completed',
        text: `A database backup was triggered from the Admin Portal.

Triggered by: ${auth.email}
Started at:   ${startedAt.toISOString()}
Finished at:  ${finishedAt.toISOString()}`,
        html: `<p>A database backup was triggered from the Admin Portal.</p>
<p><strong>Triggered by:</strong> ${auth.email}</p>
<p><strong>Started at:</strong> ${startedAt.toISOString()}</p>
<p><strong>Finished at:</strong> ${finishedAt.toISOString()}</p>`,
        checkPreferences: false,
      })
    } catch (emailErr: any) {
      console.error('Failed to send DB backup completion email:', emailErr)
      // Do not fail the API call just because email failed
    }

    try {
      await db.collection('backup_logs').insertOne({
        ...logBase,
        finishedAt,
        status: 'success',
      } as any)
    } catch (logErr) {
      console.error('Failed to log successful backup run:', logErr)
    }

    return res.json({
      message: 'Database backup triggered successfully. An email will be sent to support when it completes.',
      startedAt,
      finishedAt,
    })
  } catch (err: any) {
    console.error('Admin DB backup error:', err)
    return res.status(500).json({ error: err.message || 'failed_to_trigger_backup' })
  }
})

// Admin: Get recent DB backup logs
authRouter.get('/admin/db-backup/logs', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) {
      console.error('Database unavailable when fetching backup logs')
      return res.status(500).json({ error: 'db_unavailable' })
    }

    const limitRaw = (req.query.limit as string) ?? '20'
    const limit = Math.min(parseInt(limitRaw, 10) || 20, 200)

    const status = (req.query.status as string | undefined)?.toLowerCase()
    const filter: any = {}
    if (status && status !== 'all') {
      filter.status = status
    }

    const logs = await db
      .collection('backup_logs')
      .find(filter)
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray()

    return res.json({ logs })
  } catch (err: any) {
    console.error('Admin get DB backup logs error:', err)
    return res.status(500).json({ error: err.message || 'failed_to_get_backup_logs' })
  }
})

// Forgot Username: Step 1 - Get random security question
authRouter.post('/forgot-username/request', async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email' })
  }

  try {
    const result = await getRandomSecurityQuestion(parsed.data.email)
    // Always return success to prevent email enumeration
    // If no questions exist, return null (user hasn't set up security questions)
    if (!result) {
      return res.json({ question: null })
    }
    return res.json({ question: result.question, questionIndex: result.index })
  } catch (err: any) {
    return res.status(503).json({ error: 'Service unavailable' })
  }
})

// Forgot Username: Step 2 - Verify answer and return username
authRouter.post('/forgot-username/verify', async (req, res) => {
  const parsed = z
    .object({
      email: z.string().email(),
      question: z.string().min(1),
      answer: z.string().min(1),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' })
  }

  try {
    const isValid = await verifySecurityAnswer(parsed.data.email, parsed.data.question, parsed.data.answer)
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

    // Check if user has email notifications enabled
    // Note: Password resets are security-critical, so we check but still send if preference not set
    const notificationsEnabled = await hasEmailNotificationsEnabled(undefined, parsed.data.email)
    
    if (notificationsEnabled === false) {
      // User has explicitly disabled notifications - log but don't send
      console.log(`Password reset email skipped for ${parsed.data.email}: user has disabled email notifications`)
      // Still return success to maintain security (don't reveal if account exists)
      return res.json({ message: 'If an account exists, a password reset email has been sent.' })
    }

    try {
      await sendAuthEmail({
        to: parsed.data.email,
        subject: 'Password Reset Request',
        checkPreferences: false, // Already checked above, and security emails should always send if preference not set
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

    // Audit log: password reset request
    logAuditEvent({ action: 'password_reset_request', email: parsed.data.email, ipAddress: getClientIp(req), userAgent: getUserAgent(req) })

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

    // Audit log: password reset complete
    logAuditEvent({ action: 'password_reset_complete', ipAddress: getClientIp(req), userAgent: getUserAgent(req) })

    return res.json({ message: 'Password has been reset successfully' })
  } catch (err: any) {
    return res.status(503).json({ error: 'Service unavailable' })
  }
})

// Get current user info
authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const user = await getUserById(auth.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    // Return user data directly, not nested
    res.json(user)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Get user sessions
authRouter.get('/me/sessions', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const sessions = await getUserSessions(auth.userId)
    
    // Identify current session from refresh token
    const rt = req.cookies?.refresh_token
    let currentJti: string | undefined
    if (rt) {
      const payload = verifyAny<{ jti?: string }>(rt)
      currentJti = payload?.jti
    }
    
    // Mark current session in response
    const sessionsWithCurrent = sessions.map(s => ({
      ...s,
      isCurrent: s.jti === currentJti,
    }))
    
    res.json({ sessions: sessionsWithCurrent, currentJti })
  } catch (err: any) {
    console.error('Get sessions error:', err)
    res.status(500).json({ error: err.message || 'Failed to get sessions' })
  }
})

// Revoke a specific session
authRouter.delete('/me/sessions/:jti', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const { jti } = req.params
    
    const revoked = await revokeSession(jti, auth.userId)
    if (!revoked) {
      return res.status(404).json({ error: 'Session not found or already revoked' })
    }
    
    res.json({ message: 'Session revoked successfully' })
  } catch (err: any) {
    console.error('Revoke session error:', err)
    res.status(500).json({ error: err.message || 'Failed to revoke session' })
  }
})

// Revoke all other sessions (keep current one)
authRouter.post('/me/sessions/revoke-all', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    
    // Get current session JTI from refresh token
    const rt = req.cookies?.refresh_token
    let currentJti: string | undefined
    if (rt) {
      const payload = verifyAny<{ jti?: string }>(rt)
      currentJti = payload?.jti
    }
    
    const revokedCount = await revokeAllUserSessions(auth.userId, currentJti)
    res.json({ message: `Revoked ${revokedCount} session(s)` })
  } catch (err: any) {
    console.error('Revoke all sessions error:', err)
    res.status(500).json({ error: err.message || 'Failed to revoke sessions' })
  }
})

// Admin: Get all active sessions
authRouter.get('/admin/sessions', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const userId = req.query.userId as string | undefined
    
    let sessions: SessionInfo[]
    if (userId) {
      sessions = await getSessionsByUserId(userId)
    } else {
      sessions = await getAllSessions(limit)
    }
    
    res.json({ sessions })
  } catch (err: any) {
    console.error('Admin get sessions error:', err)
    res.status(500).json({ error: err.message || 'Failed to get sessions' })
  }
})

// Admin: Revoke any session
authRouter.delete('/admin/sessions/:jti', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const { jti } = req.params
    
    const revoked = await adminRevokeSession(jti)
    if (!revoked) {
      return res.status(404).json({ error: 'Session not found or already revoked' })
    }
    
    res.json({ message: 'Session revoked successfully' })
  } catch (err: any) {
    console.error('Admin revoke session error:', err)
    res.status(500).json({ error: err.message || 'Failed to revoke session' })
  }
})

// Admin: Bulk revoke sessions
authRouter.post('/admin/sessions/bulk-revoke', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const parsed = z.object({
      jtis: z.array(z.string()).min(1),
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }

    const { jtis } = parsed.data
    const revokedCount = await adminBulkRevokeSessions(jtis)
    
    res.json({ message: `Revoked ${revokedCount} session(s)`, revokedCount })
  } catch (err: any) {
    console.error('Admin bulk revoke sessions error:', err)
    res.status(500).json({ error: err.message || 'Failed to revoke sessions' })
  }
})

// Admin: Revoke all sessions (excluding current admin session)
authRouter.post('/admin/sessions/revoke-all', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    // Extract current session JTI from refresh token to exclude it
    const rt = req.cookies?.refresh_token
    let currentJti: string | undefined
    if (rt) {
      const payload = verifyAny<{ jti?: string }>(rt)
      currentJti = payload?.jti
    }
    
    const revokedCount = await adminRevokeAllSessions(currentJti)
    
    res.json({ 
      message: `Revoked ${revokedCount} session(s)${currentJti ? ' (your session was preserved)' : ''}`, 
      revokedCount 
    })
  } catch (err: any) {
    console.error('Admin revoke all sessions error:', err)
    res.status(500).json({ error: err.message || 'Failed to revoke all sessions' })
  }
})

// Admin: Create user with temporary password
authRouter.post('/admin/users', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    const parsed = z.object({
      email: z.string().email(),
      name: z.string().optional(),
      phoneNumber: z.string().optional(),
      workLocation: z.string().optional(),
      roleId: z.string().optional(), // Optional role ID to assign
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }

    const { user, temporaryPassword } = await createUserByAdmin(
      parsed.data.email,
      parsed.data.name,
      parsed.data.phoneNumber,
      parsed.data.workLocation
    )

    // Send email with credentials
    // Always send welcome email for admin-created users regardless of preferences
    // (user hasn't logged in yet, so preferences don't apply)
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const loginUrl = `${baseUrl}/login`

    let emailSent = false
    try {
      await sendAuthEmail({
        to: user.email,
        subject: 'Welcome to BOAZ-OS - Your Account Credentials',
        checkPreferences: false, // Skip preference check - always send for new admin-created users
        html: `
          <h2>Welcome to BOAZ-OS!</h2>
          <p>Your account has been created. Please use the following credentials to log in:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Temporary Password:</strong> <code style="background-color: #e0e0e0; padding: 2px 6px; border-radius: 3px;">${temporaryPassword}</code></p>
          </div>
          <p><strong>Important:</strong> You will be required to change your password on first login.</p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Log In Now</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${loginUrl}</code></p>
          <p>Please keep your credentials secure and change your password immediately after logging in.</p>
        `,
        text: `
Welcome to BOAZ-OS!

Your account has been created. Please use the following credentials to log in:

Email: ${user.email}
Temporary Password: ${temporaryPassword}

Important: You will be required to change your password on first login.

Log in at: ${loginUrl}

Please keep your credentials secure and change your password immediately after logging in.
        `,
      })
      emailSent = true
    } catch (emailErr) {
      console.error('Failed to send welcome email:', emailErr)
      // Don't fail user creation if email fails - return password in response for admin
      emailSent = false
    }

    // Assign role if provided
    let assignedRole = null
    if (parsed.data.roleId) {
      try {
        const roleIdObj = new ObjectId(parsed.data.roleId)
        
        // Validate that role exists
        const role = await db.collection('roles').findOne({ _id: roleIdObj })
        if (!role) {
          console.warn(`Role ${parsed.data.roleId} not found, skipping role assignment`)
        } else {
          // Check if assignment already exists
          const exists = await db.collection('user_roles').findOne({ 
            userId: user.id, 
            roleId: roleIdObj 
          })
          
          if (!exists) {
            await db.collection('user_roles').insertOne({
              _id: new ObjectId(),
              userId: user.id,
              roleId: roleIdObj,
              createdAt: new Date(),
            })
            assignedRole = { id: role._id.toString(), name: role.name }
          } else {
            assignedRole = { id: role._id.toString(), name: role.name }
          }
        }
      } catch (roleErr: any) {
        console.error('Failed to assign role:', roleErr)
        // Don't fail user creation if role assignment fails
      }
    }

    if (!emailSent) {
      return res.status(201).json({
        user,
        temporaryPassword,
        message: 'User created successfully, but email could not be sent. Please share credentials manually.',
        emailSent: false,
        assignedRole,
      })
    }

    res.status(201).json({
      user,
      message: 'User created successfully. Credentials have been sent via email.',
      emailSent: true,
      assignedRole,
    })
  } catch (err: any) {
    console.error('Admin create user error:', err)
    if (err.message === 'Email already registered') {
      return res.status(409).json({ error: 'Email already registered' })
    }
    res.status(500).json({ error: err.message || 'Failed to create user' })
  }
})

// Change password for authenticated user
authRouter.post('/me/change-password', requireAuth, async (req, res) => {
  try {
    const parsed = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }

    const auth = (req as any).auth as { userId: string; email: string }
    const success = await changePassword(
      auth.userId,
      parsed.data.currentPassword,
      parsed.data.newPassword
    )

    if (!success) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    // Audit log: password change
    logAuditEvent({ action: 'password_change', userId: auth.userId, email: auth.email, ipAddress: getClientIp(req), userAgent: getUserAgent(req) })

    res.json({ message: 'Password changed successfully' })
  } catch (err: any) {
    console.error('Change password error:', err)
    res.status(500).json({ error: err.message || 'Failed to change password' })
  }
})

// Admin: Get all roles (for dropdown/selection)
authRouter.get('/admin/roles', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })
    
    // Ensure all default roles exist (adds any missing roles like senior_manager, finance_manager)
    await ensureDefaultRoles()
    
    const roles = await db.collection('roles').find({}).sort({ name: 1 }).toArray()
    res.json({ roles: roles.map(r => ({ id: r._id.toString(), name: r.name, permissions: r.permissions || [] })) })
  } catch (err: any) {
    console.error('Get roles error:', err)
    res.status(500).json({ error: err.message || 'Failed to get roles' })
  }
})

// Get users list for dropdowns (lightweight)
authRouter.get('/users', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    // Get all active users with just id, name, and email
    const users = await db.collection('users')
      .find({ status: { $ne: 'deleted' } })
      .project({ _id: 1, name: 1, email: 1 })
      .sort({ name: 1 })
      .toArray()

    const formatted = users.map((u: any) => ({
      _id: u._id.toHexString(),
      name: u.name || u.email || 'Unnamed User',
      email: u.email || '',
    }))

    res.json({ data: { items: formatted }, error: null })
  } catch (err: any) {
    console.error('Get users error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_users' })
  }
})

// Admin: List/Search users
authRouter.get('/admin/users', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    const search = (req.query.search as string)?.trim() || ''
    const limit = parseInt(req.query.limit as string) || 50

    // Build search query
    let query: any = {}
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ]
    }

    // Get users
    const users = await db.collection('users')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    // Get all role assignments for these users
    const userIds = users.map((u: any) => u._id.toString())
    const userRoles = await db.collection('user_roles')
      .find({ userId: { $in: userIds } } as any)
      .toArray()

    // Get role details
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    const roles = roleIds.length > 0
      ? await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
      : []

    // Build role map
    const roleMap = new Map(roles.map((r: any) => [r._id.toString(), { id: r._id.toString(), name: r.name, permissions: r.permissions || [] }]))

    // Build user -> roles map
    const userRolesMap = new Map<string, Array<{ id: string; name: string; permissions: string[] }>>()
    userRoles.forEach((ur: any) => {
      const role = roleMap.get(ur.roleId.toString())
      if (role) {
        if (!userRolesMap.has(ur.userId)) {
          userRolesMap.set(ur.userId, [])
        }
        userRolesMap.get(ur.userId)!.push(role)
      }
    })

    // Format response
    const usersWithRoles = users.map((u: any) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name || undefined,
      phoneNumber: u.phoneNumber || undefined,
      workLocation: u.workLocation || undefined,
      verified: u.verified || false,
      passwordChangeRequired: u.passwordChangeRequired || false,
      createdAt: u.createdAt,
      roles: userRolesMap.get(u._id.toString()) || [],
      reportsTo: u.reportsTo || null,
    }))

    res.json({ users: usersWithRoles, total: users.length })
  } catch (err: any) {
    console.error('Get users error:', err)
    res.status(500).json({ error: err.message || 'Failed to get users' })
  }
})

// Admin: Update user role
authRouter.patch('/admin/users/:id/role', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    let userId: ObjectId
    try {
      userId = new ObjectId(req.params.id)
    } catch {
      return res.status(400).json({ error: 'Invalid user ID' })
    }

    const parsed = z.object({
      roleId: z.string().nullable(), // null means remove all roles
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }

    // Verify user exists
    const user = await db.collection('users').findOne({ _id: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const userIdStr = userId.toString()

    // Remove all existing roles for this user
    await db.collection('user_roles').deleteMany({ userId: userIdStr } as any)

    let assignedRole = null
    if (parsed.data.roleId) {
      // Assign new role
      let roleId: ObjectId
      try {
        roleId = new ObjectId(parsed.data.roleId)
      } catch {
        return res.status(400).json({ error: 'Invalid role ID' })
      }

      // Verify role exists
      const role = await db.collection('roles').findOne({ _id: roleId })
      if (!role) {
        return res.status(404).json({ error: 'Role not found' })
      }

      // Assign role
      await db.collection('user_roles').insertOne({
        _id: new ObjectId(),
        userId: userIdStr,
        roleId,
        createdAt: new Date(),
      })

      assignedRole = { id: role._id.toString(), name: role.name }
    }

    res.json({
      message: assignedRole ? `Role "${assignedRole.name}" assigned successfully` : 'All roles removed',
      role: assignedRole,
    })
  } catch (err: any) {
    console.error('Update user role error:', err)
    res.status(500).json({ error: err.message || 'Failed to update user role' })
  }
})

// Admin: Update user reportsTo
authRouter.patch('/admin/users/:id/reports-to', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    let userId: ObjectId
    try {
      userId = new ObjectId(req.params.id)
    } catch {
      return res.status(400).json({ error: 'Invalid user ID' })
    }

    const parsed = z.object({
      reportsTo: z.string().nullable(), // null means no manager assigned
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }

    // Verify user exists
    const user = await db.collection('users').findOne({ _id: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Validate reportsTo user exists if provided
    if (parsed.data.reportsTo) {
      let managerId: ObjectId
      try {
        managerId = new ObjectId(parsed.data.reportsTo)
      } catch {
        return res.status(400).json({ error: 'Invalid manager ID' })
      }

      const manager = await db.collection('users').findOne({ _id: managerId })
      if (!manager) {
        return res.status(404).json({ error: 'Manager not found' })
      }

      // Prevent circular reporting (user cannot report to themselves)
      if (userId.toString() === parsed.data.reportsTo) {
        return res.status(400).json({ error: 'User cannot report to themselves' })
      }
    }

    // Update user's reportsTo field
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { reportsTo: parsed.data.reportsTo } }
    )

    res.json({
      message: parsed.data.reportsTo ? 'Reports To updated successfully' : 'Reports To removed',
      reportsTo: parsed.data.reportsTo,
    })
  } catch (err: any) {
    console.error('Update user reportsTo error:', err)
    res.status(500).json({ error: err.message || 'Failed to update reports to' })
  }
})

// Admin: Get users who can be managers (for reports-to dropdown)
// Returns users with manager, senior_manager, finance_manager, or admin roles
authRouter.get('/admin/potential-managers', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    // Get roles that can be managers
    const managerRoles = await db.collection('roles')
      .find({ name: { $in: ['admin', 'manager', 'senior_manager', 'finance_manager'] } })
      .toArray()
    
    const managerRoleIds = managerRoles.map((r: any) => r._id)

    // Get users with these roles
    const userRoles = await db.collection('user_roles')
      .find({ roleId: { $in: managerRoleIds } } as any)
      .toArray()
    
    const managerUserIds = [...new Set(userRoles.map((ur: any) => ur.userId))]

    // Get user details - convert string IDs to ObjectIds
    const managerObjectIds: ObjectId[] = []
    for (const id of managerUserIds) {
      try {
        managerObjectIds.push(new ObjectId(id))
      } catch {
        // Skip invalid IDs
      }
    }

    const managers = managerObjectIds.length > 0
      ? await db.collection('users')
          .find({ 
            $or: [
              { _id: { $in: managerObjectIds } },
              // Also include users with isAdmin flag for legacy admin users
              { isAdmin: true }
            ],
            status: { $ne: 'deleted' }
          })
          .project({ _id: 1, name: 1, email: 1 })
          .sort({ name: 1 })
          .toArray()
      : await db.collection('users')
          .find({ isAdmin: true, status: { $ne: 'deleted' } })
          .project({ _id: 1, name: 1, email: 1 })
          .sort({ name: 1 })
          .toArray()

    // Build role name lookup
    const userIdToRoles = new Map<string, string[]>()
    for (const ur of userRoles) {
      const role = managerRoles.find((r: any) => r._id.toString() === ur.roleId.toString())
      if (role) {
        if (!userIdToRoles.has(ur.userId)) {
          userIdToRoles.set(ur.userId, [])
        }
        userIdToRoles.get(ur.userId)!.push(role.name)
      }
    }

    const managersWithRoles = managers.map((m: any) => ({
      id: m._id.toString(),
      name: m.name || m.email,
      email: m.email,
      roles: userIdToRoles.get(m._id.toString()) || (m.isAdmin ? ['admin'] : []),
    }))

    res.json({ managers: managersWithRoles })
  } catch (err: any) {
    console.error('Get potential managers error:', err)
    res.status(500).json({ error: err.message || 'Failed to get potential managers' })
  }
})

// Admin: Update user password
authRouter.patch('/admin/users/:id/password', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    let userId: ObjectId
    try {
      userId = new ObjectId(req.params.id)
    } catch {
      return res.status(400).json({ error: 'Invalid user ID' })
    }

    const parsed = z.object({
      newPassword: z.string().min(6),
      forceChangeRequired: z.boolean().optional().default(false),
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }

    // Verify user exists
    const user = await db.collection('users').findOne({ _id: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, 10)

    // Update password
    await db.collection('users').updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash: newPasswordHash,
          passwordChangeRequired: parsed.data.forceChangeRequired,
          updatedAt: Date.now(),
        },
      }
    )

    // Revoke all user sessions to force re-login with new password
    try {
      const { revokeAllUserSessions } = await import('./sessions.js')
      await revokeAllUserSessions(userId.toString())
    } catch (sessionErr) {
      console.warn('Failed to revoke user sessions:', sessionErr)
    }

    res.json({
      message: `Password updated successfully${parsed.data.forceChangeRequired ? '. User will be required to change password on next login.' : ''}`,
    })
  } catch (err: any) {
    console.error('Update user password error:', err)
    res.status(500).json({ error: err.message || 'Failed to update password' })
  }
})

// Admin: Resend welcome email
authRouter.post('/admin/users/:id/resend-welcome', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    let userId: ObjectId
    try {
      userId = new ObjectId(req.params.id)
    } catch {
      return res.status(400).json({ error: 'Invalid user ID' })
    }

    // Verify user exists
    const user = await db.collection('users').findOne({ _id: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Reset password to new temporary password
    const { temporaryPassword, user: userInfo } = await resetUserToTemporaryPassword(userId.toString())

    // Revoke all user sessions to force re-login with new password
    try {
      const { revokeAllUserSessions } = await import('./sessions.js')
      await revokeAllUserSessions(userId.toString())
    } catch (sessionErr) {
      console.warn('Failed to revoke user sessions:', sessionErr)
    }

    // Send welcome email with new credentials
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const loginUrl = `${baseUrl}/login`

    try {
      await sendAuthEmail({
        to: userInfo.email,
        subject: 'Welcome to BOAZ-OS - Your Account Credentials',
        checkPreferences: false, // Skip preference check - always send welcome emails
        html: `
          <h2>Welcome to BOAZ-OS!</h2>
          <p>Your account has been created. Please use the following credentials to log in:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Email:</strong> ${userInfo.email}</p>
            <p><strong>Temporary Password:</strong> <code style="background-color: #e0e0e0; padding: 2px 6px; border-radius: 3px;">${temporaryPassword}</code></p>
          </div>
          <p><strong>Important:</strong> You will be required to change your password on first login.</p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Log In Now</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${loginUrl}</code></p>
          <p>Please keep your credentials secure and change your password immediately after logging in.</p>
        `,
        text: `
Welcome to BOAZ-OS!

Your account has been created. Please use the following credentials to log in:

Email: ${userInfo.email}
Temporary Password: ${temporaryPassword}

Important: You will be required to change your password on first login.

Log in at: ${loginUrl}

Please keep your credentials secure and change your password immediately after logging in.
        `,
      })

      res.json({
        message: 'Welcome email sent successfully with new temporary password',
        emailSent: true,
      })
    } catch (emailErr) {
      console.error('Failed to send welcome email:', emailErr)
      // Return the temporary password if email fails
      res.status(500).json({
        error: 'Failed to send email, but temporary password has been reset',
        message: 'Email could not be sent. Please share credentials manually.',
        temporaryPassword,
        emailSent: false,
      })
    }
  } catch (err: any) {
    console.error('Resend welcome email error:', err)
    res.status(500).json({ error: err.message || 'Failed to resend welcome email' })
  }
})

// Admin: Delete user
authRouter.delete('/admin/users/:id', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    let userId: ObjectId
    try {
      userId = new ObjectId(req.params.id)
    } catch {
      return res.status(400).json({ error: 'Invalid user ID' })
    }

    // Prevent deleting yourself
    const auth = (req as any).auth as { userId: string; email: string }
    if (auth.userId === userId.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    // Verify user exists
    const user = await db.collection('users').findOne({ _id: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const userIdStr = userId.toString()

    // Delete user roles
    await db.collection('user_roles').deleteMany({ userId: userIdStr } as any)

    // Revoke all user sessions
    try {
      const { revokeAllUserSessions } = await import('./sessions.js')
      await revokeAllUserSessions(userIdStr)
    } catch (sessionErr) {
      console.warn('Failed to revoke user sessions:', sessionErr)
    }

    // Delete user
    await db.collection('users').deleteOne({ _id: userId })

    res.json({ message: 'User deleted successfully' })
  } catch (err: any) {
    console.error('Delete user error:', err)
    res.status(500).json({ error: err.message || 'Failed to delete user' })
  }
})

// Admin: Get registration requests
authRouter.get('/admin/registration-requests', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined
    const requests = await getRegistrationRequests(status)
    res.json({ requests })
  } catch (err: any) {
    console.error('Get registration requests error:', err)
    res.status(500).json({ error: err.message || 'Failed to get registration requests' })
  }
})

// Admin: Approve registration request
authRouter.post('/admin/registration-requests/:id/approve', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const requestId = req.params.id
    
    const { user, enrollmentToken } = await approveRegistrationRequest(requestId, auth.userId)
    
    // Send enrollment email to the user
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const enrollmentUrl = `${baseUrl}/enroll?token=${enrollmentToken}`
    
    try {
      await sendAuthEmail({
        to: user.email,
        subject: 'Welcome to BOAZ-OS - Complete Your Account Setup',
        checkPreferences: false, // Always send for new account approval
        html: `
          <h2>Welcome to BOAZ-OS!</h2>
          <p>Your registration request has been approved! Your account has been created successfully.</p>
          <p>To complete your account setup and enable account recovery features, please click the link below:</p>
          <p><a href="${enrollmentUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Complete Account Setup</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${enrollmentUrl}</code></p>
          <p>This link will expire in 7 days.</p>
          <p>If you didn't request this account, please contact support.</p>
        `,
        text: `
Welcome to BOAZ-OS!

Your registration request has been approved! Your account has been created successfully.

To complete your account setup and enable account recovery features, please click the link below:

${enrollmentUrl}

This link will expire in 7 days.

If you didn't request this account, please contact support.
        `,
      })
      
      res.json({
        message: 'Registration request approved and enrollment email sent successfully',
        user,
        emailSent: true,
      })
    } catch (emailErr) {
      console.error('Failed to send enrollment email:', emailErr)
      res.status(201).json({
        message: 'Registration request approved, but email could not be sent',
        user,
        enrollmentToken, // Include token so admin can manually share it
        emailSent: false,
      })
    }
  } catch (err: any) {
    console.error('Approve registration request error:', err)
    if (err.message === 'Registration request not found or already processed') {
      return res.status(404).json({ error: err.message })
    }
    if (err.message === 'User already exists') {
      return res.status(409).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to approve registration request' })
  }
})

// Admin: Reject registration request
authRouter.post('/admin/registration-requests/:id/reject', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const requestId = req.params.id
    
    await rejectRegistrationRequest(requestId, auth.userId)
    
    res.json({ message: 'Registration request rejected successfully' })
  } catch (err: any) {
    console.error('Reject registration request error:', err)
    if (err.message === 'Registration request not found or already processed') {
      return res.status(404).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to reject registration request' })
  }
})

// Admin: Get application catalog
authRouter.get('/admin/applications', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    res.json({ applications: APPLICATION_CATALOG })
  } catch (err: any) {
    console.error('Get applications error:', err)
    res.status(500).json({ error: err.message || 'Failed to get applications' })
  }
})

// Admin: Get user's application access
authRouter.get('/admin/users/:id/applications', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const userId = req.params.id
    const accessList = await getUserAccessList(userId)
    res.json({ access: accessList })
  } catch (err: any) {
    console.error('Get user application access error:', err)
    res.status(500).json({ error: err.message || 'Failed to get user application access' })
  }
})

// Admin: Grant application access to user
authRouter.post('/admin/users/:id/applications', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const userId = req.params.id
    const parsed = z.object({
      appKey: z.string().min(1),
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors })
    }

    const access = await grantApplicationAccess(userId, parsed.data.appKey, auth.userId)
    res.json({ access, message: 'Application access granted successfully' })
  } catch (err: any) {
    console.error('Grant application access error:', err)
    if (err.message.includes('Invalid application key')) {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to grant application access' })
  }
})

// Admin: Revoke application access from user
authRouter.delete('/admin/users/:id/applications/:appKey', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const userId = req.params.id
    const appKey = req.params.appKey
    
    await revokeApplicationAccess(userId, appKey)
    res.json({ message: 'Application access revoked successfully' })
  } catch (err: any) {
    console.error('Revoke application access error:', err)
    if (err.message === 'Application access not found') {
      return res.status(404).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to revoke application access' })
  }
})

// Get current user's application access
authRouter.get('/me/applications', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const appKeys = await getUserApplicationAccess(auth.userId)
    res.json({ applications: appKeys })
  } catch (err: any) {
    console.error('Get user applications error:', err)
    res.status(500).json({ error: err.message || 'Failed to get applications' })
  }
})

// Check if current user has access to a specific application
authRouter.get('/me/applications/:appKey', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const appKey = req.params.appKey
    const hasAccess = await hasApplicationAccess(auth.userId, appKey)
    res.json({ hasAccess, appKey })
  } catch (err: any) {
    console.error('Check application access error:', err)
    res.status(500).json({ error: err.message || 'Failed to check application access' })
  }
})

// User: Request access to an application
authRouter.post('/me/applications/:appKey/request', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const appKey = req.params.appKey
    
    const request = await createApplicationAccessRequest(auth.userId, appKey)
    res.json({ request, message: 'Access request submitted successfully' })
  } catch (err: any) {
    console.error('Create application access request error:', err)
    if (err.message === 'User already has access to this application') {
      return res.status(400).json({ error: err.message })
    }
    if (err.message === 'Invalid application key') {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to create access request' })
  }
})

// User: Get their own application access requests
authRouter.get('/me/app-access-requests', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined
    const requests = await getUserApplicationAccessRequests(auth.userId, status)
    res.json({ requests })
  } catch (err: any) {
    console.error('Get user application access requests error:', err)
    res.status(500).json({ error: err.message || 'Failed to get application access requests' })
  }
})

// User: Get a specific access request by ID (if it belongs to them)
authRouter.get('/me/app-access-requests/:id', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const requestId = req.params.id
    
    const request = await getApplicationAccessRequestById(requestId)
    if (!request) {
      return res.status(404).json({ error: 'Request not found' })
    }
    
    // Ensure the request belongs to the current user
    if (request.userId !== auth.userId) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    res.json({ request })
  } catch (err: any) {
    console.error('Get application access request error:', err)
    res.status(500).json({ error: err.message || 'Failed to get application access request' })
  }
})

// Admin: Get application access requests
authRouter.get('/admin/app-access-requests', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined
    const requests = await getApplicationAccessRequests(status)
    res.json({ requests })
  } catch (err: any) {
    console.error('Get application access requests error:', err)
    res.status(500).json({ error: err.message || 'Failed to get application access requests' })
  }
})

// Admin: Approve application access request
authRouter.post('/admin/app-access-requests/:id/approve', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const requestId = req.params.id
    
    const access = await approveApplicationAccessRequest(requestId, auth.userId)
    
    // Get request details for email
    const requests = await getApplicationAccessRequests()
    const request = requests.find(r => r.id === requestId)
    if (!request) {
      throw new Error('Request not found')
    }

    // Get app info
    const appInfo = APPLICATION_CATALOG.find(app => app.key === request.appKey)
    const appName = appInfo?.name || request.appKey

    // Send email notification
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const marketplaceUrl = `${baseUrl}/marketplace`
    
    try {
      await sendAuthEmail({
        to: request.userEmail,
        subject: `Application Access Granted - ${appName}`,
        checkPreferences: true, // Respect user email preferences
        html: `
          <h2>Application Access Granted</h2>
          <p>Your request for access to <strong>${appName}</strong> has been approved!</p>
          <p>You can now install and use this application in your workspace.</p>
          <p><a href="${marketplaceUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Go to Marketplace</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${marketplaceUrl}</code></p>
        `,
        text: `
Application Access Granted

Your request for access to ${appName} has been approved!

You can now install and use this application in your workspace.

Go to Marketplace: ${marketplaceUrl}
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send access granted email:', emailErr)
      // Don't fail the approval if email fails
    }
    
    res.json({
      message: 'Application access request approved and access granted',
      access,
      emailSent: true,
    })
  } catch (err: any) {
    console.error('Approve application access request error:', err)
    if (err.message === 'Application access request not found or already processed') {
      return res.status(404).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to approve application access request' })
  }
})

// Admin: Reject application access request
authRouter.post('/admin/app-access-requests/:id/reject', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const requestId = req.params.id
    
    // Get request details before rejecting (to get user email and app info)
    const request = await getApplicationAccessRequestById(requestId)
    if (!request) {
      return res.status(404).json({ error: 'Application access request not found' })
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Application access request has already been processed' })
    }

    // Get app info
    const appInfo = APPLICATION_CATALOG.find(app => app.key === request.appKey)
    const appName = appInfo?.name || request.appKey

    // Reject the request
    await rejectApplicationAccessRequest(requestId, auth.userId)

    // Send email notification
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const supportUrl = `${baseUrl}/apps/support`
    
    try {
      await sendAuthEmail({
        to: request.userEmail,
        subject: `Application Access Request - ${appName}`,
        checkPreferences: true, // Respect user email preferences
        html: `
          <h2>Application Access Request Update</h2>
          <p>Your request for access to <strong>${appName}</strong> has been reviewed.</p>
          <p>Unfortunately, your request has been denied at this time. If you believe this is in error or would like to discuss your access needs, please contact your administrator or submit a support ticket.</p>
          <p><a href="${supportUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Contact Support</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${supportUrl}</code></p>
          <p>If you have questions about why your request was denied, please reach out to your administrator.</p>
        `,
        text: `
Application Access Request Update

Your request for access to ${appName} has been reviewed.

Unfortunately, your request has been denied at this time. If you believe this is in error or would like to discuss your access needs, please contact your administrator or submit a support ticket.

Contact Support: ${supportUrl}

If you have questions about why your request was denied, please reach out to your administrator.
        `,
      })
      
      res.json({
        message: 'Application access request rejected and email sent',
        emailSent: true,
      })
    } catch (emailErr) {
      console.error('Failed to send access denied email:', emailErr)
      // Don't fail the rejection if email fails
      res.json({
        message: 'Application access request rejected, but email failed to send',
        emailSent: false,
      })
    }
  } catch (err: any) {
    console.error('Reject application access request error:', err)
    if (err.message === 'Application access request not found or already processed') {
      return res.status(404).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to reject application access request' })
  }
})

// Admin: Generate access report
authRouter.get('/admin/access-report', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const report = await generateAccessReport()
    res.json({ report })
  } catch (err: any) {
    console.error('Generate access report error:', err)
    res.status(500).json({ error: err.message || 'Failed to generate access report' })
  }
})

// Get current user's roles
authRouter.get('/me/roles', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    const ObjectId = (await import('mongodb')).ObjectId
    
    // Get user's roles
    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    
    if (roleIds.length === 0) {
      return res.json({ roles: [], userId: auth.userId, email: auth.email })
    }

    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const allPerms = new Set<string>(roles.flatMap((r: any) => r.permissions || []))
    const isAdmin = allPerms.has('*')
    
    res.json({ 
      roles: roles.map((r: any) => ({ name: r.name, permissions: r.permissions || [] })),
      userId: auth.userId,
      email: auth.email,
      isAdmin,
    })
  } catch (err: any) {
    console.error('Get user roles error:', err)
    res.status(500).json({ error: err.message || 'Failed to get roles' })
  }
})

// Get all users with manager role (for quote approver selection)
authRouter.get('/managers', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    const ObjectId = (await import('mongodb')).ObjectId
    
    // Find manager role
    const managerRole = await db.collection('roles').findOne({ name: 'manager' })
    if (!managerRole) {
      return res.json({ managers: [] })
    }
    
    // Get all users with manager role
    const userRoles = await db.collection('user_roles').find({ roleId: managerRole._id } as any).toArray()
    const managerUserIds = userRoles.map((ur: any) => ur.userId)
    
    if (managerUserIds.length === 0) {
      return res.json({ managers: [] })
    }
    
    // Get user details
    const userIdObjects = managerUserIds.map((id: string) => {
      try {
        return new ObjectId(id)
      } catch {
        return null
      }
    }).filter(Boolean) as ObjectId[]
    
    const managers = await db.collection('users')
      .find({ _id: { $in: userIdObjects } })
      .sort({ name: 1, email: 1 })
      .toArray()
    
    const managersList = managers.map((m: any) => ({
      id: m._id.toString(),
      email: m.email,
      name: m.name || undefined,
    }))
    
    res.json({ managers: managersList })
  } catch (err: any) {
    console.error('Get managers error:', err)
    res.status(500).json({ error: err.message || 'Failed to get managers' })
  }
})

// Self-assign admin role (development/initial setup only - should be restricted in production)
authRouter.post('/me/self-assign-admin', requireAuth, async (req, res) => {
  try {
    // Only allow in development mode for security
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'This endpoint is disabled in production' })
    }

    const auth = (req as any).auth as { userId: string; email: string }
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'Database unavailable' })

    // Find admin role
    const adminRole = await db.collection('roles').findOne({ name: 'admin' })
    if (!adminRole) {
      return res.status(404).json({ error: 'Admin role not found. Run ensureDefaultRoles first.' })
    }

    // Check if user already has admin role
    const existing = await db.collection('user_roles').findOne({ 
      userId: auth.userId, 
      roleId: adminRole._id 
    })
    
    if (existing) {
      return res.json({ message: 'You already have admin role', roleId: adminRole._id.toString() })
    }

    // Assign admin role with timestamp
    await db.collection('user_roles').insertOne({ 
      _id: new ObjectId(),
      userId: auth.userId, 
      roleId: adminRole._id,
      createdAt: new Date()
    })

    res.json({ message: 'Admin role assigned successfully', roleId: adminRole._id.toString() })
  } catch (err: any) {
    console.error('Self-assign admin error:', err)
    res.status(500).json({ error: err.message || 'Failed to assign admin role' })
  }
})

// Update user profile (name, phone, work location)
authRouter.put('/me/profile', requireAuth, async (req, res) => {
  try {
    const parsed = z.object({
      name: z.string().transform((val) => (val.trim() === '' ? undefined : val.trim())).optional(),
      phoneNumber: z.string().transform((val) => (val.trim() === '' ? undefined : val.trim())).optional(),
      workLocation: z.string().transform((val) => (val.trim() === '' ? undefined : val.trim())).optional(),
    }).safeParse(req.body)
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    
    const auth = (req as any).auth as { userId: string; email: string }
    await updateUserProfile(auth.userId, parsed.data)
    res.json({ message: 'Profile updated successfully' })
  } catch (err: any) {
    console.error('Update profile error:', err)
    res.status(500).json({ error: err.message || 'Failed to update profile' })
  }
})

// Get current user's security questions (questions only, not answers)
authRouter.get('/me/security-questions', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const questions = await getUserSecurityQuestions(auth.userId)
    // Return null if no questions set, otherwise return array of questions
    res.json({ questions: questions || [] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Test/verify a security answer
authRouter.post('/me/test-security-answer', requireAuth, async (req, res) => {
  try {
    const parsed = z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
    }).safeParse(req.body)
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    
    const auth = (req as any).auth as { userId: string; email: string }
    const user = await getUserById(auth.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    const isValid = await verifySecurityAnswer(user.email, parsed.data.question, parsed.data.answer)
    res.json({ valid: isValid })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Update security questions (for logged-in users)
authRouter.put('/me/security-questions', requireAuth, async (req, res) => {
  try {
    const parsed = z.object({
      securityQuestions: z.array(securityQuestionSchema).length(3),
    }).safeParse(req.body)
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload. Exactly 3 security questions are required.' })
    }
    
    const auth = (req as any).auth as { userId: string; email: string }
    await updateSecurityQuestions(auth.userId, parsed.data.securityQuestions)
    res.json({ message: 'Security questions updated successfully' })
  } catch (err: any) {
    console.error('Update security questions error:', err)
    res.status(500).json({ error: err.message || 'Failed to update security questions' })
  }
})

// Enrollment: Verify token and get user info
authRouter.get('/enroll/verify', async (req, res) => {
  try {
    const token = req.query.token as string
    if (!token) {
      return res.status(400).json({ error: 'Token required' })
    }
    
    const userInfo = await verifyEnrollmentToken(token)
    if (!userInfo) {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }
    
    res.json({ email: userInfo.email })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Enrollment: Complete setup
authRouter.post('/enroll/complete', async (req, res) => {
  try {
    const parsed = z.object({
      token: z.string().min(1),
      securityQuestions: z.array(securityQuestionSchema).length(3),
    }).safeParse(req.body)
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload. Exactly 3 security questions are required.' })
    }
    
    const success = await completeEnrollment(parsed.data.token, parsed.data.securityQuestions)
    if (!success) {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }
    
    res.json({ message: 'Account setup completed successfully' })
  } catch (err: any) {
    console.error('Complete enrollment error:', err)
    res.status(500).json({ error: err.message || 'Failed to complete enrollment' })
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

// ── Audit Logging ──────────────────────────────────────────────────────

type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'token_refresh'
  | 'password_change'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'registration_request'
  | 'session_revoked'

async function logAuditEvent(opts: {
  action: AuditAction
  userId?: string | null
  email?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  meta?: Record<string, any> | null
}) {
  try {
    const db = await getDb()
    if (!db) return

    // Check if audit logging is enabled
    const setting = await db.collection('app_settings').findOne({ key: 'audit_logging_enabled' })
    if (setting && setting.value === false) return

    await db.collection('audit_logs').insertOne({
      action: opts.action,
      userId: opts.userId || null,
      email: opts.email || null,
      ipAddress: opts.ipAddress || null,
      userAgent: opts.userAgent || null,
      meta: opts.meta || null,
      createdAt: new Date(),
    })
  } catch {
    // Never let audit logging failures break the main flow
  }
}

// GET /api/auth/admin/audit-logs – paginated, searchable
authRouter.get('/admin/audit-logs', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(503).json({ data: null, error: 'db_unavailable' })

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const search = req.query.q ? String(req.query.q).trim() : ''
    const action = req.query.action ? String(req.query.action).trim() : ''

    const filter: any = {}
    if (action) {
      filter.action = action
    }
    if (search) {
      const regex = { $regex: search, $options: 'i' }
      filter.$or = [
        { email: regex },
        { userId: regex },
        { action: regex },
        { ipAddress: regex },
        { userAgent: regex },
      ]
    }

    const [items, total] = await Promise.all([
      db.collection('audit_logs').find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
      db.collection('audit_logs').countDocuments(filter),
    ])

    res.json({
      data: {
        items: items.map((d: any) => ({
          _id: String(d._id),
          action: d.action,
          userId: d.userId,
          email: d.email,
          ipAddress: d.ipAddress,
          userAgent: d.userAgent,
          meta: d.meta,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        })),
        total,
        limit,
        offset,
      },
      error: null,
    })
  } catch (err: any) {
    res.status(500).json({ data: null, error: err?.message || 'Failed to fetch audit logs' })
  }
})

// GET /api/auth/admin/audit-settings – get audit toggle status
authRouter.get('/admin/audit-settings', requireAuth, requirePermission('*'), async (_req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(503).json({ data: null, error: 'db_unavailable' })

    const setting = await db.collection('app_settings').findOne({ key: 'audit_logging_enabled' })
    res.json({ data: { enabled: setting ? setting.value !== false : true }, error: null })
  } catch (err: any) {
    res.status(500).json({ data: null, error: err?.message || 'Failed to fetch audit settings' })
  }
})

// PATCH /api/auth/admin/audit-settings – toggle audit logging on/off
authRouter.patch('/admin/audit-settings', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(503).json({ data: null, error: 'db_unavailable' })

    const enabled = Boolean(req.body?.enabled)
    await db.collection('app_settings').updateOne(
      { key: 'audit_logging_enabled' },
      { $set: { key: 'audit_logging_enabled', value: enabled, updatedAt: new Date() } },
      { upsert: true },
    )

    // Log the toggle itself
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    await logAuditEvent({
      action: enabled ? 'login_success' : 'logout', // repurpose for meta
      userId: auth?.userId,
      email: auth?.email,
      meta: { settingChanged: 'audit_logging_enabled', newValue: enabled },
    })

    res.json({ data: { enabled }, error: null })
  } catch (err: any) {
    res.status(500).json({ data: null, error: err?.message || 'Failed to update audit settings' })
  }
})

// ── Activity Logging Admin Routes ───────────────────────────────────────

// GET /api/auth/admin/activity-logs – paginated, searchable
authRouter.get('/admin/activity-logs', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(503).json({ data: null, error: 'db_unavailable' })

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const search = req.query.q ? String(req.query.q).trim() : ''
    const method = req.query.method ? String(req.query.method).trim().toUpperCase() : ''

    const filter: any = {}
    if (method) filter.method = method
    if (search) {
      const regex = { $regex: search, $options: 'i' }
      filter.$or = [
        { email: regex },
        { userId: regex },
        { path: regex },
        { ipAddress: regex },
        { method: regex },
      ]
    }

    const [items, total] = await Promise.all([
      db.collection('activity_logs').find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
      db.collection('activity_logs').countDocuments(filter),
    ])

    res.json({
      data: {
        items: items.map((d: any) => ({
          _id: String(d._id),
          method: d.method,
          path: d.path,
          statusCode: d.statusCode,
          userId: d.userId,
          email: d.email,
          ipAddress: d.ipAddress,
          userAgent: d.userAgent,
          durationMs: d.durationMs,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        })),
        total,
        limit,
        offset,
      },
      error: null,
    })
  } catch (err: any) {
    res.status(500).json({ data: null, error: err?.message || 'Failed to fetch activity logs' })
  }
})

// GET /api/auth/admin/activity-settings – get activity logging toggle status
authRouter.get('/admin/activity-settings', requireAuth, requirePermission('*'), async (_req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(503).json({ data: null, error: 'db_unavailable' })

    const setting = await db.collection('app_settings').findOne({ key: 'activity_logging_enabled' })
    res.json({ data: { enabled: setting ? setting.value !== false : true }, error: null })
  } catch (err: any) {
    res.status(500).json({ data: null, error: err?.message || 'Failed to fetch activity settings' })
  }
})

// PATCH /api/auth/admin/activity-settings – toggle activity logging on/off
authRouter.patch('/admin/activity-settings', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(503).json({ data: null, error: 'db_unavailable' })

    const enabled = Boolean(req.body?.enabled)
    await db.collection('app_settings').updateOne(
      { key: 'activity_logging_enabled' },
      { $set: { key: 'activity_logging_enabled', value: enabled, updatedAt: new Date() } },
      { upsert: true },
    )
    res.json({ data: { enabled }, error: null })
  } catch (err: any) {
    res.status(500).json({ data: null, error: err?.message || 'Failed to update activity settings' })
  }
})

export { logAuditEvent, type AuditAction }

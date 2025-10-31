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
} from './store.js'
import { hasEmailNotificationsEnabled } from './preferences-helper.js'
import { signToken, verifyToken, signAccessToken, signRefreshToken, verifyAny } from './jwt.js'
import { requireAuth, requirePermission } from './rbac.js'
import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
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
    
    const { email, password, name, securityQuestions, phoneNumber, workLocation } = parsed.data
    console.log('Registration attempt for:', email)
    
    const user = await createUser(email, password, name, securityQuestions, phoneNumber, workLocation)
    
    // Send enrollment email if security questions weren't provided during registration
    if (!securityQuestions || securityQuestions.length !== 3) {
      try {
        // Check if user wants to receive email notifications
        // Note: For new registrations, user won't have preferences yet, so this will default to true
        const notificationsEnabled = await hasEmailNotificationsEnabled(user.id, email)
        
        if (notificationsEnabled !== false) {
          const enrollmentToken = await createEnrollmentToken(email)
          if (!enrollmentToken.startsWith('dummy-token-')) {
            const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
            const enrollmentUrl = `${baseUrl}/enroll?token=${enrollmentToken}`
            
            // Use checkPreferences: false since we already checked above
            await sendAuthEmail({
              to: email,
              subject: 'Welcome to BOAZ-OS - Complete Your Account Setup',
              checkPreferences: false,
              html: `
              <h2>Welcome to BOAZ-OS!</h2>
              <p>Thank you for creating your account. To complete your account setup and enable account recovery features, please click the link below:</p>
              <p><a href="${enrollmentUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Complete Account Setup</a></p>
              <p>Or copy and paste this URL into your browser:</p>
              <p><code>${enrollmentUrl}</code></p>
              <p>This link will expire in 7 days.</p>
              <p>If you didn't create this account, please ignore this email.</p>
            `,
              text: `
Welcome to BOAZ-OS!

Thank you for creating your account. To complete your account setup and enable account recovery features, please click the link below:

${enrollmentUrl}

This link will expire in 7 days.

If you didn't create this account, please ignore this email.
            `,
            })
          }
        }
      } catch (emailErr) {
        // Log error but don't fail registration
        console.error('Failed to send enrollment email:', emailErr)
      }
    }
    
    const access = signAccessToken({ sub: user.id, email: user.email })
    const jti = randomUUID()
    const refresh = signRefreshToken({ sub: user.id, email: user.email, jti })
    
    // Store session in database
    try {
      await createSession(jti, user.id, email, getClientIp(req), getUserAgent(req))
    } catch (sessionErr) {
      console.error('Failed to create session:', sessionErr)
      // Continue anyway - session might work with in-memory fallback
    }
    
    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 })
    const body: AuthResponse = { token: access, user }
    res.status(201).json(body)
  } catch (err: any) {
    console.error('Registration error:', err)
    console.error('Error stack:', err.stack)
    console.error('Error name:', err.name)
    console.error('Error code:', err.code)
    
    if (err.message === 'Email already registered') {
      return res.status(409).json({ error: 'Email already registered' })
    }
    if (err.message === 'Database unavailable') {
      return res.status(503).json({ error: 'Service unavailable' })
    }
    
    // Include error details to help debug
    const errorResponse: any = { 
      error: 'Registration failed',
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
  if (rt) {
    const payload = verifyAny<{ sub?: string; jti?: string }>(rt)
    if (payload?.jti && payload?.sub) {
      await revokeSession(payload.jti, payload.sub)
    }
  }
  res.clearCookie('refresh_token', { ...cookieOpts, maxAge: 0 })
  res.json({ ok: true })
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
    
    const roles = await db.collection('roles').find({}).sort({ name: 1 }).toArray()
    res.json({ roles: roles.map(r => ({ id: r._id.toString(), name: r.name, permissions: r.permissions || [] })) })
  } catch (err: any) {
    console.error('Get roles error:', err)
    res.status(500).json({ error: err.message || 'Failed to get roles' })
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
    const bcrypt = await import('bcryptjs')
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



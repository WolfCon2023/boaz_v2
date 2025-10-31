import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { getDb } from '../db.js'

export type User = {
  id: string
  email: string
  name?: string
  createdAt: number
}

type UserDoc = {
  _id: ObjectId
  email: string
  passwordHash: string
  name?: string
  verified: boolean
  failedAttempts: number
  lockoutUntil: Date | null
  securityQuestion?: string
  securityAnswerHash?: string
  passwordResetToken?: string
  passwordResetExpires?: Date
  createdAt: number
  updatedAt: number
}

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

// Ensure users collection and indexes exist
async function ensureUsersCollection(db: any) {
  try {
    const collections = await db.listCollections({ name: 'users' }).toArray()
    if (collections.length === 0) {
      // Collection doesn't exist, create it
      await db.createCollection('users')
    }
    // Ensure unique index on email exists
    const indexes = await db.collection('users').listIndexes().toArray()
    const hasEmailIndex = indexes.some((idx: any) => idx.key?.email === 1)
    if (!hasEmailIndex) {
      await db.collection('users').createIndex({ email: 1 }, { unique: true })
    }
  } catch (err) {
    // If collection/index already exists or creation fails, that's okay
    // MongoDB will handle it gracefully
    console.warn('Warning: Could not ensure users collection/index:', err)
  }
}

export async function createUser(
  email: string,
  password: string,
  name?: string,
  securityQuestion?: string,
  securityAnswer?: string
): Promise<User> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  // Ensure collection and indexes exist
  await ensureUsersCollection(db)

  const emailLower = email.toLowerCase()
  
  // Check if user already exists
  const existing = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  if (existing) throw new Error('Email already registered')

  const passwordHash = await bcrypt.hash(password, 10)
  const securityAnswerHash = securityAnswer ? await bcrypt.hash(securityAnswer.toLowerCase().trim(), 10) : undefined
  
  const now = Date.now()
  const userDoc: UserDoc = {
    _id: new ObjectId(),
    email: emailLower,
    passwordHash,
    name: name?.trim() || undefined, // Convert empty string to undefined
    verified: false,
    failedAttempts: 0,
    lockoutUntil: null,
    securityQuestion: securityQuestion?.trim(),
    securityAnswerHash,
    createdAt: now,
    updatedAt: now,
  }

  try {
    await db.collection<UserDoc>('users').insertOne(userDoc)
  } catch (insertErr: any) {
    // Handle duplicate key error (unique index on email)
    if (insertErr && typeof insertErr === 'object' && 'code' in insertErr && insertErr.code === 11000) {
      throw new Error('Email already registered')
    }
    // Re-throw other errors
    throw insertErr
  }

  return {
    id: userDoc._id.toString(),
    email: userDoc.email,
    name: userDoc.name,
    createdAt: userDoc.createdAt,
  }
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  if (!userDoc) {
    // Don't reveal whether email exists or not (security best practice)
    return null
  }

  // Check if account is locked out
  if (userDoc.lockoutUntil && userDoc.lockoutUntil > new Date()) {
    return null // Account is locked
  }

  // If lockout period has passed, reset failed attempts
  if (userDoc.lockoutUntil && userDoc.lockoutUntil <= new Date()) {
    await db.collection<UserDoc>('users').updateOne(
      { _id: userDoc._id },
      {
        $set: {
          failedAttempts: 0,
          lockoutUntil: null,
          updatedAt: Date.now(),
        },
      }
    )
    userDoc.failedAttempts = 0
    userDoc.lockoutUntil = null
  }

  // Verify password
  const ok = await bcrypt.compare(password, userDoc.passwordHash)

  if (!ok) {
    // Increment failed attempts
    const newFailedAttempts = userDoc.failedAttempts + 1
    const lockoutUntil =
      newFailedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS)
        : null

    await db.collection<UserDoc>('users').updateOne(
      { _id: userDoc._id },
      {
        $set: {
          failedAttempts: newFailedAttempts,
          lockoutUntil,
          updatedAt: Date.now(),
        },
      }
    )

    return null
  }

  // Password correct - reset failed attempts if any
  if (userDoc.failedAttempts > 0) {
    await db.collection<UserDoc>('users').updateOne(
      { _id: userDoc._id },
      {
        $set: {
          failedAttempts: 0,
          lockoutUntil: null,
          updatedAt: Date.now(),
        },
      }
    )
  }

  return {
    id: userDoc._id.toString(),
    email: userDoc.email,
    name: userDoc.name,
    createdAt: userDoc.createdAt,
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb()
  if (!db) return null

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  if (!userDoc) return null

  return {
    id: userDoc._id.toString(),
    email: userDoc.email,
    name: userDoc.name,
    createdAt: userDoc.createdAt,
  }
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb()
  if (!db) return null

  let objectId: ObjectId
  try {
    objectId = new ObjectId(id)
  } catch {
    return null
  }

  const userDoc = await db.collection<UserDoc>('users').findOne({ _id: objectId })
  
  if (!userDoc) return null

  return {
    id: userDoc._id.toString(),
    email: userDoc.email,
    name: userDoc.name,
    createdAt: userDoc.createdAt,
  }
}

export async function verifySecurityAnswer(email: string, answer: string): Promise<boolean> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  if (!userDoc || !userDoc.securityAnswerHash) return false

  return await bcrypt.compare(answer.toLowerCase().trim(), userDoc.securityAnswerHash)
}

export async function getUserSecurityQuestion(email: string): Promise<string | null> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  return userDoc?.securityQuestion || null
}

export async function createPasswordResetToken(email: string): Promise<string> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  if (!userDoc) {
    // Don't reveal whether email exists (security best practice)
    // Generate a token anyway but don't store it
    return 'dummy-token-' + Date.now()
  }

  // Generate secure token
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await db.collection<UserDoc>('users').updateOne(
    { _id: userDoc._id },
    {
      $set: {
        passwordResetToken: token,
        passwordResetExpires: expires,
        updatedAt: Date.now(),
      },
    }
  )

  return token
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const userDoc = await db.collection<UserDoc>('users').findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  })

  if (!userDoc) return false

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await db.collection<UserDoc>('users').updateOne(
    { _id: userDoc._id },
    {
      $set: {
        passwordHash,
        passwordResetToken: undefined,
        passwordResetExpires: undefined,
        failedAttempts: 0,
        lockoutUntil: null,
        updatedAt: Date.now(),
      },
    }
  )

  return true
}



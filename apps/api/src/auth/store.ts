import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { randomBytes, randomInt } from 'node:crypto'
import { getDb } from '../db.js'
import type { RoleDoc, UserRoleDoc } from './rbac.js'

export type User = {
  id: string
  email: string
  name?: string
  phoneNumber?: string
  workLocation?: string
  createdAt: number
}

type SecurityQuestion = {
  question: string
  answerHash: string
}

type UserDoc = {
  _id: ObjectId
  email: string
  passwordHash: string
  name?: string
  phoneNumber?: string
  workLocation?: string
  verified: boolean
  failedAttempts: number
  lockoutUntil: Date | null
  securityQuestions?: SecurityQuestion[] // Array of 3 security questions
  passwordResetToken?: string
  passwordResetExpires?: Date
  passwordChangeRequired?: boolean // If true, user must change password on next login
  createdAt: number
  updatedAt: number
}

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

// Ensure users collection and indexes exist
async function ensureUsersCollection(db: any) {
  try {
    // Try to create index first (MongoDB will auto-create collection if needed)
    // This is safer than checking if collection exists
    await db.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {
      // Index might already exist, that's fine
    })
  } catch (err) {
    // If index creation fails completely, log but don't throw
    // MongoDB will handle duplicate index errors gracefully
    console.warn('Warning: Could not ensure users collection/index:', err)
  }
}

export async function createUser(
  email: string,
  password: string,
  name?: string,
  securityQuestions?: Array<{ question: string; answer: string }>,
  phoneNumber?: string,
  workLocation?: string
): Promise<User> {
  console.log('createUser called for:', email)
  
  const db = await getDb()
  if (!db) {
    console.error('Database connection failed - getDb returned null')
    throw new Error('Database unavailable')
  }
  
  console.log('Database connected, database name:', db.databaseName)

  // Ensure collection and indexes exist
  try {
    await ensureUsersCollection(db)
    console.log('Users collection/index ensured')
  } catch (err) {
    console.error('Error ensuring users collection:', err)
    // Continue anyway - MongoDB might handle it
  }

  const emailLower = email.toLowerCase()
  
  // Check if user already exists
  console.log('Checking for existing user:', emailLower)
  const existing = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  if (existing) {
    console.log('User already exists')
    throw new Error('Email already registered')
  }

  console.log('Hashing password...')
  const passwordHash = await bcrypt.hash(password, 10)
  
  // Process security questions if provided
  let processedSecurityQuestions: SecurityQuestion[] | undefined
  if (securityQuestions && securityQuestions.length > 0) {
    processedSecurityQuestions = await Promise.all(
      securityQuestions.map(async (sq) => ({
        question: sq.question.trim(),
        answerHash: await bcrypt.hash(sq.answer.toLowerCase().trim(), 10),
      }))
    )
  }
  
  console.log('Password hashed')
  
  const now = Date.now()
  const userDoc: UserDoc = {
    _id: new ObjectId(),
    email: emailLower,
    passwordHash,
    name: name?.trim() || undefined, // Convert empty string to undefined
    phoneNumber: phoneNumber?.trim() || undefined,
    workLocation: workLocation?.trim() || undefined,
    verified: !!(securityQuestions && securityQuestions.length >= 3), // Verified if all 3 questions provided
    failedAttempts: 0,
    lockoutUntil: null,
    securityQuestions: processedSecurityQuestions,
    createdAt: now,
    updatedAt: now,
  }

  console.log('Inserting user document...')
  try {
    const result = await db.collection<UserDoc>('users').insertOne(userDoc)
    console.log('User inserted successfully, ID:', result.insertedId)
  } catch (insertErr: any) {
    console.error('Insert error:', insertErr)
    console.error('Insert error code:', insertErr?.code)
    console.error('Insert error message:', insertErr?.message)
    
    // Handle duplicate key error (unique index on email)
    if (insertErr && typeof insertErr === 'object' && 'code' in insertErr && insertErr.code === 11000) {
      console.log('Duplicate email detected (11000 error)')
      throw new Error('Email already registered')
    }
    // Re-throw other errors
    console.error('Re-throwing insert error')
    throw insertErr
  }

  return {
    id: userDoc._id.toString(),
    email: userDoc.email,
    name: userDoc.name,
    createdAt: userDoc.createdAt,
  }
}

export type VerifyCredentialsResult = {
  user: User
  passwordChangeRequired: boolean
} | null

export async function verifyCredentials(email: string, password: string): Promise<VerifyCredentialsResult> {
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
    user: {
      id: userDoc._id.toString(),
      email: userDoc.email,
      name: userDoc.name,
      phoneNumber: userDoc.phoneNumber,
      workLocation: userDoc.workLocation,
      createdAt: userDoc.createdAt,
    },
    passwordChangeRequired: userDoc.passwordChangeRequired || false,
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
    phoneNumber: userDoc.phoneNumber,
    workLocation: userDoc.workLocation,
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
    phoneNumber: userDoc.phoneNumber,
    workLocation: userDoc.workLocation,
    createdAt: userDoc.createdAt,
  }
}

export async function updateUserProfile(
  userId: string,
  updates: { name?: string; phoneNumber?: string; workLocation?: string }
): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    throw new Error('Invalid user ID')
  }

  const updateFields: any = {
    updatedAt: Date.now(),
  }

  if (updates.name !== undefined) {
    updateFields.name = updates.name.trim() || undefined
  }
  if (updates.phoneNumber !== undefined) {
    updateFields.phoneNumber = updates.phoneNumber.trim() || undefined
  }
  if (updates.workLocation !== undefined) {
    updateFields.workLocation = updates.workLocation.trim() || undefined
  }

  await db.collection<UserDoc>('users').updateOne(
    { _id: objectId },
    { $set: updateFields }
  )
}

export async function getUserSecurityQuestions(userId: string): Promise<string[] | null> {
  const db = await getDb()
  if (!db) return null

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    return null
  }

  const userDoc = await db.collection<UserDoc>('users').findOne({ _id: objectId })
  
  if (!userDoc || !userDoc.securityQuestions || userDoc.securityQuestions.length === 0) {
    return null
  }

  // Return only the questions, not the answers
  return userDoc.securityQuestions.map((sq) => sq.question)
}

export async function verifySecurityAnswer(email: string, question: string, answer: string): Promise<boolean> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  if (!userDoc || !userDoc.securityQuestions || userDoc.securityQuestions.length === 0) return false

  // Find the matching question and verify the answer
  const matchingQuestion = userDoc.securityQuestions.find(
    (sq) => sq.question.toLowerCase().trim() === question.toLowerCase().trim()
  )
  
  if (!matchingQuestion) return false

  return await bcrypt.compare(answer.toLowerCase().trim(), matchingQuestion.answerHash)
}

export async function getRandomSecurityQuestion(email: string): Promise<{ question: string; index: number } | null> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  if (!userDoc || !userDoc.securityQuestions || userDoc.securityQuestions.length === 0) {
    return null
  }

  // Randomly select one of the security questions
  const randomIndex = Math.floor(Math.random() * userDoc.securityQuestions.length)
  const selectedQuestion = userDoc.securityQuestions[randomIndex]

  return {
    question: selectedQuestion.question,
    index: randomIndex,
  }
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

  // Only match tokens that don't start with 'enroll_' (enrollment tokens)
  const userDoc = await db.collection<UserDoc>('users').findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  })

  // Additional check: ensure this is not an enrollment token
  if (!userDoc || userDoc.passwordResetToken?.startsWith('enroll_')) {
    return false
  }

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
        verified: true, // User has verified email access by using reset token
        updatedAt: Date.now(),
      },
    }
  )

  return true
}

export async function createEnrollmentToken(email: string): Promise<string> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const emailLower = email.toLowerCase()
  const userDoc = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  
  if (!userDoc) {
    // Don't reveal whether email exists (security best practice)
    return 'dummy-token-' + Date.now()
  }

  // Generate secure token
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // Store enrollment token (we can reuse passwordResetToken field for enrollment, or create new field)
  // For simplicity, using a naming convention - enrollment tokens start with 'enroll_'
  await db.collection<UserDoc>('users').updateOne(
    { _id: userDoc._id },
    {
      $set: {
        passwordResetToken: `enroll_${token}`,
        passwordResetExpires: expires,
        updatedAt: Date.now(),
      },
    }
  )

  return token
}

export async function verifyEnrollmentToken(token: string): Promise<{ userId: string; email: string } | null> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const userDoc = await db.collection<UserDoc>('users').findOne({
    passwordResetToken: `enroll_${token}`,
    passwordResetExpires: { $gt: new Date() },
  })

  if (!userDoc) return null

  return {
    userId: userDoc._id.toString(),
    email: userDoc.email,
  }
}

export async function updateSecurityQuestions(
  userId: string,
  securityQuestions: Array<{ question: string; answer: string }>
): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  if (!securityQuestions || securityQuestions.length !== 3) {
    throw new Error('Exactly 3 security questions are required')
  }

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    throw new Error('Invalid user ID')
  }

  // Hash all answers
  const processedSecurityQuestions: SecurityQuestion[] = await Promise.all(
    securityQuestions.map(async (sq) => ({
      question: sq.question.trim(),
      answerHash: await bcrypt.hash(sq.answer.toLowerCase().trim(), 10),
    }))
  )

  await db.collection<UserDoc>('users').updateOne(
    { _id: objectId },
    {
      $set: {
        securityQuestions: processedSecurityQuestions,
        verified: true,
        updatedAt: Date.now(),
      },
    }
  )
}

export async function completeEnrollment(
  token: string,
  securityQuestions: Array<{ question: string; answer: string }>
): Promise<boolean> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  if (!securityQuestions || securityQuestions.length !== 3) {
    return false
  }

  const userInfo = await verifyEnrollmentToken(token)
  if (!userInfo) return false

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userInfo.userId)
  } catch {
    return false
  }

  // Hash all answers
  const processedSecurityQuestions: SecurityQuestion[] = await Promise.all(
    securityQuestions.map(async (sq) => ({
      question: sq.question.trim(),
      answerHash: await bcrypt.hash(sq.answer.toLowerCase().trim(), 10),
    }))
  )

  await db.collection<UserDoc>('users').updateOne(
    { _id: objectId },
    {
      $set: {
        securityQuestions: processedSecurityQuestions,
        verified: true,
        passwordResetToken: undefined,
        passwordResetExpires: undefined,
        updatedAt: Date.now(),
      },
    }
  )

  return true
}

/**
 * Generates a secure random password
 */
function generateTemporaryPassword(): string {
  // Generate a password with: 2 uppercase, 2 lowercase, 2 numbers, 2 special chars
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // Exclude confusing characters
  const lowercase = 'abcdefghijkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '!@#$%&*'
  
  let password = ''
  password += uppercase[randomInt(0, uppercase.length)]
  password += uppercase[randomInt(0, uppercase.length)]
  password += lowercase[randomInt(0, lowercase.length)]
  password += lowercase[randomInt(0, lowercase.length)]
  password += numbers[randomInt(0, numbers.length)]
  password += numbers[randomInt(0, numbers.length)]
  password += special[randomInt(0, special.length)]
  password += special[randomInt(0, special.length)]
  
  // Shuffle the password
  return password.split('').sort(() => randomInt(0, 2) - 1).join('')
}

/**
 * Creates a new user by admin with a temporary password
 * The user will be required to change their password on first login
 */
export async function createUserByAdmin(
  email: string,
  name?: string,
  phoneNumber?: string,
  workLocation?: string
): Promise<{ user: User; temporaryPassword: string }> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureUsersCollection(db)

  const emailLower = email.toLowerCase()
  
  // Check if user already exists
  const existing = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  if (existing) {
    throw new Error('Email already registered')
  }

  // Generate temporary password
  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await bcrypt.hash(temporaryPassword, 10)

  const now = Date.now()
  const userDoc: UserDoc = {
    _id: new ObjectId(),
    email: emailLower,
    passwordHash,
    name: name?.trim() || undefined,
    phoneNumber: phoneNumber?.trim() || undefined,
    workLocation: workLocation?.trim() || undefined,
    verified: false,
    failedAttempts: 0,
    lockoutUntil: null,
    passwordChangeRequired: true, // Force password change on first login
    createdAt: now,
    updatedAt: now,
  }

  try {
    await db.collection<UserDoc>('users').insertOne(userDoc)
  } catch (insertErr: any) {
    if (insertErr && typeof insertErr === 'object' && 'code' in insertErr && insertErr.code === 11000) {
      throw new Error('Email already registered')
    }
    throw insertErr
  }

  return {
    user: {
      id: userDoc._id.toString(),
      email: userDoc.email,
      name: userDoc.name,
      phoneNumber: userDoc.phoneNumber,
      workLocation: userDoc.workLocation,
      createdAt: userDoc.createdAt,
    },
    temporaryPassword,
  }
}

/**
 * Changes the password for an authenticated user
 * This is different from resetPasswordWithToken which uses a reset token
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    return false
  }

  const userDoc = await db.collection<UserDoc>('users').findOne({ _id: objectId })
  if (!userDoc) {
    return false
  }

  // Verify current password
  const ok = await bcrypt.compare(currentPassword, userDoc.passwordHash)
  if (!ok) {
    return false
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, 10)

  // Update password, clear passwordChangeRequired flag, and verify user
  // If user can log in and change password, they've verified their email/account
  await db.collection<UserDoc>('users').updateOne(
    { _id: objectId },
    {
      $set: {
        passwordHash: newPasswordHash,
        passwordChangeRequired: false,
        verified: true,
        updatedAt: Date.now(),
      },
    }
  )

  return true
}

/**
 * Resets a user's password to a new temporary password and returns it
 * Used for resending welcome emails
 */
export async function resetUserToTemporaryPassword(userId: string): Promise<{ temporaryPassword: string; user: User }> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    throw new Error('Invalid user ID')
  }

  const userDoc = await db.collection<UserDoc>('users').findOne({ _id: objectId })
  if (!userDoc) {
    throw new Error('User not found')
  }

  // Generate new temporary password
  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await bcrypt.hash(temporaryPassword, 10)

  // Update password and set passwordChangeRequired
  await db.collection<UserDoc>('users').updateOne(
    { _id: objectId },
    {
      $set: {
        passwordHash,
        passwordChangeRequired: true,
        verified: false, // Reset verification status since password changed
        updatedAt: Date.now(),
      },
    }
  )

  return {
    temporaryPassword,
    user: {
      id: userDoc._id.toString(),
      email: userDoc.email,
      name: userDoc.name,
      phoneNumber: userDoc.phoneNumber,
      workLocation: userDoc.workLocation,
      createdAt: userDoc.createdAt,
    },
  }
}

// Registration Request Types
export type RegistrationRequest = {
  id: string
  email: string
  password: string // Not returned, kept for type compatibility
  name?: string
  phoneNumber?: string
  workLocation?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  reviewedAt?: number
  reviewedBy?: string
}

type RegistrationRequestDoc = {
  _id: ObjectId
  email: string
  passwordHash: string
  name?: string
  phoneNumber?: string
  workLocation?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  reviewedAt?: number
  reviewedBy?: string // userId of admin who reviewed
}

// Ensure registration_requests collection and indexes
async function ensureRegistrationRequestsCollection(db: any) {
  try {
    await db.collection('registration_requests').createIndex({ email: 1 }).catch(() => {})
    await db.collection('registration_requests').createIndex({ status: 1 }).catch(() => {})
    await db.collection('registration_requests').createIndex({ createdAt: -1 }).catch(() => {})
  } catch (err) {
    console.warn('Warning: Could not ensure registration_requests collection/index:', err)
  }
}

export async function createRegistrationRequest(
  email: string,
  password: string,
  name?: string,
  phoneNumber?: string,
  workLocation?: string
): Promise<RegistrationRequest> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureRegistrationRequestsCollection(db)

  const emailLower = email.toLowerCase()

  // Check if user already exists
  const existingUser = await db.collection<UserDoc>('users').findOne({ email: emailLower })
  if (existingUser) {
    throw new Error('Email already registered')
  }

  // Check if there's already a pending request for this email
  const existingRequest = await db.collection<RegistrationRequestDoc>('registration_requests').findOne({
    email: emailLower,
    status: 'pending',
  })
  if (existingRequest) {
    throw new Error('Registration request already pending for this email')
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const now = Date.now()

  const requestDoc: RegistrationRequestDoc = {
    _id: new ObjectId(),
    email: emailLower,
    passwordHash,
    name: name?.trim() || undefined,
    phoneNumber: phoneNumber?.trim() || undefined,
    workLocation: workLocation?.trim() || undefined,
    status: 'pending',
    createdAt: now,
  }

  await db.collection<RegistrationRequestDoc>('registration_requests').insertOne(requestDoc)

  return {
    id: requestDoc._id.toString(),
    email: requestDoc.email,
    password: '', // Don't return password hash
    name: requestDoc.name,
    phoneNumber: requestDoc.phoneNumber,
    workLocation: requestDoc.workLocation,
    status: requestDoc.status,
    createdAt: requestDoc.createdAt,
  }
}

export async function getRegistrationRequests(status?: 'pending' | 'approved' | 'rejected'): Promise<RegistrationRequest[]> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  const query: any = {}
  if (status) {
    query.status = status
  }

  const requests = await db.collection<RegistrationRequestDoc>('registration_requests')
    .find(query)
    .sort({ createdAt: -1 })
    .toArray()

  return requests.map((req) => ({
    id: req._id.toString(),
    email: req.email,
    password: '', // Don't return password hash
    name: req.name,
    phoneNumber: req.phoneNumber,
    workLocation: req.workLocation,
    status: req.status,
    createdAt: req.createdAt,
    reviewedAt: req.reviewedAt,
    reviewedBy: req.reviewedBy,
  }))
}

export async function approveRegistrationRequest(
  requestId: string,
  reviewedByUserId: string
): Promise<{ user: User; enrollmentToken: string }> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  let requestObjectId: ObjectId
  try {
    requestObjectId = new ObjectId(requestId)
  } catch {
    throw new Error('Invalid request ID')
  }

  const requestDoc = await db.collection<RegistrationRequestDoc>('registration_requests').findOne({
    _id: requestObjectId,
    status: 'pending',
  })

  if (!requestDoc) {
    throw new Error('Registration request not found or already processed')
  }

  // Check if user already exists (race condition check)
  const existingUser = await db.collection<UserDoc>('users').findOne({ email: requestDoc.email })
  if (existingUser) {
    // Mark request as approved anyway for record-keeping
    await db.collection<RegistrationRequestDoc>('registration_requests').updateOne(
      { _id: requestObjectId },
      {
        $set: {
          status: 'approved',
          reviewedAt: Date.now(),
          reviewedBy: reviewedByUserId,
        },
      }
    )
    throw new Error('User already exists')
  }

  // Create the user account
  const userDoc: UserDoc = {
    _id: new ObjectId(),
    email: requestDoc.email,
    passwordHash: requestDoc.passwordHash,
    name: requestDoc.name,
    phoneNumber: requestDoc.phoneNumber,
    workLocation: requestDoc.workLocation,
    verified: false, // User needs to complete enrollment
    failedAttempts: 0,
    lockoutUntil: null,
    securityQuestions: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await db.collection<UserDoc>('users').insertOne(userDoc)

  // Mark request as approved
  await db.collection<RegistrationRequestDoc>('registration_requests').updateOne(
    { _id: requestObjectId },
    {
      $set: {
        status: 'approved',
        reviewedAt: Date.now(),
        reviewedBy: reviewedByUserId,
      },
    }
  )

  // Create enrollment token
  const enrollmentToken = await createEnrollmentToken(userDoc.email)

  return {
    user: {
      id: userDoc._id.toString(),
      email: userDoc.email,
      name: userDoc.name,
      phoneNumber: userDoc.phoneNumber,
      workLocation: userDoc.workLocation,
      createdAt: userDoc.createdAt,
    },
    enrollmentToken,
  }
}

export async function rejectRegistrationRequest(requestId: string, reviewedByUserId: string): Promise<void> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  let requestObjectId: ObjectId
  try {
    requestObjectId = new ObjectId(requestId)
  } catch {
    throw new Error('Invalid request ID')
  }

  const result = await db.collection<RegistrationRequestDoc>('registration_requests').updateOne(
    { _id: requestObjectId, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        reviewedAt: Date.now(),
        reviewedBy: reviewedByUserId,
      },
    }
  )

  if (result.matchedCount === 0) {
    throw new Error('Registration request not found or already processed')
  }
}

// Application Access Management Types
export type ApplicationAccess = {
  id: string
  userId: string
  appKey: string
  grantedAt: number
  grantedBy?: string // userId of admin who granted access
}

type ApplicationAccessDoc = {
  _id: ObjectId
  userId: string
  appKey: string
  grantedAt: number
  grantedBy?: string
}

// Application catalog (should match frontend)
export const APPLICATION_CATALOG = [
  { key: 'crm', name: 'CRM', description: 'Contacts, deals, pipelines' },
  { key: 'scheduler', name: 'Scheduler', description: 'Calendar and bookings' },
  { key: 'helpdesk', name: 'Helpdesk', description: 'Tickets and SLAs' },
  { key: 'billing', name: 'Billing', description: 'Invoices and payments' },
  { key: 'analytics', name: 'Analytics', description: 'Dashboards and reports' },
  { key: 'stratflow', name: 'StratFlow', description: 'Projects and tasks' },
  { key: 'marketplace', name: 'Marketplace', description: 'Product and service marketplace' },
  { key: 'workspace', name: 'Workspace', description: 'Personal workspace and tools' },
  { key: 'dashboard', name: 'Dashboard', description: 'Main dashboard and analytics' },
] as const

export type AppKey = typeof APPLICATION_CATALOG[number]['key']

// Ensure user_apps collection and indexes
async function ensureUserAppsCollection(db: any) {
  try {
    await db.collection('user_apps').createIndex({ userId: 1 }).catch(() => {})
    await db.collection('user_apps').createIndex({ appKey: 1 }).catch(() => {})
    await db.collection('user_apps').createIndex({ userId: 1, appKey: 1 }, { unique: true }).catch(() => {})
  } catch (err) {
    console.warn('Warning: Could not ensure user_apps collection/index:', err)
  }
}

export async function getUserApplicationAccess(userId: string): Promise<string[]> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureUserAppsCollection(db)

  const accessDocs = await db.collection<ApplicationAccessDoc>('user_apps')
    .find({ userId })
    .toArray()

  return accessDocs.map((doc) => doc.appKey)
}

export async function hasApplicationAccess(userId: string, appKey: string): Promise<boolean> {
  const db = await getDb()
  if (!db) {
    return false
  }

  // Admins have access to all applications
  const userRoles = await db.collection<UserRoleDoc>('user_roles').find({ userId } as any).toArray()
  if (userRoles.length > 0) {
    const roleIds = userRoles.map((ur) => ur.roleId)
    const roles = await db.collection<RoleDoc>('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const allPerms = new Set<string>(roles.flatMap((r) => r.permissions || []))
    if (allPerms.has('*')) {
      return true // Admin has access to everything
    }
  }

  await ensureUserAppsCollection(db)

  const access = await db.collection<ApplicationAccessDoc>('user_apps').findOne({
    userId,
    appKey,
  })

  return !!access
}

export async function grantApplicationAccess(
  userId: string,
  appKey: string,
  grantedBy: string
): Promise<ApplicationAccess> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureUserAppsCollection(db)

  // Validate app key
  const validAppKeys = APPLICATION_CATALOG.map((app) => app.key)
  if (!validAppKeys.includes(appKey as AppKey)) {
    throw new Error(`Invalid application key: ${appKey}`)
  }

  // Check if access already exists
  const existing = await db.collection<ApplicationAccessDoc>('user_apps').findOne({
    userId,
    appKey,
  })

  if (existing) {
    return {
      id: existing._id.toString(),
      userId: existing.userId,
      appKey: existing.appKey,
      grantedAt: existing.grantedAt,
      grantedBy: existing.grantedBy,
    }
  }

  const now = Date.now()
  const accessDoc: ApplicationAccessDoc = {
    _id: new ObjectId(),
    userId,
    appKey,
    grantedAt: now,
    grantedBy,
  }

  await db.collection<ApplicationAccessDoc>('user_apps').insertOne(accessDoc)

  return {
    id: accessDoc._id.toString(),
    userId: accessDoc.userId,
    appKey: accessDoc.appKey,
    grantedAt: accessDoc.grantedAt,
    grantedBy: accessDoc.grantedBy,
  }
}

export async function revokeApplicationAccess(userId: string, appKey: string): Promise<void> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  const result = await db.collection<ApplicationAccessDoc>('user_apps').deleteOne({
    userId,
    appKey,
  })

  if (result.deletedCount === 0) {
    throw new Error('Application access not found')
  }
}

export async function getUserAccessList(userId: string): Promise<ApplicationAccess[]> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  const accessDocs = await db.collection<ApplicationAccessDoc>('user_apps')
    .find({ userId })
    .sort({ grantedAt: -1 })
    .toArray()

  return accessDocs.map((doc) => ({
    id: doc._id.toString(),
    userId: doc.userId,
    appKey: doc.appKey,
    grantedAt: doc.grantedAt,
    grantedBy: doc.grantedBy,
  }))
}

export async function getAllUsersWithAppAccess(appKey?: string): Promise<Array<{ userId: string; appKeys: string[] }>> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  const query = appKey ? { appKey } : {}
  const accessDocs = await db.collection<ApplicationAccessDoc>('user_apps').find(query).toArray()

  // Group by userId
  const userAccessMap = new Map<string, Set<string>>()
  for (const doc of accessDocs) {
    if (!userAccessMap.has(doc.userId)) {
      userAccessMap.set(doc.userId, new Set())
    }
    userAccessMap.get(doc.userId)!.add(doc.appKey)
  }

  return Array.from(userAccessMap.entries()).map(([userId, appKeys]) => ({
    userId,
    appKeys: Array.from(appKeys),
  }))
}

// Application Access Request Types
export type ApplicationAccessRequest = {
  id: string
  userId: string
  userEmail: string
  userName?: string
  appKey: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: number
  reviewedAt?: number
  reviewedBy?: string
}

type ApplicationAccessRequestDoc = {
  _id: ObjectId
  userId: string
  userEmail: string
  userName?: string
  appKey: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: number
  reviewedAt?: number
  reviewedBy?: string
}

async function ensureAppAccessRequestsCollection(db: any) {
  try {
    await db.collection('app_access_requests').createIndex({ userId: 1 }).catch(() => {})
    await db.collection('app_access_requests').createIndex({ appKey: 1 }).catch(() => {})
    await db.collection('app_access_requests').createIndex({ status: 1 }).catch(() => {})
    await db.collection('app_access_requests').createIndex({ requestedAt: -1 }).catch(() => {})
    await db.collection('app_access_requests').createIndex({ userId: 1, appKey: 1, status: 1 }).catch(() => {})
  } catch (err) {
    console.warn('Warning: Could not ensure app_access_requests collection/index:', err)
  }
}

export async function createApplicationAccessRequest(
  userId: string,
  appKey: string
): Promise<ApplicationAccessRequest> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureAppAccessRequestsCollection(db)

  // Validate app key - accept any non-empty string key
  // This allows the frontend catalog to be the source of truth
  // and new apps can be added without backend updates
  if (!appKey || typeof appKey !== 'string' || appKey.trim().length === 0) {
    throw new Error(`Invalid application key: ${appKey}`)
  }
  
  // Normalize the app key
  const normalizedAppKey = appKey.trim().toLowerCase()

  // Get user info
  const user = await db.collection<UserDoc>('users').findOne({ _id: new ObjectId(userId) })
  if (!user) {
    throw new Error('User not found')
  }

  // Check if user already has access (use normalized key)
  const hasAccess = await hasApplicationAccess(userId, normalizedAppKey)
  if (hasAccess) {
    throw new Error('User already has access to this application')
  }

  // Check if there's already a pending request (use normalized key)
  const existingRequest = await db.collection<ApplicationAccessRequestDoc>('app_access_requests').findOne({
    userId,
    appKey: normalizedAppKey,
    status: 'pending',
  })

  if (existingRequest) {
    return {
      id: existingRequest._id.toString(),
      userId: existingRequest.userId,
      userEmail: existingRequest.userEmail,
      userName: existingRequest.userName,
      appKey: existingRequest.appKey,
      status: existingRequest.status,
      requestedAt: existingRequest.requestedAt,
      reviewedAt: existingRequest.reviewedAt,
      reviewedBy: existingRequest.reviewedBy,
    }
  }

  // Create request (use normalized key)
  const requestDoc: ApplicationAccessRequestDoc = {
    _id: new ObjectId(),
    userId,
    userEmail: user.email,
    userName: user.name,
    appKey: normalizedAppKey,
    status: 'pending',
    requestedAt: Date.now(),
  }

  await db.collection<ApplicationAccessRequestDoc>('app_access_requests').insertOne(requestDoc)

  return {
    id: requestDoc._id.toString(),
    userId: requestDoc.userId,
    userEmail: requestDoc.userEmail,
    userName: requestDoc.userName,
    appKey: requestDoc.appKey,
    status: requestDoc.status,
    requestedAt: requestDoc.requestedAt,
  }
}

export async function getApplicationAccessRequests(
  status?: 'pending' | 'approved' | 'rejected'
): Promise<ApplicationAccessRequest[]> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureAppAccessRequestsCollection(db)

  const query: any = {}
  if (status) {
    query.status = status
  }

  const requests = await db
    .collection<ApplicationAccessRequestDoc>('app_access_requests')
    .find(query)
    .sort({ requestedAt: -1 })
    .toArray()

  return requests.map((req) => ({
    id: req._id.toString(),
    userId: req.userId,
    userEmail: req.userEmail,
    userName: req.userName,
    appKey: req.appKey,
    status: req.status,
    requestedAt: req.requestedAt,
    reviewedAt: req.reviewedAt,
    reviewedBy: req.reviewedBy,
  }))
}

export async function getUserApplicationAccessRequests(
  userId: string,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<ApplicationAccessRequest[]> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureAppAccessRequestsCollection(db)

  const query: any = { userId }
  if (status) {
    query.status = status
  }

  const requests = await db
    .collection<ApplicationAccessRequestDoc>('app_access_requests')
    .find(query)
    .sort({ requestedAt: -1 })
    .toArray()

  return requests.map((req) => ({
    id: req._id.toString(),
    userId: req.userId,
    userEmail: req.userEmail,
    userName: req.userName,
    appKey: req.appKey,
    status: req.status,
    requestedAt: req.requestedAt,
    reviewedAt: req.reviewedAt,
    reviewedBy: req.reviewedBy,
  }))
}

export async function getApplicationAccessRequestById(requestId: string): Promise<ApplicationAccessRequest | null> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  await ensureAppAccessRequestsCollection(db)

  let requestObjectId: ObjectId
  try {
    requestObjectId = new ObjectId(requestId)
  } catch {
    return null
  }

  const requestDoc = await db.collection<ApplicationAccessRequestDoc>('app_access_requests').findOne({
    _id: requestObjectId,
  })

  if (!requestDoc) {
    return null
  }

  return {
    id: requestDoc._id.toString(),
    userId: requestDoc.userId,
    userEmail: requestDoc.userEmail,
    userName: requestDoc.userName,
    appKey: requestDoc.appKey,
    status: requestDoc.status,
    requestedAt: requestDoc.requestedAt,
    reviewedAt: requestDoc.reviewedAt,
    reviewedBy: requestDoc.reviewedBy,
  }
}

export async function approveApplicationAccessRequest(
  requestId: string,
  reviewedByUserId: string
): Promise<ApplicationAccess> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  let requestObjectId: ObjectId
  try {
    requestObjectId = new ObjectId(requestId)
  } catch {
    throw new Error('Invalid request ID')
  }

  const requestDoc = await db.collection<ApplicationAccessRequestDoc>('app_access_requests').findOne({
    _id: requestObjectId,
    status: 'pending',
  })

  if (!requestDoc) {
    throw new Error('Application access request not found or already processed')
  }

  // Grant access
  const access = await grantApplicationAccess(requestDoc.userId, requestDoc.appKey, reviewedByUserId)

  // Mark request as approved
  await db.collection<ApplicationAccessRequestDoc>('app_access_requests').updateOne(
    { _id: requestObjectId },
    {
      $set: {
        status: 'approved',
        reviewedAt: Date.now(),
        reviewedBy: reviewedByUserId,
      },
    }
  )

  return access
}

export async function rejectApplicationAccessRequest(
  requestId: string,
  reviewedByUserId: string
): Promise<void> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  let requestObjectId: ObjectId
  try {
    requestObjectId = new ObjectId(requestId)
  } catch {
    throw new Error('Invalid request ID')
  }

  const result = await db.collection<ApplicationAccessRequestDoc>('app_access_requests').updateOne(
    { _id: requestObjectId, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        reviewedAt: Date.now(),
        reviewedBy: reviewedByUserId,
      },
    }
  )

  if (result.matchedCount === 0) {
    throw new Error('Application access request not found or already processed')
  }
}

// Access Report Types
export type UserAccessReport = {
  userId: string
  email: string
  name?: string
  createdAt: number
  lastLoginAt?: number
  roles: string[]
  applicationAccess: string[]
  isVerified: boolean
  passwordChangeRequired: boolean
}

export async function generateAccessReport(): Promise<UserAccessReport[]> {
  const db = await getDb()
  if (!db) {
    throw new Error('Database unavailable')
  }

  // Get all users
  const users = await db.collection<UserDoc>('users').find({}).toArray()

  // Get all sessions grouped by user to find last login
  // SessionDoc structure matches sessions.ts
  const sessions = await db.collection<any>('sessions')
    .find({ revoked: { $ne: true } })
    .sort({ createdAt: -1 })
    .toArray()

  // Group sessions by userId to get most recent login per user
  const userLastLogin = new Map<string, number>()
  for (const session of sessions) {
    const userId = session.userId?.toString() || session.userId
    if (!userId) continue
    const userIdStr = typeof userId === 'string' ? userId : userId.toString()
    if (!userLastLogin.has(userIdStr)) {
      // Use createdAt as the login time, lastUsedAt might be from refresh
      const createdAt = session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt)
      userLastLogin.set(userIdStr, createdAt.getTime())
    }
  }

  // Get all user roles
  const userRoles = await db.collection<UserRoleDoc>('user_roles').find({}).toArray()
  const roleIds = [...new Set(userRoles.map(ur => ur.roleId instanceof ObjectId ? ur.roleId : new ObjectId(ur.roleId)))]
  const roles = await db.collection<RoleDoc>('roles').find({
    _id: { $in: roleIds }
  }).toArray()
  const roleMap = new Map(roles.map(r => [r._id.toString(), r.name]))

  // Build user role map
  const userRoleMap = new Map<string, string[]>()
  for (const ur of userRoles) {
    const userId = ur.userId
    if (!userId) continue
    // roleId is ObjectId, convert to string
    const roleIdStr = ur.roleId instanceof ObjectId ? ur.roleId.toString() : String(ur.roleId)
    const roleName = roleMap.get(roleIdStr) || 'Unknown'
    if (!userRoleMap.has(userId)) {
      userRoleMap.set(userId, [])
    }
    userRoleMap.get(userId)!.push(roleName)
  }

  // Get all application access
  const appAccess = await db.collection<ApplicationAccessDoc>('user_apps').find({}).toArray()
  const userAppMap = new Map<string, string[]>()
  for (const access of appAccess) {
    if (!userAppMap.has(access.userId)) {
      userAppMap.set(access.userId, [])
    }
    userAppMap.get(access.userId)!.push(access.appKey)
  }

  // Build report
  const report: UserAccessReport[] = users.map(user => {
    const userId = user._id.toString()
    return {
      userId,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      lastLoginAt: userLastLogin.get(userId),
      roles: userRoleMap.get(userId) || [],
      applicationAccess: userAppMap.get(userId) || [],
      isVerified: user.verified || false,
      passwordChangeRequired: user.passwordChangeRequired || false,
    }
  })

  // Sort by last login (most recent first), then by email
  report.sort((a, b) => {
    if (a.lastLoginAt && b.lastLoginAt) {
      return b.lastLoginAt - a.lastLoginAt
    }
    if (a.lastLoginAt && !b.lastLoginAt) return -1
    if (!a.lastLoginAt && b.lastLoginAt) return 1
    return a.email.localeCompare(b.email)
  })

  return report
}


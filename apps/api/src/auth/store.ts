import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { randomBytes, randomInt } from 'node:crypto'
import { getDb } from '../db.js'

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


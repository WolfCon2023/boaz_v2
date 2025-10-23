import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import type { User } from '@boaz/shared'

type StoredUser = User & { passwordHash: string }

const users = new Map<string, StoredUser>()

export async function createUser(email: string, password: string, name?: string): Promise<User> {
  const id = randomUUID()
  const passwordHash = await bcrypt.hash(password, 10)
  const now = Date.now()
  const user: StoredUser = { id, email, name, createdAt: now, passwordHash }
  users.set(email.toLowerCase(), user)
  return { id, email, name, createdAt: now }
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const user = users.get(email.toLowerCase())
  if (!user) return null
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return null
  const { passwordHash, ...safe } = user
  return safe
}

export function getUserByEmail(email: string): User | null {
  const user = users.get(email.toLowerCase())
  if (!user) return null
  const { passwordHash, ...safe } = user
  return safe
}



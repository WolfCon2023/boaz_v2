import jwt from 'jsonwebtoken'
import type { AuthTokenPayload } from '@boaz/shared'
import { env } from '../env'

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' })
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload
  } catch {
    return null
  }
}



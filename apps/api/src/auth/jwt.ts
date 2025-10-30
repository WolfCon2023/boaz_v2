import jwt from 'jsonwebtoken'
import { env } from '../env.js'

export type AuthTokenPayload = { sub: string; email: string }

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

// Access/Refresh helpers (non-breaking additions)
export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' })
}

export function signRefreshToken(payload: AuthTokenPayload & { jti: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' })
}

export function verifyAny<T = any>(token: string): T | null {
  try { return jwt.verify(token, env.JWT_SECRET) as T } catch { return null }
}



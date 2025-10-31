import { getDb } from '../db.js'
import { getUserByEmail } from './store.js'

/**
 * Check if a user has email notifications enabled
 * @param userId - User ID to check
 * @param email - Email address to check (alternative to userId)
 * @returns true if notifications are enabled, false if disabled, null if preference not set (defaults to enabled)
 */
export async function hasEmailNotificationsEnabled(userId?: string, email?: string): Promise<boolean | null> {
  const db = await getDb()
  if (!db) {
    // If DB unavailable, default to allowing emails (fail open for security)
    return true
  }

  let targetUserId = userId

  // If no userId provided but email is, get userId from email
  if (!targetUserId && email) {
    const user = await getUserByEmail(email)
    if (!user) {
      // User doesn't exist yet (e.g., during registration)
      // Default to allowing emails
      return true
    }
    targetUserId = user.id
  }

  if (!targetUserId) {
    // Can't determine user, default to allowing emails
    return true
  }

  try {
    const doc = await db.collection('preferences').findOne({ userId: targetUserId })
    const preferences = doc?.data || {}
    
    // If emailNotifications is explicitly set, return it
    // If not set, return null (caller can decide default)
    if ('emailNotifications' in preferences) {
      return !!preferences.emailNotifications
    }
    
    // Preference not set - return null to let caller decide
    return null
  } catch (err) {
    console.error('Error checking email notifications preference:', err)
    // On error, default to allowing emails
    return true
  }
}


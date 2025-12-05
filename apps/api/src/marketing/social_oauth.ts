import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'
import crypto from 'crypto'

export const socialOAuthRouter = Router()

/**
 * Social Media OAuth Integration
 * 
 * This module handles OAuth 2.0 authentication flows for:
 * - Facebook (Meta Business Suite API)
 * - Twitter/X (OAuth 2.0 with PKCE)
 * - LinkedIn (OAuth 2.0)
 * - Instagram (via Facebook Graph API)
 * 
 * SETUP REQUIRED:
 * 1. Register apps on each platform's developer portal
 * 2. Set redirect URIs to: https://your-domain.com/api/marketing/social/oauth/callback/{platform}
 * 3. Add these environment variables:
 *    - FACEBOOK_APP_ID
 *    - FACEBOOK_APP_SECRET
 *    - TWITTER_CLIENT_ID
 *    - TWITTER_CLIENT_SECRET
 *    - LINKEDIN_CLIENT_ID
 *    - LINKEDIN_CLIENT_SECRET
 * 4. Request appropriate scopes for each platform
 */

// In-memory store for OAuth state (use Redis in production)
const oauthStates = new Map<string, { userId: string; platform: string; createdAt: Date; codeVerifier?: string }>()

// Clean up old states every hour
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  for (const [state, data] of oauthStates.entries()) {
    if (data.createdAt < oneHourAgo) {
      oauthStates.delete(state)
    }
  }
}, 60 * 60 * 1000)

/**
 * STEP 1: Initiate OAuth Flow
 * GET /api/marketing/social/oauth/connect/{platform}
 * 
 * This redirects the user to the platform's OAuth authorization page
 */
socialOAuthRouter.get('/connect/:platform', requireAuth, async (req, res) => {
  const platform = req.params.platform as 'facebook' | 'twitter' | 'linkedin' | 'instagram'
  const userId = (req as any).user?.userId || 'unknown'
  
  // Generate random state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex')
  oauthStates.set(state, { userId, platform, createdAt: new Date() })
  
  // Build OAuth URLs for each platform
  const redirectUri = `${req.protocol}://${req.get('host')}/api/marketing/social/oauth/callback/${platform}`
  
  let authUrl = ''
  
  switch (platform) {
    case 'facebook':
    case 'instagram': // Instagram uses Facebook OAuth
      /**
       * Facebook OAuth Documentation:
       * https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
       * 
       * Required Scopes:
       * - pages_show_list: List pages user manages
       * - pages_read_engagement: Read page insights
       * - pages_manage_posts: Create posts
       * - instagram_basic: Basic Instagram access (for Instagram)
       * - instagram_content_publish: Publish to Instagram
       */
      authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${process.env.FACEBOOK_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${state}` +
        `&scope=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish`
      break
      
    case 'twitter':
      /**
       * Twitter OAuth 2.0 Documentation:
       * https://developer.twitter.com/en/docs/authentication/oauth-2-0/authorization-code
       * 
       * Required Scopes:
       * - tweet.read: Read tweets
       * - tweet.write: Create tweets
       * - users.read: Read user profile
       * - offline.access: Refresh token
       * 
       * Uses PKCE (Proof Key for Code Exchange) for security
       */
      const codeVerifier = crypto.randomBytes(32).toString('base64url')
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
      
      // Store code verifier for callback
      oauthStates.set(`${state}_verifier`, { userId, platform: 'twitter_verifier', createdAt: new Date() })
      oauthStates.get(state)!.codeVerifier = codeVerifier
      
      authUrl = `https://twitter.com/i/oauth2/authorize?` +
        `response_type=code` +
        `&client_id=${process.env.TWITTER_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=tweet.read%20tweet.write%20users.read%20offline.access` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`
      break
      
    case 'linkedin':
      /**
       * LinkedIn OAuth 2.0 Documentation:
       * https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
       * 
       * Required Scopes:
       * - r_liteprofile: Read basic profile
       * - r_organization_social: Read organization posts
       * - w_organization_social: Post on behalf of organization
       * - rw_organization_admin: Manage organization
       */
      authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
        `response_type=code` +
        `&client_id=${process.env.LINKEDIN_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${state}` +
        `&scope=r_liteprofile%20r_organization_social%20w_organization_social%20rw_organization_admin`
      break
      
    default:
      return res.status(400).json({ error: 'unsupported_platform' })
  }
  
  // Redirect user to platform OAuth page
  res.redirect(authUrl)
})

/**
 * STEP 2: OAuth Callback Handler
 * GET /api/marketing/social/oauth/callback/{platform}?code=...&state=...
 * 
 * Platform redirects back here after user authorizes
 * Exchange the authorization code for an access token
 */
socialOAuthRouter.get('/callback/:platform', async (req, res) => {
  const platform = req.params.platform as 'facebook' | 'twitter' | 'linkedin' | 'instagram'
  const code = req.query.code as string
  const state = req.query.state as string
  
  // Verify state (CSRF protection)
  const stateData = oauthStates.get(state)
  if (!stateData || stateData.platform !== platform) {
    return res.status(400).send('Invalid state parameter')
  }
  
  const userId = stateData.userId
  oauthStates.delete(state)
  
  // Exchange code for access token
  const redirectUri = `${req.protocol}://${req.get('host')}/api/marketing/social/oauth/callback/${platform}`
  
  let accessToken = ''
  let refreshToken = ''
  let expiresIn = 0
  let accountData: any = {}
  
  try {
    switch (platform) {
      case 'facebook':
      case 'instagram':
        /**
         * Exchange code for access token
         * https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/#confirm
         */
        const fbTokenResponse = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?` +
          `client_id=${process.env.FACEBOOK_APP_ID}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&code=${code}`
        )
        
        const fbTokenData = await fbTokenResponse.json() as any
        accessToken = fbTokenData.access_token
        expiresIn = fbTokenData.expires_in || 5184000 // 60 days default
        
        // Get user's pages
        const fbPagesResponse = await fetch(
          `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
        )
        const fbPagesData = await fbPagesResponse.json() as any
        
        // If Instagram, get Instagram business accounts
        if (platform === 'instagram') {
          // Get Instagram accounts connected to pages
          const igAccounts = []
          for (const page of fbPagesData.data || []) {
            const igResponse = await fetch(
              `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
            )
            const igData = await igResponse.json() as any
            if (igData.instagram_business_account) {
              igAccounts.push({
                id: igData.instagram_business_account.id,
                name: page.name,
                token: page.access_token
              })
            }
          }
          accountData = { accounts: igAccounts }
        } else {
          accountData = { pages: fbPagesData.data }
        }
        break
        
      case 'twitter':
        /**
         * Exchange code for access token with PKCE
         * https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token
         */
        const codeVerifier = stateData.codeVerifier || ''
        
        const twitterTokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`
          },
          body: new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
          })
        })
        
        const twitterTokenData = await twitterTokenResponse.json() as any
        accessToken = twitterTokenData.access_token
        refreshToken = twitterTokenData.refresh_token
        expiresIn = twitterTokenData.expires_in
        
        // Get user profile
        const twitterUserResponse = await fetch('https://api.twitter.com/2/users/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        const twitterUserData = await twitterUserResponse.json() as any
        accountData = twitterUserData.data
        break
        
      case 'linkedin':
        /**
         * Exchange code for access token
         * https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
         */
        const linkedinTokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: process.env.LINKEDIN_CLIENT_ID!,
            client_secret: process.env.LINKEDIN_CLIENT_SECRET!
          })
        })
        
        const linkedinTokenData = await linkedinTokenResponse.json() as any
        accessToken = linkedinTokenData.access_token
        expiresIn = linkedinTokenData.expires_in
        
        // Get user profile
        const linkedinUserResponse = await fetch('https://api.linkedin.com/v2/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        const linkedinUserData = await linkedinUserResponse.json()
        accountData = linkedinUserData
        break
    }
    
    // Store account in database
    const db = await getDb()
    if (!db) throw new Error('Database unavailable')
    
    const now = new Date()
    const tokenExpiry = new Date(now.getTime() + expiresIn * 1000)
    
    // For platforms with multiple accounts (Facebook pages, Instagram accounts)
    // Store each one separately
    if (platform === 'facebook' && accountData.pages) {
      for (const page of accountData.pages) {
        await db.collection('social_accounts').insertOne({
          platform: 'facebook',
          accountName: page.name,
          accountId: page.id,
          accessToken: page.access_token, // Page-specific token
          tokenExpiry,
          status: 'active',
          createdBy: userId,
          createdAt: now,
          updatedAt: now
        })
      }
    } else if (platform === 'instagram' && accountData.accounts) {
      for (const account of accountData.accounts) {
        await db.collection('social_accounts').insertOne({
          platform: 'instagram',
          accountName: account.name,
          accountId: account.id,
          accessToken: account.token,
          tokenExpiry,
          status: 'active',
          createdBy: userId,
          createdAt: now,
          updatedAt: now
        })
      }
    } else {
      // Single account platforms (Twitter, LinkedIn)
      await db.collection('social_accounts').insertOne({
        platform,
        accountName: accountData.name || accountData.username || `${platform} account`,
        accountId: accountData.id,
        username: accountData.username,
        accessToken,
        refreshToken,
        tokenExpiry,
        status: 'active',
        createdBy: userId,
        createdAt: now,
        updatedAt: now
      })
    }
    
    // Redirect back to Social Media page with success
    res.redirect('/apps/crm/marketing/social?connected=true')
    
  } catch (error: any) {
    console.error(`OAuth callback error for ${platform}:`, error)
    res.redirect(`/apps/crm/marketing/social?error=${encodeURIComponent(error.message)}`)
  }
})

/**
 * STEP 3: Refresh Access Token (for expired tokens)
 * POST /api/marketing/social/oauth/refresh/:accountId
 * 
 * Uses refresh token to get new access token
 */
socialOAuthRouter.post('/refresh/:accountId', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ error: 'db_unavailable' })
  
  try {
    const accountId = new ObjectId(req.params.accountId)
    const account = await db.collection('social_accounts').findOne({ _id: accountId }) as any
    
    if (!account) {
      return res.status(404).json({ error: 'account_not_found' })
    }
    
    if (!account.refreshToken) {
      return res.status(400).json({ error: 'no_refresh_token' })
    }
    
    let newAccessToken = ''
    let newRefreshToken = account.refreshToken
    let expiresIn = 0
    
    // Only Twitter supports refresh tokens in our implementation
    if (account.platform === 'twitter') {
      const response = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`
        },
        body: new URLSearchParams({
          refresh_token: account.refreshToken,
          grant_type: 'refresh_token'
        })
      })
      
      const data = await response.json() as any
      newAccessToken = data.access_token
      newRefreshToken = data.refresh_token || account.refreshToken
      expiresIn = data.expires_in
    }
    
    // Update account with new tokens
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000)
    await db.collection('social_accounts').updateOne(
      { _id: accountId },
      {
        $set: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          tokenExpiry,
          status: 'active',
          updatedAt: new Date()
        }
      }
    )
    
    res.json({ success: true, message: 'Token refreshed successfully' })
    
  } catch (error: any) {
    console.error('Token refresh error:', error)
    res.status(500).json({ error: error.message })
  }
})




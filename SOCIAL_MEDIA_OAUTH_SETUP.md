# Social Media OAuth Setup Guide

## Overview

BOAZ-OS Social Media Management supports secure OAuth 2.0 authentication for:
- **Facebook** (Meta Business Suite API)
- **Twitter/X** (OAuth 2.0 with PKCE)
- **LinkedIn** (OAuth 2.0)
- **Instagram** (via Facebook Graph API)

## Current vs Production Mode

### Demo Mode (Current)
- Manual account entry via form
- For testing and development
- No real API integration

### Production Mode (OAuth)
- One-click secure connection
- Automatic token refresh
- Real-time posting and analytics
- Industry-standard security

---

## Production Setup Instructions

### Step 1: Register Apps on Each Platform

#### Facebook & Instagram Setup

1. Go to https://developers.facebook.com
2. Click "My Apps" → "Create App"
3. Select "Business" as app type
4. Fill in app details:
   - App Name: "BOAZ-OS Social Manager" (or your choice)
   - Contact Email: Your email
5. In the dashboard, click "Add Product" → "Facebook Login"
6. Go to Settings → Basic:
   - Copy **App ID**
   - Copy **App Secret**
7. Go to Facebook Login → Settings:
   - Add OAuth Redirect URI: `https://your-domain.com/api/marketing/social/oauth/callback/facebook`
   - Add OAuth Redirect URI: `https://your-domain.com/api/marketing/social/oauth/callback/instagram`
8. Go to App Review → Permissions and Features:
   - Request these permissions:
     - `pages_show_list` - List pages user manages
     - `pages_read_engagement` - Read page insights
     - `pages_manage_posts` - Create posts on pages
     - `instagram_basic` - Basic Instagram profile access
     - `instagram_content_publish` - Publish content to Instagram
9. Submit for review (required for production use)

**Documentation**: https://developers.facebook.com/docs/facebook-login

#### Twitter/X Setup

1. Go to https://developer.twitter.com/en/portal
2. Sign in and create a new project
3. Create an app within the project:
   - App Name: "BOAZ-OS Social Manager"
   - Environment: Production
4. In app settings, find "Keys and tokens":
   - Copy **Client ID**
   - Copy **Client Secret**
5. Go to "Authentication settings":
   - Enable OAuth 2.0
   - Type of App: Web App
   - Callback URI: `https://your-domain.com/api/marketing/social/oauth/callback/twitter`
   - Website URL: https://your-domain.com
6. Enable these scopes:
   - `tweet.read` - Read tweets
   - `tweet.write` - Create tweets
   - `users.read` - Read user profile
   - `offline.access` - Refresh tokens
7. Terms of Service: Agree to developer agreement

**Documentation**: https://developer.twitter.com/en/docs/authentication/oauth-2-0

#### LinkedIn Setup

1. Go to https://www.linkedin.com/developers
2. Create a new app:
   - App Name: "BOAZ-OS Social Manager"
   - LinkedIn Page: Select your company page
   - Privacy Policy URL: Your privacy URL
   - App Logo: Upload logo
3. In app settings → Auth:
   - Copy **Client ID**
   - Copy **Client Secret**
   - Add Redirect URL: `https://your-domain.com/api/marketing/social/oauth/callback/linkedin`
4. In Products → Add Product:
   - Add "Sign In with LinkedIn"
   - Add "Share on LinkedIn" (may require verification)
5. Enable OAuth 2.0 scopes:
   - `r_liteprofile` - Read basic profile
   - `r_organization_social` - Read organization posts
   - `w_organization_social` - Post on behalf of organization
   - `rw_organization_admin` - Manage organization pages
6. Submit for verification if needed

**Documentation**: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication

---

### Step 2: Add Environment Variables

In your Railway API service, add these environment variables:

```bash
# Facebook & Instagram
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here

# Twitter/X
TWITTER_CLIENT_ID=your_client_id_here
TWITTER_CLIENT_SECRET=your_client_secret_here

# LinkedIn
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
```

**How to add in Railway:**
1. Go to your Railway project dashboard
2. Select the API service
3. Go to "Variables" tab
4. Click "New Variable"
5. Add each variable above
6. Save and redeploy

---

### Step 3: Deploy OAuth Implementation

The OAuth code is ready in `apps/api/src/marketing/social_oauth.ts`. Just deploy:

```bash
git add -A
git commit -m "feat: Add OAuth for social media connections"
git push origin main
```

Railway will automatically deploy the changes.

---

## How Users Connect Accounts (After Setup)

Once OAuth is configured, the connection flow becomes:

### User Perspective:
1. Go to Social Media → Accounts tab
2. Click "📘 Connect Facebook" (or other platform)
3. Redirected to Facebook login page
4. User authorizes BOAZ-OS to access their pages/accounts
5. Redirected back to BOAZ-OS
6. Account is automatically connected and ready to use!

### What Happens Behind the Scenes:
1. User clicks OAuth button → `GET /api/marketing/social/oauth/connect/facebook`
2. Backend generates security state token
3. User redirected to platform's OAuth authorization page
4. User grants permissions
5. Platform redirects back with authorization code → `GET /api/marketing/social/oauth/callback/facebook?code=...&state=...`
6. Backend exchanges code for access token
7. Backend fetches user's pages/accounts from platform API
8. Backend stores accounts with encrypted tokens in database
9. User redirected back to Social Media page with success message

---

## Security Features

### Built-in Security:
- ✅ **CSRF Protection**: State parameter validates callback
- ✅ **PKCE** (Twitter): Proof Key for Code Exchange prevents interception
- ✅ **Token Encryption**: Access tokens stored securely
- ✅ **Token Refresh**: Automatic renewal of expired tokens
- ✅ **Scope Limitation**: Only requests necessary permissions
- ✅ **State Expiry**: OAuth states expire after 1 hour

### Production Recommendations:
- Use Redis for OAuth state storage (currently in-memory)
- Encrypt access tokens in database
- Enable HTTPS only
- Set up token rotation schedules
- Monitor for suspicious OAuth activity
- Implement rate limiting on OAuth endpoints

---

## Token Management

### Access Tokens:
- Stored in `social_accounts` collection
- Used for API calls to platforms
- Expire after platform-specific duration:
  - Facebook: 60 days
  - Twitter: 2 hours
  - LinkedIn: 60 days

### Refresh Tokens:
- Stored alongside access tokens
- Used to obtain new access tokens when they expire
- Only Twitter provides refresh tokens in our implementation

### Automatic Refresh:
The system will automatically detect expired tokens and refresh them:
```javascript
POST /api/marketing/social/oauth/refresh/:accountId
```

---

## Testing OAuth Locally

### Requirements:
1. ngrok or similar tunnel to get HTTPS URL
2. Test app credentials from each platform
3. Local environment variables set

### Steps:
```bash
# 1. Start ngrok
ngrok http 3001

# 2. Copy HTTPS URL (e.g., https://abc123.ngrok.io)

# 3. Update redirect URIs in platform apps to use ngrok URL

# 4. Set environment variables in .env:
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
# ... etc

# 5. Start API server
npm run dev

# 6. Test OAuth flow through ngrok URL
```

---

## Troubleshooting

### "Invalid redirect_uri" error
- Check that the redirect URI in your app settings matches exactly
- Must be `https://your-domain.com/api/marketing/social/oauth/callback/{platform}`
- Include `/callback/{platform}` at the end

### "Invalid state parameter"
- OAuth state may have expired (1 hour limit)
- Try connecting again
- In production, use Redis for persistent state storage

### "Insufficient permissions" error
- Your app doesn't have the required permissions
- Go to platform developer console and request additional scopes
- Some scopes require app review/verification

### Access token expired
- Use the refresh endpoint: `POST /api/marketing/social/oauth/refresh/:accountId`
- Or disconnect and reconnect the account

### Account shows "Error" status
- Token is invalid or revoked
- Reconnect the account using OAuth flow
- Check platform API status (may be down)

---

## API Endpoints Reference

### OAuth Flow:
- `GET /api/marketing/social/oauth/connect/{platform}` - Initiate OAuth
- `GET /api/marketing/social/oauth/callback/{platform}` - OAuth callback
- `POST /api/marketing/social/oauth/refresh/:accountId` - Refresh token

### Account Management:
- `GET /api/marketing/social/accounts` - List connected accounts
- `POST /api/marketing/social/accounts` - Manual connect (demo mode)
- `PUT /api/marketing/social/accounts/:id` - Update account
- `DELETE /api/marketing/social/accounts/:id` - Disconnect account

### Posts:
- `GET /api/marketing/social/posts` - List posts
- `POST /api/marketing/social/posts` - Create post
- `PUT /api/marketing/social/posts/:id` - Update post
- `POST /api/marketing/social/posts/:id/publish` - Publish post
- `DELETE /api/marketing/social/posts/:id` - Delete post

### Analytics:
- `GET /api/marketing/social/analytics` - Get aggregated analytics

---

## Platform-Specific Notes

### Facebook:
- Returns multiple pages user manages
- Each page gets separate account entry
- Page-specific access tokens
- Supports Facebook Pages only (not personal profiles)

### Twitter:
- Uses OAuth 2.0 with PKCE for enhanced security
- Provides refresh tokens (2 hour expiry)
- Rate limits: 300 tweets per 3 hours
- Character limit: 280 characters

### LinkedIn:
- Supports both personal profiles and company pages
- Company pages may require additional verification
- Rate limits: 100 API calls per day for free tier
- Character limit: 3,000 characters

### Instagram:
- Uses Facebook OAuth (Instagram Business Account required)
- Must be connected to a Facebook Page
- Supports Instagram Business and Creator accounts only
- Cannot post to personal Instagram accounts via API

---

## Compliance & Terms

### User Consent:
- Users must explicitly authorize your app
- Clear explanation of what permissions are requested
- Option to revoke access at any time

### Platform Terms:
- Facebook: https://developers.facebook.com/terms
- Twitter: https://developer.twitter.com/en/developer-terms/agreement-and-policy
- LinkedIn: https://legal.linkedin.com/api-terms-of-use

### Data Handling:
- Store only necessary data
- Encrypt tokens at rest
- Don't share user data without consent
- Comply with GDPR, CCPA, and other regulations

---

## Support

For OAuth setup issues:
- Check platform status pages
- Review developer documentation links above
- Verify app configuration matches this guide
- Check Railway logs for error details

For BOAZ-OS specific issues:
- Review Knowledge Base article "Using the Social Media Management app"
- Submit support ticket with error details
- Include platform, error message, and timestamp

---

**Last Updated**: December 2024
**Version**: 1.0
**Status**: Production Ready


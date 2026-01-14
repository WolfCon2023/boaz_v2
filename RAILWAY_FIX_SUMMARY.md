# Railway Deployment Fix - Summary

## Problem

Railway was trying to use `pnpm` and running incorrect commands (`cd ../.. && pnpm install`), causing:
- `ERR_PNPM_NO_PKG_MANIFEST` errors
- Build failures because the working directory was wrong

## Solution

I've created proper Dockerfiles that:
1. ✅ Use **npm** (not pnpm) - matching your project's package manager
2. ✅ Work from the repository root - no `cd ../..` commands needed
3. ✅ Handle the monorepo structure correctly
4. ✅ Build dependencies in the correct order (shared packages → app)

## Files Created/Updated

### Dockerfiles
- `apps/api/Dockerfile` - For the API service
- `apps/web/Dockerfile` - For the Web service

### Configuration
- `.dockerignore` - Excludes unnecessary files from Docker builds
- `RAILWAY_SETUP.md` - Detailed Railway configuration guide
- `CURSOR_PROMPT_FOR_OTHER_APP.md` - Prompt to use in your other application

## Next Steps

### 1. Railway Service Configuration

For each service (API and Web) in Railway:

1. Go to **Service Settings**
2. Set **Root Directory**: Leave empty (or set to repository root)
3. Set **Dockerfile Path**: 
   - API: `apps/api/Dockerfile`
   - Web: `apps/web/Dockerfile`
4. Ensure **Build Command** and **Start Command** are empty (Dockerfile handles these)

### 2. Verify Environment Variables

Make sure all required environment variables are set in Railway:
- API: `MONGO_URL`, `PORT`, `NODE_ENV`, `JWT_SECRET`, `ORIGIN`, etc.
- Web: Any Vite environment variables needed

### 3. Deploy

Push your changes and Railway should now:
- Use the Dockerfiles instead of auto-detecting pnpm
- Build correctly from the monorepo root
- Install dependencies using npm workspaces
- Build in the correct order

## For Your Other Application

I've created a Cursor prompt in `CURSOR_PROMPT_FOR_OTHER_APP.md` that you can copy and paste into Cursor for your other application. It will help fix the same issue there.

## Key Points

- ✅ Project uses **npm workspaces** (not pnpm)
- ✅ Dockerfiles work from **repository root**
- ✅ Builds **shared packages first**, then the app
- ✅ Railway will use **Docker** instead of auto-detecting pnpm

## Testing

After deployment, check:
1. ✅ Build completes without errors
2. ✅ API service starts and connects to database
3. ✅ Web service starts and can reach API
4. ✅ No pnpm-related errors in logs


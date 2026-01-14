# Railway Deployment Configuration

This document explains the Railway deployment setup for this monorepo.

## Project Structure

This is an npm workspaces monorepo with:
- `apps/api` - Backend API service
- `apps/web` - Frontend web application
- `packages/shared` - Shared TypeScript package
- `packages/ui` - Shared UI components package

## Railway Service Configuration

### API Service

1. **Service Settings:**
   - **Root Directory:** Leave empty (Railway will detect the Dockerfile)
   - **Dockerfile Path:** `apps/api/Dockerfile`
   - **Build Command:** (Not needed - Dockerfile handles it)
   - **Start Command:** (Not needed - Dockerfile handles it)

2. **Environment Variables:**
   - `MONGO_URL` - MongoDB connection string
   - `PORT` - Port number (default: 3000)
   - `NODE_ENV` - Set to `production`
   - `JWT_SECRET` - JWT secret key (min 24 characters)
   - `ORIGIN` - Allowed CORS origins (comma-separated)
   - Other variables as needed (see `apps/api/env.example`)

### Web Service

1. **Service Settings:**
   - **Root Directory:** Leave empty (Railway will detect the Dockerfile)
   - **Dockerfile Path:** `apps/web/Dockerfile`
   - **Build Command:** (Not needed - Dockerfile handles it)
   - **Start Command:** (Not needed - Dockerfile handles it)

2. **Environment Variables:**
   - `VITE_API_URL` - API service URL (if needed)
   - Other Vite environment variables as needed

## Important Notes

1. **Package Manager:** This project uses **npm**, not pnpm. The Dockerfiles are configured to use npm workspaces.

2. **Build Order:** The Dockerfiles automatically build dependencies in the correct order:
   - First: `packages/shared`
   - Second: `packages/ui`
   - Finally: The app itself (`api` or `web`)

3. **Monorepo Structure:** Railway needs to build from the repository root to access all workspace packages. The Dockerfiles handle this by copying the entire monorepo structure.

## Troubleshooting

### Error: "No package.json found in /"

This error occurs when Railway tries to use pnpm or when the working directory is incorrect. Ensure:
- Dockerfiles are present in `apps/api/` and `apps/web/`
- Railway service is configured to use the Dockerfile (not Nixpacks)
- The Dockerfile path is set correctly in Railway service settings

### Error: "ERR_PNPM_NO_PKG_MANIFEST"

This means Railway is trying to use pnpm. Solutions:
1. Ensure Dockerfiles are present (Railway will use Docker instead of Nixpacks)
2. If using Nixpacks, create a `nixpacks.toml` file specifying npm
3. Check Railway service settings to ensure Docker is enabled

## Verification

After deployment, verify:
1. API service is running and accessible
2. Web service is running and can connect to API
3. Environment variables are set correctly
4. Database connection is working


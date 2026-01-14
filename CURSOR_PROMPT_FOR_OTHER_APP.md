# Cursor Prompt for Railway Deployment Fix

Copy and paste this prompt into Cursor for your other application:

---

I'm getting Railway deployment errors for my monorepo application. The errors show:

```
ERR_PNPM_NO_PKG_MANIFEST  No package.json found in /
RUN cd ../.. && pnpm install && pnpm --filter api build
```

The issue is that Railway is trying to use pnpm and run `cd ../..` commands, but my project uses npm workspaces. Please:

1. **Examine my project structure** - Check if this is an npm workspaces monorepo (look for `package.json` with `workspaces` field and `package-lock.json` files)

2. **Check for existing Dockerfiles** - Look for any Dockerfiles in the project, especially in service directories (like `apps/api/` or `apps/web/`)

3. **Create proper Dockerfiles** for each Railway service:
   - If I have an API service, create `apps/api/Dockerfile` (or appropriate path)
   - If I have a Web service, create `apps/web/Dockerfile` (or appropriate path)
   - The Dockerfiles should:
     - Use `npm` (not pnpm)
     - Copy the entire monorepo structure from the repository root
     - Install dependencies using `npm ci --workspaces` from the root
     - Build shared packages first, then the service
     - Set the correct working directory for runtime

4. **Create a `.dockerignore` file** in the root to exclude unnecessary files (node_modules, dist, .env files, etc.)

5. **Verify the build process** - Ensure the Dockerfiles build dependencies in the correct order (shared packages → service packages → the app itself)

6. **Provide Railway configuration guidance** - Tell me:
   - What to set in Railway service settings (Root Directory, Dockerfile Path)
   - How to ensure Railway uses Docker instead of auto-detecting pnpm
   - Any environment variables that need to be configured

The Dockerfiles should work from the repository root and handle the monorepo structure properly. Make sure they don't use `cd ../..` commands and instead work with the full monorepo structure from the start.

---


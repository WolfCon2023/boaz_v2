# Use Node.js LTS version
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy root package files and workspace config
COPY package.json package-lock.json tsconfig.base.json ./

# Copy workspace directories (package.json files first for better caching)
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

# Copy TypeScript configs
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/ui/tsconfig.json ./packages/ui/
COPY apps/api/tsconfig.json ./apps/api/

# Copy shared packages (needed for building)
COPY packages/shared/ ./packages/shared/
COPY packages/ui/ ./packages/ui/

# Copy API application
COPY apps/api/ ./apps/api/

# Install dependencies from root (npm workspaces will handle all packages)
RUN npm ci --workspaces

# Build shared packages first (they're dependencies of the API)
WORKDIR /app
RUN npm run build:shared
RUN npm run build:ui

# Build API
RUN npm run build:api

# Expose port
EXPOSE 3000

# Set working directory to API for runtime
WORKDIR /app/apps/api

# Start the application
CMD ["npm", "start"]


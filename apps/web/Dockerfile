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
COPY apps/web/tsconfig.json ./apps/web/
COPY apps/web/tsconfig.app.json ./apps/web/
COPY apps/web/tsconfig.node.json ./apps/web/

# Copy shared packages (needed for building)
COPY packages/shared/ ./packages/shared/
COPY packages/ui/ ./packages/ui/

# Copy Web application
COPY apps/web/ ./apps/web/

# Install dependencies from root (npm workspaces will handle all packages)
RUN npm ci --workspaces

# Build shared packages first (they're dependencies of the web app)
WORKDIR /app
RUN npm run build:shared
RUN npm run build:ui

# Build Web
RUN npm run build:web

# Expose port
EXPOSE 5173

# Set working directory to Web for runtime
WORKDIR /app/apps/web

# Start the application (using preview for production)
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]


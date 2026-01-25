# Multi-stage build for optimized production image
# Stage 1: Build stage - compile TypeScript and install dependencies
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
# Copying package files first allows Docker to cache npm install layer
COPY package.json pnpm-lock.yaml* ./

# Install pnpm package manager
RUN npm install -g pnpm

# Install ALL dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript to JavaScript
# Output goes to dist/ directory
RUN pnpm build

# Stage 2: Production stage - minimal runtime image
FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Install pnpm in production image
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install ONLY production dependencies (no devDependencies)
# This significantly reduces image size
RUN pnpm install --frozen-lockfile --prod

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy configuration files if needed
# COPY --from=builder /app/src/config.ts ./src/config.ts

# Set environment variables
# These will be overridden by AWS Fargate task definition
ENV NODE_ENV=production

# Expose port (optional, for health checks)
EXPOSE 3000

# Run the orchestrator
# Uses node directly (not tsx) since code is already compiled
CMD ["node", "dist/index.js"]

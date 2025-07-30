# Multi-stage build for MCP Kanban Server - Optimized for minimal size
FROM node:18-alpine AS base

# Install only essential packages and security updates
RUN apk add --no-cache --update dumb-init ca-certificates && \
    apk upgrade && \
    rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with optimizations
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Development stage
FROM base AS development

# Install all dependencies including dev dependencies
RUN npm ci

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p data logs backups

# Expose ports
EXPOSE 3000 3001

# Start development server
CMD ["dumb-init", "npm", "run", "dev"]

# Build stage
FROM base AS build

# Install all dependencies for building
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage - Ultra-lightweight
FROM node:18-alpine AS production

# Install minimal packages and security updates
RUN apk add --no-cache --update dumb-init ca-certificates && \
    apk upgrade && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S kanban -u 1001

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies with maximum optimizations
RUN npm ci --only=production --no-audit --no-fund --no-optional && \
    npm cache clean --force && \
    rm -rf ~/.npm /tmp/* /var/tmp/* && \
    find /usr/local/lib/node_modules/npm -name test -o -name tests -type d | xargs rm -rf && \
    find /usr/local/lib/node_modules/npm -name '*.md' -o -name 'LICENSE*' -o -name 'CHANGELOG*' | xargs rm -f

# Copy only essential built files from build stage
COPY --from=build --chown=kanban:nodejs /app/dist ./dist

# Copy minimal necessary files
COPY --from=build --chown=kanban:nodejs /app/.env.example ./

# Create data directories with proper permissions
RUN mkdir -p data logs backups && \
    chown -R kanban:nodejs data logs backups && \
    chmod 750 data logs backups

# Switch to non-root user
USER kanban

# Expose port
EXPOSE 3000

# Optimized health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start production server
CMD ["dumb-init", "node", "dist/index.js"]
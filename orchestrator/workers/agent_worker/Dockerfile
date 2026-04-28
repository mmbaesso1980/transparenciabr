# ─── Stage 1: Build / dependency installation ────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifest files first for better layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# ─── Stage 2: Runtime image ───────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Add non-root user for least-privilege execution
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY server.js vertex_client.js ingestor_proxy.js package.json ./

# The engines/ directory is mounted or copied at build time by the CI pipeline.
# Relative import path: ../../../engines (resolved from workers/agent_worker/).
# In the Docker image engines/ lives at /app/engines/.
COPY engines/ ./engines/ 2>/dev/null || true

# Non-root runtime
USER appuser

EXPOSE 8080

# Health check (Cloud Run also uses /healthz)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "server.js"]

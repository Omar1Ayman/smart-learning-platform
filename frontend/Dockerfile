# ============================================================================
# Smart Learning Platform — Frontend production image.
#
# Uses Next.js standalone output (already configured in next.config.mjs).
# The final image is ~150MB instead of ~1GB because it ships only the
# server runtime + static assets, not node_modules or the Next.js CLI.
#
# IMPORTANT: NEXT_PUBLIC_* variables are baked into the JS bundle at BUILD
# time (Next.js requirement). For multi-environment deploys, rebuild per
# environment — or switch to a runtime-config approach (see DEPLOYMENT.md).
# ============================================================================

# ---- Stage 1: install deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        echo "WARNING: no package-lock.json — using npm install (non-reproducible)." >&2; \
        npm install; \
    fi

# ---- Stage 2: build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked at build. Pass via `--build-arg NEXT_PUBLIC_API_BASE_URL=...`.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN mkdir -p public && npm run build

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# standalone output bundles the server + minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
# --- deps: install dependencies in their own cacheable layer ---
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- builder: compile the production build ---
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN npm run build

# --- runner: minimal image, only the standalone server output ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000

RUN useradd --create-home appuser
COPY --from=builder /app/public ./public
COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static

USER appuser
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Keep dependency installation cached when only application source changes.
COPY apps/game-server/package.json apps/game-server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/admin-api/package.json apps/admin-api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/admin-contracts/package.json packages/admin-contracts/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts
# The admin analytics reader uses the PostHog CLI. Install only its native binary.
RUN node node_modules/@posthog/cli/install.js
COPY apps apps
COPY packages packages
COPY scripts/build-site.mjs scripts/build-site.mjs
ARG VITE_SUPABASE_URL=https://lkgxpgcmspxekggndzih.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_GAME_SERVER_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY VITE_GAME_SERVER_URL=$VITE_GAME_SERVER_URL
RUN npm run build:site && npm run build --workspace @shootball/admin-api
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production ADMIN_AUTH_MODE=supabase ADMIN_INVENTORY_PROVIDER=gcp PORT=8080 STATIC_ROOT=/app/apps/web/dist
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/admin-api/dist ./apps/admin-api/dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node deploy/environments.json ./deploy/environments.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/admin-api/dist/index.js"]

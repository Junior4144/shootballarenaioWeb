FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps apps
COPY packages packages
COPY scripts/build-site.mjs scripts/build-site.mjs
RUN npm ci --ignore-scripts
ARG VITE_SUPABASE_URL=https://lkgxpgcmspxekggndzih.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_GAME_SERVER_URL
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

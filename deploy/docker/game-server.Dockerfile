FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/game-server/package.json apps/game-server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/admin-api/package.json apps/admin-api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci --ignore-scripts
COPY apps/game-server apps/game-server
COPY apps/web/src apps/web/src
RUN npm run build --workspace @shootball/game-server
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production GAME_SERVER_HOST=0.0.0.0 GAME_SERVER_PORT=2567
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/game-server/dist ./apps/game-server/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:2567/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/game-server/dist/index.js"]

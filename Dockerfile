# syntax=docker/dockerfile:1

FROM node:20-alpine AS build

WORKDIR /app

# Pin the package-manager major used to produce the lockfile. npm is available
# in the official Node image and avoids Corepack signature drift in CI.
RUN npm install --global pnpm@11.7.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html vite.config.ts tsconfig.json tsconfig.server.json ./
COPY public ./public
COPY shared ./shared
COPY server ./server
COPY src ./src

RUN pnpm build \
    && pnpm prune --prod

FROM node:20-alpine AS runtime

LABEL org.opencontainers.image.title="ReleaseProof" \
      org.opencontainers.image.description="Proof-carrying data release autopilot powered by Qwen Cloud" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=8787 \
    AUDIT_STORE=file \
    RELEASEPROOF_DATA_FILE=/app/data/releaseproof-store.json \
    DEPLOYMENT_TARGET=container

WORKDIR /app

RUN addgroup -S releaseproof \
    && adduser -S -G releaseproof -h /app releaseproof \
    && mkdir -p /app/data \
    && chown -R releaseproof:releaseproof /app

COPY --from=build --chown=releaseproof:releaseproof /app/package.json ./package.json
COPY --from=build --chown=releaseproof:releaseproof /app/node_modules ./node_modules
COPY --from=build --chown=releaseproof:releaseproof /app/dist ./dist
COPY --from=build --chown=releaseproof:releaseproof /app/dist-server ./dist-server

USER releaseproof

EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist-server/server/index.js"]

# syntax=docker/dockerfile:1
# Dos a Uno · Rusty Together — single container: Colyseus (WebSocket rooms +
# WebRTC signalling) and the static client on one port. Ready for Sliplane.

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
# Optional build-time client settings (leave empty for same-origin + public STUN).
ARG VITE_SERVER_URL=""
ARG VITE_TURN_URL=""
ARG VITE_TURN_USER=""
ARG VITE_TURN_PASS=""
RUN npm run build && npm prune --omit=dev --omit=peer --no-audit --no-fund

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json .npmrc ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
# Node 22 runs the TypeScript server directly (type stripping), no build step.
CMD ["node", "server/index.ts"]

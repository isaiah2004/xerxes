# syntax=docker/dockerfile:1
# Xerxes backend: Hono API + Codex CLI brain (MCP tools served by this same process).

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/*
ARG CODEX_VERSION=latest
RUN npm i -g @openai/codex@${CODEX_VERSION} && npm cache clean --force

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# All state (JSON db, Codex threads + login) lives on the /data volume.
ENV NODE_ENV=production \
    PORT=8787 \
    XERXES_DATA_DIR=/data \
    CODEX_HOME=/data/codex
RUN mkdir -p /data/codex && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

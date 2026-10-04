FROM node:22.23.3-bookworm-slim AS dependencies
RUN npm install -g pnpm@12.8.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
COPY patches patches
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .

FROM dependencies AS server-build
RUN pnpm --filter @open-file/server build
RUN pnpm --config.allowUnusedPatches=true --filter @open-file/server deploy --prod --legacy /runtime
FROM node:22.23.3-bookworm-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/server
COPY --from=server-build --chown=node:node /runtime ./
RUN mkdir -p /data/files && chown node:node /data/files
USER node
WORKDIR /app
EXPOSE 3001
CMD ["node", "apps/server/dist/main.js"]

FROM dependencies AS frontend-build
ENV API_INTERNAL_URL=http://backend:3001
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @open-file/web build
FROM node:22.23.3-bookworm-slim AS frontend
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=frontend-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=frontend-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=frontend-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

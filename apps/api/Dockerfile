# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:25-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Package files first: this layer, and the install, are reused from cache
# until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @perspective/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @perspective/api build \
  && pnpm --filter @perspective/api deploy --prod /out

FROM node:25-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules node_modules
COPY --from=build /repo/apps/api/dist dist
COPY --from=build /repo/apps/api/migrations migrations
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
# Migrate first; then the server starts without the migrator's password (D19).
CMD ["sh", "-c", "node --enable-source-maps dist/migrate.js && exec env -u MIGRATION_DATABASE_URL node --enable-source-maps dist/server.js"]

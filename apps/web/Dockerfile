# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @perspective/web...

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @perspective/web build

# Runs as a non-root user, which is why it listens on 8080 rather than 80.
FROM nginxinc/nginx-unprivileged:1.31-alpine
ENV API_UPSTREAM=http://api:3000
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

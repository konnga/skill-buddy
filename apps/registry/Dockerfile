FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/registry/package.json apps/registry/
RUN pnpm install --filter @skills-manager/registry --frozen-lockfile
COPY apps/registry apps/registry
RUN pnpm --filter @skills-manager/registry build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/registry/package.json apps/registry/
RUN pnpm install --filter @skills-manager/registry --frozen-lockfile --prod
COPY --from=build /app/apps/registry/dist apps/registry/dist
VOLUME /data
ENV DB_PATH=/data/registry.db
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "apps/registry/dist/index.js"]

FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @kc/web build

FROM node:20-slim AS runner
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 3000

CMD ["node", "apps/web/.output/server/index.mjs"]

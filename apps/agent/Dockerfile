FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/agent ./apps/agent

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @kc/agent build

FROM node:20-slim AS runner
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 4111
ENV PORT=4111

CMD ["pnpm", "--filter", "@kc/agent", "dev"]

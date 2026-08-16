FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/agent ./apps/agent
ARG DATABASE_URL=postgresql://placeholder@localhost:26257/placeholder
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm install --frozen-lockfile

# @kc/env validates the agent's variables the moment it is imported, and the
# Mastra CLI imports the config to build it. A build has no credentials, so the
# check is deferred to runtime — where the values actually arrive, through
# compose's env_file.
ENV SKIP_ENV_VALIDATION=1

RUN pnpm --filter agent build

FROM node:20-slim AS runner
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 4111
ENV PORT=4111

# `dev` rather than `start`, carried over from the image this replaces. The
# package now has a `mastra start`, which is the right command for a built
# bundle — but it has never run in this deployment, and swapping it in blind
# would be a production change made on inference rather than evidence.
CMD ["pnpm", "--filter", "agent", "dev"]

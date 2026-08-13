FROM node:20-slim AS builder
# Prisma's query engine links against libssl, which node:*-slim does not ship.
# Without it Prisma guesses a build ("Defaulting to openssl-1.1.x") that may not
# load at runtime — a warning at build time, a dead database client later.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.8.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/client ./apps/client

# The client's build script packs the browser extension into public/ before
# running `next build`, so both the script and the folder it reads have to be in
# the image. Without them the build stops at "Cannot find module
# ../../scripts/pack-extension.mjs" — after the dependency install, which is the
# expensive half. apps/extension is also a workspace member, so copying it keeps
# `--frozen-lockfile` looking at the same set of packages as the lockfile.
COPY scripts ./scripts
COPY apps/extension ./apps/extension

# `pnpm install` runs @kc/db's postinstall, which is `prisma generate`, which
# resolves DATABASE_URL from prisma.config.ts. It never opens a connection — the
# value only has to be present and parse — so a placeholder is enough to build
# with, and the real one arrives at runtime through the compose env_file.
ARG DATABASE_URL=postgresql://placeholder@localhost:26257/placeholder
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm install --frozen-lockfile

# Where the browser will look for the API and the agent.
#
# Next substitutes NEXT_PUBLIC_* into the client bundle at build time, so they
# cannot be supplied later as container environment variables — a runtime -e
# does nothing. They must be passed here:
#
#   docker build \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_MASTRA_URL=https://agent.example.com \
#     -f apps/client/Dockerfile .
#
# The app it replaces shipped without them once: every visitor's browser asked
# their own machine — http://localhost:8000 — for the knowledge base, pages came
# back empty because the loaders swallow the failure, and navigation stalled on
# the private-network preflight Chrome performs before refusing a public page's
# request for localhost. src/lib/api-client.ts logs loudly in production when
# the value is missing, because an unset NEXT_PUBLIC_* is baked in as "" rather
# than undefined and slips past a `??` default.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MASTRA_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MASTRA_URL=$NEXT_PUBLIC_MASTRA_URL

# Fail here rather than ship an image that points every visitor at their own
# machine. Placed after the install so a missing value costs a few seconds, not
# a full dependency resolution, and before the build so it never gets that far.
RUN test -n "$NEXT_PUBLIC_API_URL" -a -n "$NEXT_PUBLIC_MASTRA_URL" || { \
      echo "NEXT_PUBLIC_API_URL and NEXT_PUBLIC_MASTRA_URL must be passed as --build-arg."; \
      echo "They are baked into the client bundle; setting them at runtime does nothing."; \
      exit 1; \
    }

# The server-side variables (@kc/env/server: the real DATABASE_URL, the auth
# secret, the allowed origin) are validated at runtime rather than here. A build
# has no secret and no database, and `next build` imports the auth server while
# collecting page data — so without this the image cannot be built at all
# without being handed production credentials.
ENV SKIP_ENV_VALIDATION=1

RUN pnpm --filter client build

FROM node:20-slim AS runner
# Prisma's query engine links against libssl, which node:*-slim does not ship.
# Without it Prisma guesses a build ("Defaulting to openssl-1.1.x") that may not
# load at runtime — a warning at build time, a dead database client later.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "--filter", "client", "start"]

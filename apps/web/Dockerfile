FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile

# Where the browser will look for the API and the agent.
#
# These are substituted into the client bundle by Vite at build time, so they
# cannot be supplied later as container environment variables — a runtime -e
# does nothing. They must be passed here:
#
#   docker build \
#     --build-arg VITE_API_URL=https://api.example.com \
#     --build-arg VITE_MASTRA_URL=https://agent.example.com \
#     -f apps/web/Dockerfile .
#
# Without them the image was built against the developer defaults and every
# visitor's browser asked their own machine — http://localhost:8000 — for the
# knowledge base. Pages came back empty because the loaders swallow the failure,
# and navigation stalled for seconds on the private-network preflight Chrome
# performs before refusing a public page's request for localhost.
#
# The build now fails rather than shipping that again; see src/lib/service-url.ts.
ARG VITE_API_URL
ARG VITE_MASTRA_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MASTRA_URL=$VITE_MASTRA_URL

RUN pnpm --filter @kc/web build

FROM node:20-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 3000

CMD ["pnpm", "--filter", "@kc/web", "start"]

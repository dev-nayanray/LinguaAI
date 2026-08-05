# syntax=docker/dockerfile:1
# Multi-stage build — see infrastructure/docker/web/Dockerfile for the full
# rationale (apps/admin uses the identical Next.js standalone-output
# pattern, separate deploy target per T15).
#
# Hardening (T17, Risk #9/R-30): non-root user (below); runs correctly
# under `docker run --read-only --cap-drop=ALL` (verified empirically,
# same as apps/web). read-only/cap-drop themselves are runtime flags (ECS
# task definition, T18), not something a Dockerfile can force on its own.
# ECS CPU/memory resource limits are also a task-definition (T18) concern.

FROM node:22-alpine AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.1.0
COPY . .
RUN turbo prune @linguaai/admin --docker

FROM node:22-alpine AS installer
WORKDIR /app
RUN npm install -g pnpm@9.12.0
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./tsconfig.base.json
COPY scripts ./scripts
RUN pnpm turbo run build --filter=@linguaai/admin

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs
# node:22-alpine bundles its own npm CLI (and npm's vendored deps: tar,
# sigstore, picomatch, brace-expansion, etc. -- some with CRITICAL/HIGH
# CVEs) under /usr/local/lib/node_modules/npm. This runner stage never
# runs npm/npx/corepack -- the CMD invokes `node` directly -- so removing
# them is a pure attack-surface reduction with no functional effect;
# verified (infrastructure/docker/ai-engine/Dockerfile) these CVEs come
# from npm's own vendored deps, not anything this app depends on.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=installer --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/admin/server.js"]

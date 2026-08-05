# syntax=docker/dockerfile:1
# Multi-stage build (DEPLOYMENT.md §2, E1 Part 8): a full-toolchain build
# stage, a slim node:22-alpine runtime stage. Turborepo's `prune` generates
# a minimal per-package source subset so the image only contains what
# services/analytics-service actually needs, not the whole monorepo.
#
# Hardening (T17, Risk #9/R-30): non-root user (below), and this image runs
# correctly under `docker run --read-only --cap-drop=ALL` with no extra
# flags — verified empirically; a plain Node/NestJS health-check service
# does no filesystem writes at runtime, so no tmpfs mount is needed here
# (contrast apps/web|admin, which do). read-only/cap-drop themselves are
# runtime flags (ECS task definition settings in Terraform, T18), not
# something a Dockerfile can force on its own — this file just doesn't
# break when they're applied. ECS CPU/memory resource limits are also a
# task-definition (T18) concern, not a Dockerfile one.

FROM node:22-alpine AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.1.0
COPY . .
RUN turbo prune @linguaai/analytics-service --docker

FROM node:22-alpine AS installer
WORKDIR /app
RUN npm install -g pnpm@9.12.0
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# turbo prune's output only includes what it can trace through the
# workspace package graph (package.jsons, turbo.json, the lockfile) — it
# does NOT know about loose root files referenced only via relative paths
# inside scripts (tsconfig.base.json's "extends" chain, the CJS-marker
# helper script packages/config and packages/observability's build steps
# call directly). Verified empirically: the build fails with "Cannot read
# file '/app/tsconfig.base.json'" without this.
COPY tsconfig.base.json ./tsconfig.base.json
COPY scripts ./scripts
RUN pnpm turbo run build --filter=@linguaai/analytics-service

# A genuinely separate prod-only install — NOT `pnpm prune --prod` run
# against the installer stage above. Verified empirically that prune does
# not remove root-level or cross-workspace devDependencies in this pruned-
# monorepo context (turbo, vite, vitest, and vitest's bundled esbuild —
# with real CVEs in its vendored Go stdlib — all survived `pnpm prune
# --prod`). A fresh `--prod` install never pulls them in at all.
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN npm install -g pnpm@9.12.0
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nestjs
# node:22-alpine bundles its own npm CLI (and npm's vendored deps: tar,
# sigstore, picomatch, brace-expansion, etc. -- some with CRITICAL/HIGH
# CVEs) under /usr/local/lib/node_modules/npm. This runner stage never
# runs npm/npx/corepack -- the CMD invokes `node` directly -- so removing
# them is a pure attack-surface reduction with no functional effect;
# verified the app still starts and serves /health after this. Confirmed
# via Trivy that these CVEs were coming from npm's own vendored deps, not
# anything this app depends on.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# Deliberately NOT `COPY --from=prod-deps /app .` (everything) — that
# includes pnpm-lock.yaml, which lists the FULL dependency graph
# (including devDependencies never actually installed here). A `COPY`
# then `RUN rm` of the same file in one stage does NOT remove it from the
# image for a layer-aware scanner like Trivy — the earlier layer's data is
# still part of the image, whiteout or not (verified empirically: deleting
# it that way changed nothing about Trivy's findings). Copying only the
# exact paths needed avoids ever putting it in a layer at all.
# packages/*/package.json are required at runtime — pnpm's node_modules
# symlinks point at these real directories, and Node's "exports" field
# resolution reads them directly, not through node_modules.
# services/analytics-service/package.json (no "type" field -> defaults to
# CommonJS) must also be present: Node determines a .js file's module
# system by walking UP from the file to the nearest package.json. Without
# this file, that walk skips straight to the root /app/package.json, which
# has "type": "module" (the workspace root is ESM), and Node then tries to
# parse the CJS-compiled dist/main.js as ESM and fails on `exports is not
# defined` — verified empirically.
# pnpm does not hoist a workspace package's own dependencies to the root
# node_modules — it symlinks them into that package's own node_modules
# (services/analytics-service/node_modules/{reflect-metadata,rxjs,@nestjs/*,...}),
# pointing back at the root .pnpm store. Both the root node_modules (for
# the store) and this workspace-local node_modules (for the symlinks) are
# required, or requires like `reflect-metadata` fail at startup — verified
# empirically.
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/config/package.json ./packages/config/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/observability/package.json ./packages/observability/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/observability/node_modules ./packages/observability/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/services/analytics-service/package.json ./services/analytics-service/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/services/analytics-service/node_modules ./services/analytics-service/node_modules
COPY --from=installer --chown=nestjs:nodejs /app/services/analytics-service/dist ./services/analytics-service/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/config/dist ./packages/config/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/config/dist-cjs ./packages/config/dist-cjs
COPY --from=installer --chown=nestjs:nodejs /app/packages/observability/dist ./packages/observability/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/observability/dist-cjs ./packages/observability/dist-cjs
USER nestjs
EXPOSE 4005
ENV PORT=4005
CMD ["node", "services/analytics-service/dist/main.js"]

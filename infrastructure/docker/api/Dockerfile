# syntax=docker/dockerfile:1
# Multi-stage build (DEPLOYMENT.md §2, E1 Part 8) — see
# infrastructure/docker/ai-engine/Dockerfile for the full rationale behind
# each stage; apps/api follows the identical pattern.
#
# Hardening (T17, Risk #9/R-30): non-root user (below), and this image runs
# correctly under `docker run --read-only --cap-drop=ALL` with no extra
# flags — verified empirically. read-only/cap-drop themselves are runtime
# flags (ECS task definition settings in Terraform, T18), not something a
# Dockerfile can force on its own. ECS CPU/memory resource limits are also
# a task-definition (T18) concern, not a Dockerfile one.

FROM node:22-alpine AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.1.0
COPY . .
RUN turbo prune @linguaai/api --docker

FROM node:22-alpine AS installer
WORKDIR /app
RUN npm install -g pnpm@9.12.0
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# turbo prune's Docker output doesn't include loose root files referenced
# only via relative paths inside scripts (tsconfig.base.json's "extends"
# chain, the CJS-marker helper script packages/config and
# packages/observability's build steps call directly) — verified
# empirically in T16.
COPY tsconfig.base.json ./tsconfig.base.json
COPY scripts ./scripts
RUN pnpm turbo run build --filter=@linguaai/api

# A genuinely separate prod-only install — NOT `pnpm prune --prod` run
# against the installer stage above. Verified empirically (ai-engine) that
# prune does not remove root-level or cross-workspace devDependencies in
# this pruned-monorepo context (turbo, vite, vitest, and vitest's bundled
# esbuild — with real CVEs in its vendored Go stdlib — all survived `pnpm
# prune --prod`). A fresh `--prod` install never pulls them in at all.
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
# still part of the image, whiteout or not (verified empirically on
# ai-engine). Copying only the exact paths needed avoids ever putting it
# in a layer at all.
# packages/*/package.json are required at runtime — pnpm's node_modules
# symlinks point at these real directories, and Node's "exports" field
# resolution reads them directly, not through node_modules.
# apps/api/package.json (no "type" field -> defaults to CommonJS) must
# also be present: Node determines a .js file's module system by walking
# UP from the file to the nearest package.json. Without this file, that
# walk skips straight to the root /app/package.json, which has "type":
# "module" (the workspace root is ESM), and Node then tries to parse the
# CJS-compiled dist/main.js as ESM and fails on `exports is not defined`
# — verified empirically on ai-engine.
# pnpm does not hoist a workspace package's own dependencies to the root
# node_modules — it symlinks them into that package's own node_modules
# (apps/api/node_modules/{reflect-metadata,rxjs,@nestjs/*,...}), pointing
# back at the root .pnpm store. Both the root node_modules (for the
# store) and this workspace-local node_modules (for the symlinks) are
# required, or requires like `reflect-metadata` fail at startup —
# verified empirically on ai-engine.
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/package.json ./package.json
# @prisma/client's own generated output — see the matching comment in
# infrastructure/docker/ai-engine/Dockerfile for the full explanation
# (same root cause, same fix, both files depend on packages/database).
# The hashed path must be re-verified if a future lockfile change ever
# bumps @prisma/client, prisma, or their resolved peers.
COPY --from=installer --chown=nestjs:nodejs /app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_magicast@0.3.5_typescript@5.9.3__typescript@5.9.3/node_modules/.prisma ./node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_magicast@0.3.5_typescript@5.9.3__typescript@5.9.3/node_modules/.prisma
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/config/package.json ./packages/config/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/observability/package.json ./packages/observability/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/observability/node_modules ./packages/observability/node_modules
# packages/database/events/utils/types/validation — real, direct (or
# database's own transitive) dependencies of apps/api, missing from this
# file until this fix. Same root cause as ai-engine's identical gap
# (infrastructure/docker/ai-engine/Dockerfile): `turbo prune`'s own
# dependency-graph traversal (the pruner stage above) correctly includes
# all of these in the pruned workspace, so the build itself succeeds
# either way, but this runner stage's copy list is hand-maintained per
# package, not graph-derived — without this, the final image built and
# passed a plain `docker build`/scan with no error, yet would crash on
# first real request (`Cannot find module '@linguaai/database'`, etc.)
# since none of these were ever actually present in the image.
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/database/package.json ./packages/database/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/events/package.json ./packages/events/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/events/node_modules ./packages/events/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/utils/package.json ./packages/utils/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/utils/node_modules ./packages/utils/node_modules
# packages/types has no "dependencies" of its own (a pure type-only
# package) — pnpm never creates a node_modules directory for it at all,
# verified empirically; unlike every other package.json+node_modules pair
# here, only the package.json (needed for its own "exports" resolution)
# is copied.
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/types/package.json ./packages/types/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/validation/package.json ./packages/validation/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/validation/node_modules ./packages/validation/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=installer --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/config/dist ./packages/config/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/config/dist-cjs ./packages/config/dist-cjs
COPY --from=installer --chown=nestjs:nodejs /app/packages/observability/dist ./packages/observability/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/observability/dist-cjs ./packages/observability/dist-cjs
COPY --from=installer --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/database/dist-cjs ./packages/database/dist-cjs
COPY --from=installer --chown=nestjs:nodejs /app/packages/events/dist ./packages/events/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/events/dist-cjs ./packages/events/dist-cjs
COPY --from=installer --chown=nestjs:nodejs /app/packages/utils/dist ./packages/utils/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/utils/dist-cjs ./packages/utils/dist-cjs
COPY --from=installer --chown=nestjs:nodejs /app/packages/types/dist ./packages/types/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/types/dist-cjs ./packages/types/dist-cjs
COPY --from=installer --chown=nestjs:nodejs /app/packages/validation/dist ./packages/validation/dist
COPY --from=installer --chown=nestjs:nodejs /app/packages/validation/dist-cjs ./packages/validation/dist-cjs
USER nestjs
EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/main.js"]

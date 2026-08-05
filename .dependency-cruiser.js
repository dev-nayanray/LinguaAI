/**
 * Intra-app NestJS module boundary rule (CODING_STANDARDS.md §2, E1 Part 12,
 * remediates Architecture Review "High 2"). A module under `modules/<name>/`
 * (in `apps/api` or any `services/*`) may only be imported from *outside*
 * its own folder via its `index.ts` — never a deep internal file. Files
 * *within* the same module may freely import each other.
 */
export default {
  forbidden: [
    {
      name: 'no-cross-module-internal-import',
      comment:
        "A NestJS module may only be imported via its index.ts (exported public API) — never a deep internal file. Import from the sibling module's index instead.",
      severity: 'error',
      from: {
        path: '^(apps/api|services/[^/]+)/src/modules/([^/]+)/',
      },
      to: {
        // $1 = the matched app/service root, $2 = the source module name
        // (both captured from `from.path` above — dependency-cruiser
        // substitutes $-numbered placeholders with from's capture groups,
        // NOT backslash-numbered backreferences — verified empirically
        // against node_modules/dependency-cruiser/src/utl/regex-util.mjs).
        path: '^$1/src/modules/[^/]+/',
        pathNot: ['^$1/src/modules/$2/', '^$1/src/modules/[^/]+/index\\.ts$'],
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
};

// Fixture for the intra-app module-boundary regression check (T4).
// Deliberately violates the rule: a module may only import a sibling module
// via its index.ts (exported public API), never a deep internal file.
// dependency-cruiser's `no-cross-module-internal-import` rule must reject
// this. See scripts/verify-boundary-lint.mjs.
import { internalServiceA } from '../__boundary_fixture_a__/internal.service.js';

export const violatingImport = internalServiceA;

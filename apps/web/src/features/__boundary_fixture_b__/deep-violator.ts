// Fixture for the intra-app frontend feature-boundary regression check (T4).
// Deliberately violates the rule: a feature folder may only be imported via
// its index.ts, never a deep internal file. See scripts/verify-boundary-lint.mjs.
import { internalA } from '../__boundary_fixture_a__/internal';

export const violatingImport = internalA;

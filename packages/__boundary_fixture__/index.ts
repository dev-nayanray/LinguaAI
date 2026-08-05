// Fixture for ADR-015's boundary-lint regression check (T3). Not a real
// package — no package.json, so pnpm never registers it as a workspace member.
// Deliberately violates the rule: packages/* must never import apps/*.
// scripts/verify-boundary-lint.mjs asserts ESLint rejects this file for
// `boundaries/element-types` — if this file ever stops failing lint, the
// inter-package boundary rule has regressed.
import { fakeApp } from '../../apps/__boundary_fixture__/index';

export const fakePackage = fakeApp;

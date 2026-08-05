// Fixture for ADR-015's boundary-lint regression check (T3). Not a real app —
// no package.json, so pnpm never registers it as a workspace member.
// See scripts/verify-boundary-lint.mjs.
export const fakeApp = 'app';

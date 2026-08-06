// Fixture for the `ui-package` boundary-lint regression check (E3 T2,
// docs/epics/E3-design-system-component-library.md §6a). Not a real
// package — this directory has no package.json, so pnpm never registers it
// as a workspace member (confirmed: `turbo run lint` never fans out into
// it; only scripts/verify-boundary-lint.mjs's explicit-path invocation
// evaluates this file).
//
// Deliberately violates the rule: packages/* must never import
// packages/ui. A relative import is used deliberately, not the bare
// `@linguaai/ui` package specifier — this directory has no `node_modules`
// of its own (it is not a workspace member), so a bare specifier would be
// unresolvable and eslint-plugin-boundaries would treat it as an external
// import, silently passing instead of catching the violation.
import { cn } from '../ui/src/lib/cn';

export const fakeClassName = cn('a', 'b');

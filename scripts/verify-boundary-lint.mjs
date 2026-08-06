#!/usr/bin/env node
// Regression guard for the two intra-repo boundary mechanisms:
//   - ADR-015 (inter-package: apps/packages/services tiers, ESLint)
//   - E1 Part 12 "High 2" remediation (intra-app: NestJS modules via
//     dependency-cruiser; frontend feature folders via ESLint)
//
// Each fixture pair below is checked for BOTH outcomes: the deliberately
// violating file must fail, AND the legitimate same-element/via-entry-point
// imports must pass — a rule that blocks everything indiscriminately would
// pass a "does it fail" check but silently break real development. Wired
// into the root `lint` script so `pnpm lint` (and CI, once T19 lands)
// exercises all of this on every run, not just once when it was written.

import { execSync } from 'node:child_process';

function run(command) {
  try {
    execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' });
    return { exitCode: 0, output: '' };
  } catch (error) {
    return { exitCode: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const checks = [
  {
    name: 'ADR-015 inter-package: packages/* must not import apps/* (violation)',
    command: 'pnpm exec eslint packages/__boundary_fixture__/index.ts --no-warn-ignored',
    expect: 'fail',
    expectedText: 'boundaries/element-types',
  },
  {
    name: 'ADR-015 inter-package: apps/* fixture with no violating import (control)',
    command: 'pnpm exec eslint apps/__boundary_fixture__/index.ts --no-warn-ignored',
    expect: 'pass',
  },
  {
    name: 'Intra-app NestJS: cross-module deep import (violation)',
    command:
      'pnpm exec depcruise --config .dependency-cruiser.js apps/api/src/modules/__boundary_fixture_b__/deep-violator.ts',
    expect: 'fail',
    expectedText: 'no-cross-module-internal-import',
  },
  {
    name: 'Intra-app NestJS: same-module import (control)',
    command:
      'pnpm exec depcruise --config .dependency-cruiser.js apps/api/src/modules/__boundary_fixture_a__/index.ts',
    expect: 'pass',
  },
  {
    name: 'Intra-app NestJS: cross-module import via index.ts (control)',
    command:
      'pnpm exec depcruise --config .dependency-cruiser.js apps/api/src/modules/__boundary_fixture_b__/index.ts',
    expect: 'pass',
  },
  {
    name: 'Intra-app frontend: cross-feature deep import (violation)',
    command:
      'pnpm exec eslint apps/web/src/features/__boundary_fixture_b__/deep-violator.ts --no-warn-ignored',
    expect: 'fail',
    expectedText: 'boundaries/entry-point',
  },
  {
    name: 'Intra-app frontend: same-feature import (control)',
    command: 'pnpm exec eslint apps/web/src/features/__boundary_fixture_a__/index.ts --no-warn-ignored',
    expect: 'pass',
  },
  {
    name: 'Intra-app frontend: cross-feature import via index.ts (control)',
    command: 'pnpm exec eslint apps/web/src/features/__boundary_fixture_b__/index.ts --no-warn-ignored',
    expect: 'pass',
  },
  {
    // E3 T2 (docs/epics/E3-design-system-component-library.md §6a): the
    // ui-package boundary — packages/* must never import packages/ui.
    name: 'E3 ui-package: packages/* must not import packages/ui (violation)',
    command: 'pnpm exec eslint packages/__boundary_fixture__/ui-violator.ts --no-warn-ignored',
    expect: 'fail',
    expectedText: 'boundaries/element-types',
  },
  {
    // Control for the same rule, against a real, already-existing import —
    // apps/* → packages/ui is the one direction this boundary must allow.
    name: 'E3 ui-package: apps/* may import packages/ui (control, real import)',
    command: 'pnpm exec eslint apps/web/src/app/login/page.tsx --no-warn-ignored',
    expect: 'pass',
  },
];

let failures = 0;

for (const check of checks) {
  const { exitCode, output } = run(check.command);
  const actuallyFailed = exitCode !== 0;
  const shouldFail = check.expect === 'fail';

  if (actuallyFailed !== shouldFail) {
    failures += 1;
    console.error(`FAIL: ${check.name}`);
    console.error(
      `  expected the command to ${shouldFail ? 'FAIL' : 'PASS'}, but it ${actuallyFailed ? 'failed' : 'passed'}.`,
    );
    if (output) console.error(`  output:\n${output}`);
    continue;
  }

  if (shouldFail && check.expectedText && !output.includes(check.expectedText)) {
    failures += 1;
    console.error(`FAIL: ${check.name}`);
    console.error(
      `  failed as expected, but not for the expected reason ("${check.expectedText}" not found in output).`,
    );
    console.error(`  output:\n${output}`);
    continue;
  }

  console.log(`OK: ${check.name}`);
}

if (failures > 0) {
  console.error(
    `\n${failures} of ${checks.length} boundary-lint regression checks failed — a boundary rule (ADR-015 or the E1 Part 12 intra-app rules) may have regressed, or a legitimate import pattern is being incorrectly blocked.`,
  );
  process.exit(1);
}

console.log(`\nAll ${checks.length} boundary-lint regression checks passed.`);
process.exit(0);

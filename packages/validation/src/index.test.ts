import { describe, expect, it } from 'vitest';

// Imported by the package's OWN published name (not a relative path) —
// this exercises the exact same resolution mechanism (package.json
// "exports", resolved natively by Node/tsc self-referencing — see T7's
// packages/types report) a real consuming package will use once Zod
// schemas land here in E2+. Proves both compile-time resolution (tsc must
// resolve these specifiers to typecheck this file) and runtime resolution
// (vitest actually loading the modules). T8 acceptance criteria: same as
// T7, for validation.
import * as aiCoaching from '@linguaai/validation/ai-coaching';
import * as commerce from '@linguaai/validation/commerce';
import * as community from '@linguaai/validation/community';
import * as content from '@linguaai/validation/content';
import * as enterprise from '@linguaai/validation/enterprise';
import * as identity from '@linguaai/validation/identity';
import * as learning from '@linguaai/validation/learning';

describe('@linguaai/validation subpath exports', () => {
  it.each([
    ['identity', identity],
    ['learning', learning],
    ['ai-coaching', aiCoaching],
    ['content', content],
    ['commerce', commerce],
    ['community', community],
    ['enterprise', enterprise],
  ])('%s subpath resolves via the package exports map', (_name, module) => {
    expect(module).toBeDefined();
  });
});

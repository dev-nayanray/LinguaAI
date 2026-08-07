import { describe, expect, it } from 'vitest';

// Imported by the package's OWN published name (not a relative path) —
// this exercises the exact same resolution mechanism (package.json
// "exports" + workspace:* symlink) a real consuming package will use once
// domain types land here in E2+. Proves both compile-time resolution (tsc
// must resolve these specifiers to typecheck this file) and runtime
// resolution (vitest actually loading the modules). T7 acceptance
// criteria: "@linguaai/types/identity (empty) resolves from another
// workspace package."
import * as aiCoaching from '@linguaai/types/ai-coaching';
import * as commerce from '@linguaai/types/commerce';
import * as community from '@linguaai/types/community';
import * as content from '@linguaai/types/content';
import * as enterprise from '@linguaai/types/enterprise';
import * as identity from '@linguaai/types/identity';
import * as learning from '@linguaai/types/learning';

describe('@linguaai/types subpath exports', () => {
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

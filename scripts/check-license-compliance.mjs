#!/usr/bin/env node
// License-compliance gate for security-scan.yml (T20). DEPLOYMENT.md §4:
// "A license-checker step flagging copyleft/incompatible licenses
// (GPL/AGPL etc.) in new dependencies."
//
// The npm package `license-checker` (and its `-rseidelsohn` fork) don't
// correctly walk this pnpm workspace's node_modules/.pnpm structure —
// verified empirically: both report only ~42 packages total, while
// pnpm's own `pnpm licenses list` correctly finds the full dependency
// graph (hundreds of packages, including transitive ones neither tool
// saw). Using pnpm's native command instead avoids that gap entirely.
//
// Only GPL and AGPL variants block the build — LGPL is deliberately NOT
// on the denylist. DEPLOYMENT.md's own wording names "GPL/AGPL etc." as
// the concern, not LGPL; LGPL is specifically designed to permit safe
// consumption by proprietary software via dynamic linking/dependency
// consumption (unlike GPL/AGPL's stronger copyleft), which is exactly
// how npm/pnpm dependencies are consumed here. Blocking on it would
// immediately fail this check on `sharp` (Apache-2.0 AND
// LGPL-3.0-or-later, via its bundled libvips) — a legitimate, necessary
// Next.js dependency, not a real IP-risk finding.

import { execSync } from 'node:child_process';

const raw = execSync('pnpm licenses list --prod --json', {
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const licenses = JSON.parse(raw);

function isCopyleftDisallowed(token) {
  const t = token.trim();
  return t === 'GPL' || t.startsWith('GPL-') || t === 'AGPL' || t.startsWith('AGPL-');
}

const violations = [];
for (const [licenseExpr, packages] of Object.entries(licenses)) {
  // License expressions can be compound, e.g. "Apache-2.0 AND
  // LGPL-3.0-or-later" — split on common SPDX expression separators
  // before matching individual license identifiers.
  const tokens = licenseExpr.split(/\s+(?:AND|OR)\s+|\/|,/).map((t) => t.trim());
  if (tokens.some(isCopyleftDisallowed)) {
    for (const pkg of packages) {
      violations.push({ name: pkg.name, versions: pkg.versions, license: licenseExpr });
    }
  }
}

if (violations.length > 0) {
  console.error('GPL/AGPL-licensed production dependencies found:');
  for (const v of violations) {
    console.error(`  ${v.name}@${v.versions.join(',')} — ${v.license}`);
  }
  process.exit(1);
}

console.log(`No GPL/AGPL production dependencies found (${Object.values(licenses).flat().length} packages checked).`);
process.exit(0);

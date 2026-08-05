#!/usr/bin/env node
// Blocking gate for security-scan.yml's dependency-audit job (T20).
//
// `pnpm audit` has no built-in per-advisory allowlist, so a genuinely
// unfixable transitive-dependency CVE (see .github/security/
// dependency-audit-allowlist.json) would leave this check permanently
// red — the exact failure mode E1 Part 10 warns against for the
// container-scan job ("a permanently-unfixable transitive dependency
// must not make the pipeline permanently red"). This script applies the
// same principle to the dependency audit: every Critical/High finding is
// printed for visibility, but the job only fails on one that isn't in
// the allowlist — so a *new* vulnerable dependency still blocks the PR,
// while already-documented, already-justified exceptions don't.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const allowlistPath = path.join(repoRoot, '.github', 'security', 'dependency-audit-allowlist.json');
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf-8')).ignoredAdvisories;
const allowlistedIds = new Set(allowlist.map((entry) => entry.id));

function runAudit() {
  try {
    return execSync('pnpm audit --prod --audit-level=high --json', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // `pnpm audit` exits non-zero when it finds matching vulnerabilities —
    // that's the expected path here, and the JSON is still on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

const raw = runAudit();
let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('Could not parse `pnpm audit --json` output as JSON:');
  console.error(raw);
  process.exit(1);
}

const advisories = Object.values(report.advisories ?? {});
const relevant = advisories.filter((a) => a.severity === 'critical' || a.severity === 'high');

if (relevant.length === 0) {
  console.log('No Critical/High production-dependency advisories found.');
  process.exit(0);
}

let blocking = false;
for (const advisory of relevant) {
  const ghsaId = advisory.github_advisory_id;
  const allowed = allowlistedIds.has(ghsaId);
  const marker = allowed ? 'ALLOWLISTED' : 'BLOCKING';
  console.log(
    `[${marker}] ${advisory.severity.toUpperCase()} — ${advisory.module_name} — ${ghsaId} — ${advisory.title}`,
  );
  if (!allowed) blocking = true;
}

if (blocking) {
  console.error(
    '\nOne or more Critical/High advisories are not in .github/security/dependency-audit-allowlist.json — failing.',
  );
  process.exit(1);
}

console.log('\nAll Critical/High findings are already-documented, allowlisted exceptions.');
process.exit(0);

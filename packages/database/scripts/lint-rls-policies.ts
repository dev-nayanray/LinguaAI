// E4 T11 — interim RLS-policy-lint script (docs/epics/
// E4-database-schema-core-data-layer.md §10 resolved item 1,
// MULTITENANCY.md §6). Closes the gap named in that epic doc's §3.2: no
// mechanical CI check previously existed for "a tenant-scoped table
// ships its RLS policy in the same migration" — only code-review
// discipline. This is explicitly the INTERIM version: a permanent
// replacement is E22's own schema-lint script (Security Hardening &
// Compliance Gate); this one is deliberately simple static analysis over
// migration SQL text, not a full SQL parser.
//
// What it checks: MULTITENANCY.md §1 defines tenant-scoped data as
// row-level-tenancy via an `organizationId` column. This script scans
// every migration.sql file in order and tracks, per table: (a) whether
// it was ever given an `organizationId` column (via CREATE TABLE or a
// later ALTER TABLE ADD COLUMN), and (b) whether it was ever given
// `ENABLE ROW LEVEL SECURITY`. Any table with (a) but not (b) fails the
// check.
//
// Known false-negative case (documented, not hidden): a table that adds
// `organizationId` via a column type this script's regex doesn't
// recognize (e.g. a renamed/computed column, or RLS enabled inside a
// PL/pgSQL DO block rather than a literal `ALTER TABLE ... ENABLE ROW
// LEVEL SECURITY` statement) would not be caught. E22's own full
// implementation is expected to parse real SQL via a proper parser
// instead of text patterns, closing this gap permanently.
//
// Usage: tsx scripts/lint-rls-policies.ts
// Exit code 0 = pass, 1 = fail (one or more tenant-scoped tables missing RLS).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

const CREATE_TABLE_RE = /CREATE TABLE\s+"(\w+)"\s*\(([\s\S]*?)\n\)/g;
const ADD_COLUMN_ORG_RE = /ALTER TABLE\s+"(\w+)"\s+ADD COLUMN\s+"organizationId"/g;
const DROP_COLUMN_ORG_RE = /ALTER TABLE\s+"(\w+)"\s+DROP COLUMN\s+"organizationId"/g;
const RENAME_TABLE_RE = /ALTER TABLE\s+"(\w+)"\s+RENAME TO\s+"(\w+)"/g;
const DROP_TABLE_RE = /DROP TABLE\s+(?:IF EXISTS\s+)?"(\w+)"/g;
const ENABLE_RLS_RE = /ALTER TABLE\s+"(\w+)"\s+ENABLE ROW LEVEL SECURITY/g;

function getMigrationFolders(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
    .sort(); // migration folder names are timestamp-prefixed — sort() gives chronological order
}

function lint(): void {
  const hasOrgColumn = new Set<string>();
  const hasRls = new Set<string>();
  const everExisted = new Set<string>();

  for (const folder of getMigrationFolders()) {
    const sqlPath = join(migrationsDir, folder, 'migration.sql');
    let sql: string;
    try {
      sql = readFileSync(sqlPath, 'utf8');
    } catch {
      continue; // migration_lock.toml and any non-SQL entries
    }

    for (const match of sql.matchAll(CREATE_TABLE_RE)) {
      const [, tableName, body] = match;
      if (!tableName || body === undefined) continue;
      everExisted.add(tableName);
      if (/"organizationId"/.test(body)) {
        hasOrgColumn.add(tableName);
      }
    }

    for (const match of sql.matchAll(ADD_COLUMN_ORG_RE)) {
      const tableName = match[1];
      if (tableName) hasOrgColumn.add(tableName);
    }

    for (const match of sql.matchAll(DROP_COLUMN_ORG_RE)) {
      const tableName = match[1];
      if (tableName) hasOrgColumn.delete(tableName);
    }

    for (const match of sql.matchAll(ENABLE_RLS_RE)) {
      const tableName = match[1];
      if (tableName) hasRls.add(tableName);
    }

    for (const match of sql.matchAll(RENAME_TABLE_RE)) {
      const [, from, to] = match;
      if (!from || !to) continue;
      if (hasOrgColumn.has(from)) hasOrgColumn.add(to);
      if (hasRls.has(from)) hasRls.add(to);
      everExisted.add(to);
    }

    for (const match of sql.matchAll(DROP_TABLE_RE)) {
      const tableName = match[1];
      if (!tableName) continue;
      hasOrgColumn.delete(tableName);
      hasRls.delete(tableName);
      everExisted.delete(tableName);
    }
  }

  const violations = [...hasOrgColumn].filter((table) => !hasRls.has(table)).sort();

  if (violations.length > 0) {
    console.error(
      'RLS-policy-lint FAILED — tenant-scoped table(s) with no RLS policy found in migration history:',
    );
    for (const table of violations) {
      console.error(
        `  - "${table}" has an organizationId column but no ENABLE ROW LEVEL SECURITY statement was found for it.`,
      );
    }
    console.error(
      '\nPer MULTITENANCY.md §6, a tenant-scoped table must ship its RLS policy in the same migration that adds it.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `RLS-policy-lint passed — ${hasOrgColumn.size} tenant-scoped table(s) checked, all have an RLS policy. (${everExisted.size} tables scanned total.)`,
  );
}

lint();

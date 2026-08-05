import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPrismaClient } from '@linguaai/database';

import { runAuthLoadTest } from './auth-load.js';
import { formatStats, meetsBudget, type Budget, type LatencyStats } from './percentiles.js';
import { measureRlsQueryLatency } from './rls-query-latency.js';
import { cleanupSeededData, seedMultiTenantData } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** PERFORMANCE.md §3 — "Standard CRUD (apps/api)". */
const STANDARD_CRUD_BUDGET: Budget = { p50: 80, p95: 300, p99: 800 };
/** PERFORMANCE.md §4 — "hot-path query p95 < 50ms at the database layer." */
const DB_HOT_PATH_P95_BUDGET_MS = 50;

const API_URL = process.env.LOAD_TEST_API_URL ?? 'http://localhost:4000';
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

const AUTH_REQUEST_COUNT = 200;
const AUTH_CONCURRENCY = 20;
const RLS_ITERATIONS = 200;

interface Report {
  generatedAt: string;
  apiUrl: string;
  authRequestCount: number;
  authConcurrency: number;
  rlsIterations: number;
  standardCrudBudget: Budget;
  dbHotPathP95BudgetMs: number;
  results: {
    register: LatencyStats;
    login: LatencyStats;
    orgDetailRead: LatencyStats;
    membershipListRead: LatencyStats;
  };
  verdicts: {
    register: 'PASS' | 'FAIL';
    login: 'PASS' | 'FAIL';
    orgDetailRead: 'PASS' | 'FAIL';
    membershipListRead: 'PASS' | 'FAIL';
  };
}

async function main(): Promise<void> {
  if (!APP_DATABASE_URL) {
    throw new Error(
      'APP_DATABASE_URL is not set — run this via `dotenv -e ../../.env --`, same as every other script in this monorepo.',
    );
  }

  console.log('=== E2-T27 Load Test ===');
  console.log(`API: ${API_URL}`);
  console.log('');

  console.log('Seeding realistic multi-tenant data...');
  const { orgIds } = await seedMultiTenantData();
  console.log(`Seeded ${orgIds.length} organizations.`);
  console.log('');

  let authResult: Awaited<ReturnType<typeof runAuthLoadTest>> | undefined;
  try {
    console.log(
      `--- Auth load test (register/login, n=${AUTH_REQUEST_COUNT}, concurrency=${AUTH_CONCURRENCY}) ---`,
    );
    authResult = await runAuthLoadTest(API_URL, AUTH_REQUEST_COUNT, AUTH_CONCURRENCY);
    console.log(
      `register: ${formatStats(authResult.register)} ${meetsBudget(authResult.register, STANDARD_CRUD_BUDGET) ? 'PASS' : 'FAIL'}`,
    );
    console.log(
      `login:    ${formatStats(authResult.login)} ${meetsBudget(authResult.login, STANDARD_CRUD_BUDGET) ? 'PASS' : 'FAIL'}`,
    );
    console.log('');

    console.log(`--- RLS query latency, database layer (n=${RLS_ITERATIONS}) ---`);
    const rlsResult = await measureRlsQueryLatency(orgIds, RLS_ITERATIONS, APP_DATABASE_URL);
    console.log(
      `org detail read:      ${formatStats(rlsResult.orgDetailRead)} ${rlsResult.orgDetailRead.p95 < DB_HOT_PATH_P95_BUDGET_MS ? 'PASS' : 'FAIL'}`,
    );
    console.log(
      `membership list read: ${formatStats(rlsResult.membershipListRead)} ${rlsResult.membershipListRead.p95 < DB_HOT_PATH_P95_BUDGET_MS ? 'PASS' : 'FAIL'}`,
    );
    console.log('');

    const report: Report = {
      generatedAt: new Date().toISOString(),
      apiUrl: API_URL,
      authRequestCount: AUTH_REQUEST_COUNT,
      authConcurrency: AUTH_CONCURRENCY,
      rlsIterations: RLS_ITERATIONS,
      standardCrudBudget: STANDARD_CRUD_BUDGET,
      dbHotPathP95BudgetMs: DB_HOT_PATH_P95_BUDGET_MS,
      results: {
        register: authResult.register,
        login: authResult.login,
        orgDetailRead: rlsResult.orgDetailRead,
        membershipListRead: rlsResult.membershipListRead,
      },
      verdicts: {
        register: meetsBudget(authResult.register, STANDARD_CRUD_BUDGET) ? 'PASS' : 'FAIL',
        login: meetsBudget(authResult.login, STANDARD_CRUD_BUDGET) ? 'PASS' : 'FAIL',
        orgDetailRead: rlsResult.orgDetailRead.p95 < DB_HOT_PATH_P95_BUDGET_MS ? 'PASS' : 'FAIL',
        membershipListRead:
          rlsResult.membershipListRead.p95 < DB_HOT_PATH_P95_BUDGET_MS ? 'PASS' : 'FAIL',
      },
    };

    const resultsDir = path.join(__dirname, '..', 'results');
    await mkdir(resultsDir, { recursive: true });
    const resultsPath = path.join(resultsDir, `${report.generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(resultsPath, JSON.stringify(report, null, 2));
    console.log(`Results archived: ${path.relative(process.cwd(), resultsPath)}`);
  } finally {
    console.log('');
    console.log('--- Cleaning up ---');
    if (authResult) {
      const prisma = getPrismaClient();
      await prisma.consentRecord.deleteMany({
        where: { user: { email: { in: authResult.createdEmails } } },
      });
      await prisma.refreshToken.deleteMany({
        where: { user: { email: { in: authResult.createdEmails } } },
      });
      await prisma.session.deleteMany({
        where: { user: { email: { in: authResult.createdEmails } } },
      });
      await prisma.user.deleteMany({ where: { email: { in: authResult.createdEmails } } });
    }
    await cleanupSeededData(orgIds);
    await getPrismaClient().$disconnect();
    console.log('Done.');
  }
}

void main();

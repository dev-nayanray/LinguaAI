import { randomUUID, timingSafeEqual } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { createDomainEventsQueue, DomainEventPublisher } from '@linguaai/events';
import { hashPassword } from '@linguaai/utils';

/**
 * One-time, out-of-band bootstrap procedure for the very first `ADMIN`
 * account in an environment (E2 design doc, Part 9A) — never exposed over
 * the public API, since no existing `ADMIN` can approve a request when none
 * yet exists. Also the documented emergency-recovery path if every `ADMIN`
 * account becomes inaccessible; re-running this script IS that procedure.
 *
 * Run via infrastructure-level access only (deploy-tier, not application
 * runtime): `pnpm --filter @linguaai/database run bootstrap-admin -- \
 *   --email admin@example.com --display-name "Admin Name" \
 *   --password '<strong password>' --secret "$BOOTSTRAP_ADMIN_SECRET"`
 *
 * Gated by BOOTSTRAP_ADMIN_SECRET, an infra-level secret deliberately
 * separate from the application's own runtime secrets (Part 9A) — anyone
 * able to run this script must already hold deploy-tier access to the
 * target environment.
 *
 * Connects via APP_SERVICE_ROLE_DATABASE_URL (the `app_service_role`
 * BYPASSRLS role created in E2-T5's migration), never the default
 * DATABASE_URL (the `linguaai` superuser used only for running migrations)
 * or `app_role` (subject to RLS, and no `app.current_user_id` session
 * context exists to satisfy it pre-bootstrap) — per Part 9A: "Runs through
 * app_service_role ... since no app.current_user_id exists to authorize the
 * insert through the standard role."
 */

interface BootstrapArgs {
  email: string;
  displayName: string;
  password: string;
  secret: string;
  locale: string;
  timezone: string;
}

function parseArgs(rawArgv: string[]): BootstrapArgs {
  // `pnpm run bootstrap-admin -- --email ...` forwards a literal leading
  // "--" passthrough separator ahead of the real flags in some pnpm
  // versions — harmless to drop since "--" is never a valid flag itself.
  const argv = rawArgv.filter((arg) => arg !== '--');
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg?.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Missing value for --${key}`);
      }
      flags.set(key, value);
      i += 1;
    }
  }

  const email = flags.get('email');
  const displayName = flags.get('display-name');
  const password = flags.get('password');
  const secret = flags.get('secret');
  if (!email || !displayName || !password || !secret) {
    throw new Error(
      'Usage: bootstrap-admin --email <email> --display-name <name> --password <password> --secret <secret> [--locale <locale>] [--timezone <tz>]',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('--email is not a valid email address');
  }
  if (password.length < 12) {
    throw new Error('--password must be at least 12 characters');
  }

  return {
    email,
    displayName,
    password,
    secret,
    locale: flags.get('locale') ?? 'en-US',
    timezone: flags.get('timezone') ?? 'UTC',
  };
}

/** Constant-time comparison — the gating secret must never leak via a timing side channel. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const expectedSecret = process.env.BOOTSTRAP_ADMIN_SECRET;
  if (!expectedSecret) {
    throw new Error('BOOTSTRAP_ADMIN_SECRET is not set in the environment — refusing to run.');
  }
  if (!secretsMatch(args.secret, expectedSecret)) {
    throw new Error('--secret does not match BOOTSTRAP_ADMIN_SECRET — refusing to run.');
  }

  const serviceRoleUrl = process.env.APP_SERVICE_ROLE_DATABASE_URL;
  if (!serviceRoleUrl) {
    throw new Error(
      'APP_SERVICE_ROLE_DATABASE_URL is not set in the environment — refusing to run.',
    );
  }
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is not set in the environment — refusing to run.');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: serviceRoleUrl } } });
  // Runs entirely outside the NestJS application (this is a standalone CLI
  // script) — constructs its own queue/publisher directly, the same
  // `@linguaai/events` primitives `events.module.ts` wraps for DI inside
  // apps/api. Per ADR-015, packages/* cannot import from apps/*, so this
  // could never reuse apps/api's own EventsModule even if it wanted to.
  const eventsQueue = createDomainEventsQueue(redisUrl);
  const events = new DomainEventPublisher(eventsQueue);

  try {
    const existing = await prisma.user.findUnique({ where: { email: args.email } });
    if (existing) {
      throw new Error(
        `A user with email ${args.email} already exists (id: ${existing.id}) — refusing to overwrite.`,
      );
    }

    const passwordHash = await hashPassword(args.password);
    const correlationId = randomUUID();

    // Part 9A: this script is the documented path for exactly two
    // situations — the very first ADMIN in an environment, and emergency
    // recovery ("If every ADMIN account becomes inaccessible... the same
    // bootstrap CLI is re-run"). There is no third legitimate reason to
    // run it — a normal *additional* admin goes through the two-person
    // role-change-request flow (E2-T16) instead, which requires an
    // existing ADMIN to approve. So: if any ADMIN already exists at the
    // moment this runs, this run is *by definition* an emergency recovery,
    // not a fresh bootstrap — Part 9A requires a distinct, max-severity
    // audit event for that case ("rather than reusing the ordinary
    // bootstrap event"), which the original version of this script never
    // implemented (it always logged the same 'user.bootstrap_admin_created'
    // action regardless).
    const existingAdminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    const isEmergencyRecovery = existingAdminCount > 0;

    const admin = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: args.email,
          passwordHash,
          displayName: args.displayName,
          locale: args.locale,
          timezone: args.timezone,
          role: 'ADMIN',
          status: 'ACTIVE',
          mfaEnrolled: false,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          actorType: 'SYSTEM',
          action: isEmergencyRecovery
            ? 'user.emergency_admin_recovery'
            : 'user.bootstrap_admin_created',
          targetType: 'User',
          targetId: user.id,
          correlationId,
          afterValue: { role: 'ADMIN', email: user.email },
        },
      });

      return user;
    });

    // Part 9A: distinct events for the two cases — recovery is a
    // security incident by definition and must be visible as one, not
    // blended into routine bootstrap volume (the same distinction the
    // AuditLog action above already makes).
    if (isEmergencyRecovery) {
      await events.publish('identity.role.emergency_recovery', {
        userId: admin.id,
        payload: { targetUserId: admin.id, triggeredBy: 'system-bootstrap' },
      });
      console.log(
        `EMERGENCY RECOVERY: new admin created while ${existingAdminCount} other ADMIN account(s) already existed — id=${admin.id} email=${admin.email}`,
      );
      console.log(
        'This is a security-incident-by-definition event (Part 9A) — a mandatory post-incident security review should follow, per SECURITY.md §9.',
      );
    } else {
      await events.publish('identity.role.changed', {
        userId: admin.id,
        payload: {
          targetUserId: admin.id,
          fromRole: 'USER',
          toRole: 'ADMIN',
          changedBy: 'system-bootstrap',
        },
      });
      console.log(`Bootstrap admin created: id=${admin.id} email=${admin.email}`);
    }
    console.log(
      'mfaEnrolled=false — this account cannot perform any privileged action until it completes MFA enrollment on first login.',
    );
  } finally {
    await prisma.$disconnect();
    await eventsQueue.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

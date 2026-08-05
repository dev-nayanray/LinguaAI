import { randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient, Session, UserProfile as PrismaUserProfile } from '@linguaai/database';
import { getCorrelationId } from '@linguaai/observability';
import type {
  Session as SessionDto,
  UserProfile as UserProfileDto,
} from '@linguaai/types/identity';
import type {
  CurrentUserResponse,
  DeletionRequestResponse,
  PublicUser,
  UpdateProfileRequest,
} from '@linguaai/validation/identity';

import { APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import { AuthService, toPublicUser } from '../auth/auth.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSessionDto(session: Session): SessionDto {
  return {
    id: session.id,
    userId: session.userId,
    deviceLabel: session.deviceLabel,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null,
  };
}

function toUserProfileDto(profile: PrismaUserProfile): UserProfileDto {
  return {
    userId: profile.userId,
    nativeLanguage: profile.nativeLanguage,
    targetLanguages: profile.targetLanguages,
    goalType: profile.goalType,
    dailyTimeCommitmentMinutes: profile.dailyTimeCommitmentMinutes,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    @Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient,
    private readonly authService: AuthService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * `GET /v1/users/me` (Part 6). Runs through `app_role` — `user_read`'s RLS
   * policy (Part 9) already permits `id = current_user_id` unconditionally,
   * and this reads nothing beyond what the caller owns.
   */
  async getCurrentUser(userId: string): Promise<CurrentUserResponse> {
    const user = await this.appPrisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const profile = await this.appPrisma.userProfile.findUnique({ where: { userId } });
    return { ...toPublicUser(user), profile: profile ? toUserProfileDto(profile) : null };
  }

  /**
   * `PATCH /v1/users/me` (Part 6). Writes only the four columns
   * `updateProfileRequestSchema` accepts at the API boundary — exactly the
   * four `app_role` has `UPDATE` grant on directly (E2-T6's privileged-column
   * allowlist); every other `User` field is blocked at the database
   * privilege level regardless of what this method does, so no additional
   * defense is needed here beyond the schema itself. `app_role` (not
   * `app_service_role`) is correct: `user_update`'s RLS policy already
   * permits `id = current_user_id` (Part 9), the ordinary, non-privileged
   * case.
   */
  async updateProfile(userId: string, dto: UpdateProfileRequest): Promise<PublicUser> {
    const user = await this.appPrisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      },
    });
    return toPublicUser(user);
  }

  /**
   * `POST /v1/users/me/deletion-request` (Part 6, E2-T18) — GDPR/CCPA right
   * to erasure, cascading per DATABASE.md §10/§6. Runs entirely through
   * `app_service_role` (the pre-existing "Service-role exception" list —
   * `organizations.service.ts`'s own doc comment already named "GDPR
   * erasure" as a case before this task built it): the anonymizing `User`
   * write touches `status`/`passwordHash`/`mfaSecret`/`organizationId`, all
   * Part 9C privileged columns `app_role` cannot write even for its own row.
   *
   * The `User` row itself is never hard-deleted, for three independent,
   * structural reasons, not a style preference: (1) `user_delete`'s RLS
   * policy is `USING (false)` unconditionally (Part 9) — even
   * `app_service_role`'s `BYPASSRLS` doesn't change this, since (2)
   * `RoleChangeRequest.target`/`.requester` are `onDelete: Restrict` — a
   * hard delete would fail with a Postgres FK violation for any user with
   * role-change history, and (3) `ConsentRecord`'s retention requirement
   * (DATABASE.md §7: "survives account anonymization") is only actually
   * satisfiable if the row anonymization happens in place — a hard delete
   * would cascade-delete it regardless (its FK is `onDelete: Cascade`),
   * silently violating that retention rule. `UserStatus.DELETED` (Part 5)
   * is the terminal state this anonymization moves the row to.
   *
   * `ConsentRecord`/`AuditLog`/`RoleChangeRequest`/`EntitlementChangeLog`
   * rows are deliberately left untouched — DATABASE.md §7/§9B's own
   * retention rules for each, respectively.
   *
   * NOT YET IMPLEMENTED: true async job dispatch — no message-bus/BullMQ
   * consumer exists anywhere in this codebase yet (E2-T20's own scope,
   * generic to every domain event in Part 10, not just this one). At E2's
   * current schema (no `LearningEvent`/`AIUsageLog`-scale historical tables
   * exist yet — those are later Epics), this cascade is a handful of rows
   * and safe to run synchronously inside one transaction; the `AuditLog`
   * write is the durable record of `account.deletion.requested` in the
   * meantime, matching the identical deferral already applied to
   * `AuthService.register`'s `identity.user.registered` and
   * `bootstrap-admin.ts`'s `identity.role.changed`. Flagged, not silently
   * assumed equivalent to a real async dispatch.
   */
  async requestDeletion(userId: string): Promise<DeletionRequestResponse> {
    const correlationId = getCorrelationId() ?? randomUUID();
    let tenantId: string | null = null;

    try {
      await this.servicePrisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new NotFoundException('User not found');
        }
        if (user.status === 'DELETED') {
          throw new ConflictException('This account has already been deleted');
        }
        tenantId = user.organizationId;

        // Ends org membership as part of erasure (Part 9's "last
        // ENTERPRISE_ADMIN" invariant still applies — the DB trigger is
        // authoritative and always fires, translated to 409 below, same
        // discipline as `OrganizationsService.removeMember`). A genuine
        // legal-vs-technical tension the design doc doesn't resolve
        // (GDPR erasure has no documented carve-out from this invariant) —
        // flagged for product/legal review, not decided unilaterally here.
        if (user.organizationId) {
          const membership = await tx.organizationMembership.findUnique({
            where: { userId_organizationId: { userId, organizationId: user.organizationId } },
          });
          if (membership) {
            await tx.organizationMembership.delete({ where: { id: membership.id } });
          }
        }

        await tx.oAuthAccount.deleteMany({ where: { userId } });
        await tx.userProfile.deleteMany({ where: { userId } });
        await tx.deviceToken.deleteMany({ where: { userId } });
        await tx.refreshToken.deleteMany({ where: { userId } });
        await tx.session.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId } });

        await tx.user.update({
          where: { id: userId },
          data: {
            email: `deleted-${userId}@erased.linguaai.internal`,
            passwordHash: null,
            displayName: 'Deleted User',
            avatarUrl: null,
            mfaEnrolled: false,
            mfaSecret: null,
            organizationId: null,
            status: 'DELETED',
            tokensValidAfter: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            actorType: 'USER',
            action: 'account.deletion.requested',
            targetType: 'User',
            targetId: userId,
            tenantId: user.organizationId,
            correlationId,
            beforeValue: { email: user.email, status: user.status },
            afterValue: { status: 'DELETED' },
          },
        });
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      // Same Prisma error-wrapping inconsistency as `OrganizationsService.removeMember` (E2-T16) — match on `.message`, not a specific Prisma error subclass.
      if (error instanceof Error && error.message.includes('cannot_remove_last_enterprise_admin')) {
        throw new ConflictException(
          "Cannot process this deletion request while you are your organization's last ENTERPRISE_ADMIN — transfer that role to someone else first",
        );
      }
      throw error;
    }

    // Published only after commit — same reasoning as OrganizationsService's
    // membership-changed events (a rolled-back transaction must never leave
    // a published event behind describing something that didn't happen).
    await this.events.publish('account.deletion.requested', {
      userId,
      tenantId,
      payload: { userId, requestedAt: new Date().toISOString() },
    });

    return { status: 'ACCEPTED', requestedAt: new Date().toISOString() };
  }

  /**
   * `GET /v1/users/me/sessions` (Part 6). `Session` carries no
   * `organizationId`/RLS (E2-T4's policy matrix covers only `User`/
   * `Organization`/`OrganizationMembership`) — the explicit `userId` filter
   * here IS the tenant-isolation layer for this table, per Part 9's
   * "application query layer" (layer 1 of the three-layer design).
   */
  async listSessions(userId: string): Promise<SessionDto[]> {
    const sessions = await this.appPrisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map(toSessionDto);
  }

  /**
   * `DELETE /v1/users/me/sessions/:id`. Ownership is checked before
   * revoking — a user may only revoke their own session — and a
   * malformed/foreign/nonexistent id all produce an identical 404
   * (API_GUIDELINES.md §3's no-existence-leak rule, the same pattern
   * Part 9's RLS negative examples already use for `Organization`/`User`).
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    if (!UUID_RE.test(sessionId)) {
      throw new NotFoundException('Session not found');
    }
    const session = await this.appPrisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    await this.authService.revokeSession(sessionId, userId, 'user_initiated');
  }
}

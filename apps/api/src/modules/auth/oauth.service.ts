import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@linguaai/database';
import { Prisma as PrismaNamespace } from '@linguaai/database';
import { getCorrelationId } from '@linguaai/observability';
import type { OAuthProvider } from '@linguaai/types/identity';
import type { PublicUser } from '@linguaai/validation/identity';

import { APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import { AuthService, CURRENT_POLICY_VERSION, toPublicUser } from './auth.service.js';

const STATE_TTL_MS = 10 * 60 * 1000;

/** What each provider-specific strategy adapter resolves down to before handing off to the shared decision logic below. */
export interface OAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  displayName: string;
}

export interface ConsumedState {
  /** E2-T12: set only when this state was issued by the "link this provider to my account" flow — see `createState`. */
  linkingUserId: string | null;
}

/**
 * The shared callback route's request, as seen by `google.strategy.ts`/
 * `apple.strategy.ts`'s `validate()` — `oauth.guards.ts`'s callback guards
 * attach `oauthLinkingUserId` (from the consumed state) before Passport's
 * own `canActivate` invokes the strategy, so `validate()` can tell a
 * linking attempt apart from an ordinary login/register one.
 */
export interface RequestWithOAuthLinking {
  oauthLinkingUserId?: string | null;
  headers: Record<string, string | string[] | undefined>;
}

export type OAuthOutcome =
  | { kind: 'authenticated'; accessToken: string; refreshToken: string; user: PublicUser }
  | { kind: 'link_required'; email: string }
  | { kind: 'linked'; provider: OAuthProvider; providerAccountId: string; linkedAt: string };

function hashState(rawState: string): string {
  return createHash('sha256').update(rawState).digest('hex');
}

/**
 * Provider-agnostic OAuth logic (Part 8): CSRF state issuance/consumption
 * and the (provider, providerAccountId)-only account-matching rule.
 * `google.strategy.ts`/`apple.strategy.ts` are thin adapters that resolve
 * each library's own profile shape into `OAuthProfile` and call
 * `handleProviderProfile` — the decision logic itself lives here exactly
 * once, so it's identical regardless of which provider authenticated.
 */
@Injectable()
export class OAuthService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    @Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient,
    private readonly authService: AuthService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * `GET /v1/auth/oauth/:provider` (Part 8): "signed, short-lived (10
   * minute), single-use." No RLS on `OAuthState` (same as Session/
   * RefreshToken/PasswordResetToken — Part 9's matrix covers only User/
   * Organization/OrganizationMembership), so this runs through the
   * ordinary `app_role` client, not the service-role exception.
   *
   * `linkingUserId` (E2-T12): set only by the authenticated "link this
   * provider to my account" start route (`GoogleLinkStartGuard`/
   * `AppleLinkStartGuard`) — tags this state so the shared callback route
   * can tell a linking attempt apart from an ordinary login/register one,
   * without a second callback path per provider.
   */
  async createState(provider: OAuthProvider, linkingUserId: string | null = null): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.appPrisma.oAuthState.create({
      data: {
        stateHash: hashState(raw),
        provider,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
        linkingUserId,
      },
    });
    return raw;
  }

  /**
   * Validates state FIRST, before any provider-token exchange (the
   * implementation plan's explicit ordering) — atomically claiming it via
   * the same `WHERE ... AND usedAt IS NULL` pattern E2-T5/T9 already use
   * for single-use tokens, so a replayed state can never race past this
   * check. Missing/invalid/expired/already-used all produce the identical
   * rejection — Part 8 doesn't distinguish these itself, and a more
   * specific error would only help an attacker calibrate a retry.
   */
  async consumeState(
    provider: OAuthProvider,
    rawState: string | undefined,
  ): Promise<ConsumedState> {
    if (!rawState) {
      throw new UnauthorizedException('Missing OAuth state parameter');
    }
    const stateHash = hashState(rawState);
    const claim = await this.appPrisma.oAuthState.updateMany({
      where: { stateHash, provider, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new UnauthorizedException('Invalid, expired, or already-used OAuth state');
    }
    const consumed = await this.appPrisma.oAuthState.findUnique({ where: { stateHash } });
    return { linkingUserId: consumed?.linkingUserId ?? null };
  }

  /**
   * Part 8 / High-3: an `OAuthAccount` is matched **only** by
   * `(provider, providerAccountId)` — never by email. A profile whose
   * email matches an existing `User` but isn't yet linked as this exact
   * `(provider, providerAccountId)` does **not** auto-link; it returns
   * `link_required` so the caller can direct the user to log in with
   * their existing account first, then link explicitly via the
   * authenticated `POST /v1/users/me/oauth-accounts` (E2-T12). Applied
   * regardless of whether the existing account is password-based or
   * already linked to a *different* provider — stricter than Part 8's
   * literal "password-based" wording, deliberately: the takeover risk
   * this rule closes doesn't depend on the existing account's own auth
   * method.
   *
   * Runs the lookups/creation through `app_service_role` — same pre-session
   * justification as `AuthService.validateCredentials`/`register`.
   */
  async handleProviderProfile(
    profile: OAuthProfile,
    deviceLabel: string | null,
    ip: string | null,
  ): Promise<OAuthOutcome> {
    const existingAccount = await this.servicePrisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      if (existingAccount.user.status === 'SUSPENDED') {
        throw new ForbiddenException('This account has been suspended');
      }
      return this.authenticate(toPublicUser(existingAccount.user), deviceLabel, ip);
    }

    const emailConflict = await this.servicePrisma.user.findUnique({
      where: { email: profile.email },
    });
    if (emailConflict) {
      return { kind: 'link_required', email: profile.email };
    }

    const created = await this.servicePrisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: profile.email,
          passwordHash: null,
          displayName: profile.displayName,
          // OAuth profiles don't reliably supply locale/timezone — fixed
          // defaults here, updatable later via `PATCH /v1/users/me`
          // (E2-T18), same simplification the design doc leaves implicit.
          locale: 'en-US',
          timezone: 'UTC',
          status: 'ACTIVE',
        },
      });
      await tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      });
      // No OAuth-specific consent-collection UI exists anywhere in Part
      // 6/8 (unlike password registration's explicit tosAccepted/
      // privacyPolicyAccepted fields) — recording implicit TOS/
      // PRIVACY_POLICY consent here on successful sign-in completion is a
      // deliberate, flagged assumption (matching password registration's
      // own consent pair), not a silently-invented compliance gap. A real
      // product/legal review should confirm this is sufficient.
      await tx.consentRecord.createMany({
        data: [
          {
            userId: user.id,
            consentType: 'TOS',
            policyVersion: CURRENT_POLICY_VERSION,
            grantedAt: new Date(),
          },
          {
            userId: user.id,
            consentType: 'PRIVACY_POLICY',
            policyVersion: CURRENT_POLICY_VERSION,
            grantedAt: new Date(),
          },
        ],
      });
      return user;
    });

    await this.events.publish('identity.user.registered', {
      userId: created.id,
      payload: { signupSource: profile.provider.toLowerCase() },
    });
    await this.events.publish('identity.consent.recorded', {
      userId: created.id,
      payload: { consentType: 'TOS', policyVersion: CURRENT_POLICY_VERSION },
    });
    await this.events.publish('identity.consent.recorded', {
      userId: created.id,
      payload: { consentType: 'PRIVACY_POLICY', policyVersion: CURRENT_POLICY_VERSION },
    });

    return this.authenticate(toPublicUser(created), deviceLabel, ip);
  }

  /**
   * The single entry point both strategy adapters call once they've
   * resolved a real provider profile — branches to linking (E2-T12) vs
   * ordinary login/register (E2-T11) based on whether the consumed state
   * was tagged with a `linkingUserId`, keeping that decision in one place
   * rather than duplicated per provider.
   */
  async handleResolvedProfile(
    profile: OAuthProfile,
    linkingUserId: string | null,
    deviceLabel: string | null,
    ip: string | null,
  ): Promise<OAuthOutcome> {
    if (linkingUserId) {
      const linked = await this.linkProviderToUser(linkingUserId, profile);
      return { kind: 'linked', ...linked };
    }
    return this.handleProviderProfile(profile, deviceLabel, ip);
  }

  private async authenticate(
    user: PublicUser,
    deviceLabel: string | null,
    ip: string | null,
  ): Promise<OAuthOutcome> {
    const { accessToken, refreshToken } = await this.authService.issueSession(
      user,
      deviceLabel,
      ip,
    );
    return { kind: 'authenticated', accessToken, refreshToken, user };
  }

  /**
   * `POST /v1/users/me/oauth-accounts` (Part 6, E2-T12): attaches a newly-
   * resolved `(provider, providerAccountId)` to an *already-authenticated*
   * caller's account. Ownership of the LinguaAI account is proven by the
   * Bearer access token required to reach the link-start route in the
   * first place (`GoogleLinkStartGuard`/`AppleLinkStartGuard`); ownership
   * of the *external* provider account is proven by this being a real,
   * completed OAuth handshake (the same one `handleProviderProfile` uses
   * for login) — not a client-asserted claim.
   *
   * The `(provider, providerAccountId)` unique constraint (Part 5) is the
   * actual enforcement: whether this exact external identity is already
   * linked to the *same* caller or to a *different* user, both are a
   * uniqueness violation and both get the identical `ConflictException` —
   * not distinguished, so a response can't be used to probe whether some
   * other account already linked this identity.
   */
  async linkProviderToUser(
    userId: string,
    profile: OAuthProfile,
  ): Promise<{ provider: OAuthProvider; providerAccountId: string; linkedAt: string }> {
    try {
      const correlationId = getCorrelationId() ?? randomUUID();
      const account = await this.servicePrisma.$transaction(async (tx) => {
        const created = await tx.oAuthAccount.create({
          data: {
            userId,
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
          },
        });
        // Part 9B's required-events list names "OAuth account linking"
        // explicitly — never wired up when this endpoint was built (E2-T12);
        // closed here (E2-T17).
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            actorType: 'USER',
            action: 'user.oauth_account.linked',
            targetType: 'OAuthAccount',
            targetId: created.id,
            correlationId,
            afterValue: {
              provider: created.provider,
              providerAccountId: created.providerAccountId,
            },
          },
        });
        return created;
      });
      await this.events.publish('identity.oauth.linked', {
        userId,
        payload: { provider: account.provider },
      });

      return {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        linkedAt: account.linkedAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This provider account is already linked to a LinguaAI account',
        );
      }
      throw error;
    }
  }
}

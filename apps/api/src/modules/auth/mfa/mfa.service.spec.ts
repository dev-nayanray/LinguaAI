import { randomBytes } from 'node:crypto';

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { MfaEnv } from '@linguaai/config';
import type { PrismaClient } from '@linguaai/database';
import { decodeEncryptionKey, encryptField } from '@linguaai/utils';
import { authenticator } from 'otplib';

import type { DomainEventPublisher } from '../../../events/index.js';
import { MfaService } from './mfa.service.js';

function makeAttempt(succeeded: boolean, occurredAt: Date) {
  return { id: 'a', userId: 'u-1', succeeded, occurredAt };
}

describe('MfaService', () => {
  let appPrisma: {
    mfaVerificationAttempt: { findMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let servicePrisma: { user: { findUniqueOrThrow: jest.Mock } };
  let encryptionKey: Buffer;
  let mfaConfig: MfaEnv;
  let events: { publish: jest.Mock };
  let mfaService: MfaService;

  beforeEach(() => {
    appPrisma = {
      mfaVerificationAttempt: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockReturnValue({}),
    };
    servicePrisma = { user: { findUniqueOrThrow: jest.fn() } };
    mfaConfig = { MFA_SECRET_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
    encryptionKey = decodeEncryptionKey(mfaConfig.MFA_SECRET_ENCRYPTION_KEY);
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    mfaService = new MfaService(
      appPrisma as unknown as PrismaClient,
      servicePrisma as unknown as PrismaClient,
      mfaConfig,
      events as unknown as DomainEventPublisher,
    );
  });

  describe('beginEnrollment', () => {
    it("generates a fresh TOTP secret and an otpauth URL keyed to the user's email, without writing anything", async () => {
      servicePrisma.user.findUniqueOrThrow.mockResolvedValue({ email: 'user@test.local' });

      const result = await mfaService.beginEnrollment('u-1');

      expect(typeof result.secret).toBe('string');
      expect(result.secret.length).toBeGreaterThan(0);
      // keyuri() URL-encodes the account name (@ becomes %40) — correct,
      // standard behavior, not a bug to work around.
      expect(result.otpauthUrl).toContain('user%40test.local');
      expect(result.otpauthUrl).toContain('LinguaAI');
      expect(appPrisma.$transaction).not.toHaveBeenCalled();
      expect(appPrisma.mfaVerificationAttempt.create).not.toHaveBeenCalled();
    });

    it('produces a different secret on each call', async () => {
      servicePrisma.user.findUniqueOrThrow.mockResolvedValue({ email: 'user@test.local' });
      const a = await mfaService.beginEnrollment('u-1');
      const b = await mfaService.beginEnrollment('u-1');
      expect(a.secret).not.toBe(b.secret);
    });
  });

  describe('completeEnrollment', () => {
    it('rejects an invalid code, records the failed attempt, and never calls complete_mfa_enrollment', async () => {
      const secret = authenticator.generateSecret();
      const wrongCode = '000000';

      await expect(mfaService.completeEnrollment('u-1', secret, wrongCode)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(appPrisma.mfaVerificationAttempt.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', succeeded: false },
      });
      expect(appPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts a valid code, records the successful attempt, and calls complete_mfa_enrollment directly (no manual $transaction/set_config — tenant-rls.extension.ts supplies it, E2-T14)', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);

      await mfaService.completeEnrollment('u-1', secret, validCode);

      expect(appPrisma.mfaVerificationAttempt.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', succeeded: true },
      });
      expect(appPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(appPrisma.$transaction).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith('identity.mfa.enrolled', {
        userId: 'u-1',
        payload: {},
      });
    });

    it('never passes the plaintext secret to complete_mfa_enrollment (encrypts it first)', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);

      await mfaService.completeEnrollment('u-1', secret, validCode);

      // $executeRaw is called as a tagged template — the interpolated
      // values (not the static SQL string parts) are its 2nd+ arguments.
      const calls = appPrisma.$executeRaw.mock.calls as unknown[][];
      const allInterpolatedValues = calls.flatMap((call) => call.slice(1));
      expect(allInterpolatedValues).not.toContain(secret);
    });
  });

  describe('lockout (Part 8, remediation High-4)', () => {
    const secret = authenticator.generateSecret();

    it('allows verification with fewer than 5 recent failures', async () => {
      appPrisma.mfaVerificationAttempt.findMany.mockResolvedValue(
        [0, 1, 2, 3].map((i) => makeAttempt(false, new Date(Date.now() - i * 1000))),
      );
      const validCode = authenticator.generate(secret);

      await expect(
        mfaService.completeEnrollment('u-1', secret, validCode),
      ).resolves.toBeUndefined();
    });

    it('locks out after 5 failures clustered within the 10-minute window, even with a correct code', async () => {
      const now = Date.now();
      appPrisma.mfaVerificationAttempt.findMany.mockResolvedValue(
        [0, 1, 2, 3, 4].map((i) => makeAttempt(false, new Date(now - i * 60_000))), // 0,1,2,3,4 minutes ago
      );
      const validCode = authenticator.generate(secret);

      await expect(mfaService.completeEnrollment('u-1', secret, validCode)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Locked out before the code is even checked — no new attempt recorded.
      expect(appPrisma.mfaVerificationAttempt.create).not.toHaveBeenCalled();
    });

    it('does not lock out when the 5 most recent failures are NOT clustered within a 10-minute span', async () => {
      const now = Date.now();
      appPrisma.mfaVerificationAttempt.findMany.mockResolvedValue(
        [0, 1, 2, 3, 20].map((i) => makeAttempt(false, new Date(now - i * 60_000))), // spans 20 minutes
      );
      const validCode = authenticator.generate(secret);

      await expect(
        mfaService.completeEnrollment('u-1', secret, validCode),
      ).resolves.toBeUndefined();
    });

    it('stays locked for 15 minutes after the 5th (triggering) failure even once it falls outside a fresh 10-minute lookback', async () => {
      const now = Date.now();
      // 5 failures clustered 12-16 minutes ago (a real burst), most recent
      // (triggering) failure 12 minutes ago — outside a naive "last 10
      // minutes from now" window, but still within the 15-minute lock.
      appPrisma.mfaVerificationAttempt.findMany.mockResolvedValue(
        [12, 13, 14, 15, 16].map((i) => makeAttempt(false, new Date(now - i * 60_000))),
      );
      const validCode = authenticator.generate(secret);

      await expect(mfaService.completeEnrollment('u-1', secret, validCode)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('is no longer locked once 15 minutes have passed since the triggering failure', async () => {
      const now = Date.now();
      appPrisma.mfaVerificationAttempt.findMany.mockResolvedValue(
        [16, 17, 18, 19, 20].map((i) => makeAttempt(false, new Date(now - i * 60_000))),
      );
      const validCode = authenticator.generate(secret);

      await expect(
        mfaService.completeEnrollment('u-1', secret, validCode),
      ).resolves.toBeUndefined();
    });
  });

  describe("verifyChallengeCode (E2-T22 — login step-up, shares completeEnrollment's lockout table)", () => {
    it('decrypts the persisted secret, verifies the code, and records a successful attempt', async () => {
      const secret = authenticator.generateSecret();
      const encryptedSecret = encryptField(secret, encryptionKey);
      servicePrisma.user.findUniqueOrThrow.mockResolvedValue({ mfaSecret: encryptedSecret });
      const validCode = authenticator.generate(secret);

      await expect(mfaService.verifyChallengeCode('u-1', validCode)).resolves.toBe(true);
      expect(appPrisma.mfaVerificationAttempt.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', succeeded: true },
      });
    });

    it('rejects a wrong code and records a failed attempt', async () => {
      const secret = authenticator.generateSecret();
      const encryptedSecret = encryptField(secret, encryptionKey);
      servicePrisma.user.findUniqueOrThrow.mockResolvedValue({ mfaSecret: encryptedSecret });

      await expect(mfaService.verifyChallengeCode('u-1', '000000')).resolves.toBe(false);
      expect(appPrisma.mfaVerificationAttempt.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', succeeded: false },
      });
    });

    it('shares the same 5-failures/10-minute lockout as completeEnrollment, keyed by userId', async () => {
      const now = Date.now();
      appPrisma.mfaVerificationAttempt.findMany.mockResolvedValue(
        [0, 1, 2, 3, 4].map((i) => makeAttempt(false, new Date(now - i * 60_000))),
      );
      const secret = authenticator.generateSecret();
      servicePrisma.user.findUniqueOrThrow.mockResolvedValue({
        mfaSecret: encryptField(secret, encryptionKey),
      });
      const validCode = authenticator.generate(secret);

      await expect(mfaService.verifyChallengeCode('u-1', validCode)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Locked out before the code is even checked — no new attempt recorded.
      expect(appPrisma.mfaVerificationAttempt.create).not.toHaveBeenCalled();
    });

    it('returns false defensively (never throws) if somehow called for a user with no persisted mfaSecret', async () => {
      servicePrisma.user.findUniqueOrThrow.mockResolvedValue({ mfaSecret: null });
      await expect(mfaService.verifyChallengeCode('u-1', '123456')).resolves.toBe(false);
      expect(appPrisma.mfaVerificationAttempt.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', succeeded: false },
      });
    });
  });
});

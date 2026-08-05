import { afterEach, describe, expect, it } from 'vitest';

import { _resetPrismaClientForTesting, getPrismaClient } from './index.js';

describe('getPrismaClient', () => {
  afterEach(() => {
    _resetPrismaClientForTesting();
  });

  it('returns an object exposing the PrismaClient API surface', () => {
    // Not `toBeInstanceOf(PrismaClient)`: Prisma's generated client wraps
    // instances in a Proxy for its extension mechanism, so
    // `Object.getPrototypeOf(client) !== PrismaClient.prototype` even
    // though `client.constructor === PrismaClient` — a documented Prisma
    // quirk, not a bug here. Checking the actual API surface is the
    // reliable way to assert "this is a working client".
    const client = getPrismaClient();
    expect(typeof client.$connect).toBe('function');
    expect(typeof client.$disconnect).toBe('function');
    expect(typeof client.$transaction).toBe('function');
  });

  it('returns the same instance across repeated calls (singleton)', () => {
    expect(getPrismaClient()).toBe(getPrismaClient());
  });

  it('creates a fresh instance after being reset', () => {
    const first = getPrismaClient();
    _resetPrismaClientForTesting();
    const second = getPrismaClient();
    expect(second).not.toBe(first);
  });
});

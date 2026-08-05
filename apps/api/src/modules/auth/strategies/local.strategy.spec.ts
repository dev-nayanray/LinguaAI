import { UnauthorizedException } from '@nestjs/common';
import type { PublicUser } from '@linguaai/validation/identity';
import type { Request } from 'express';

import type { AuthService } from '../auth.service.js';
import { LocalStrategy } from './local.strategy.js';

describe('LocalStrategy', () => {
  const req = { ip: '1.2.3.4' } as Request;

  it('returns the public user when validateCredentials succeeds', async () => {
    const user = { id: 'u-1', email: 'user@test.local' } as PublicUser;
    const authService = {
      validateCredentials: jest.fn().mockResolvedValue(user),
    } as unknown as AuthService;
    const strategy = new LocalStrategy(authService);

    await expect(strategy.validate(req, 'user@test.local', 'correct')).resolves.toBe(user);
    expect(authService.validateCredentials).toHaveBeenCalledWith(
      'user@test.local',
      'correct',
      '1.2.3.4',
    );
  });

  it('throws UnauthorizedException when validateCredentials returns null', async () => {
    const authService = {
      validateCredentials: jest.fn().mockResolvedValue(null),
    } as unknown as AuthService;
    const strategy = new LocalStrategy(authService);

    await expect(strategy.validate(req, 'user@test.local', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('propagates errors thrown by validateCredentials (e.g. suspended account)', async () => {
    const error = new Error('suspended');
    const authService = {
      validateCredentials: jest.fn().mockRejectedValue(error),
    } as unknown as AuthService;
    const strategy = new LocalStrategy(authService);

    await expect(strategy.validate(req, 'user@test.local', 'correct')).rejects.toBe(error);
  });

  it('falls back to null when req.ip is undefined', async () => {
    const authService = {
      validateCredentials: jest.fn().mockResolvedValue(null),
    } as unknown as AuthService;
    const strategy = new LocalStrategy(authService);

    await expect(
      strategy.validate({} as Request, 'user@test.local', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.validateCredentials).toHaveBeenCalledWith('user@test.local', 'wrong', null);
  });
});

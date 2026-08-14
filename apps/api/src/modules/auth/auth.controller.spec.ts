import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import type { PublicUser, RegisterRequest } from '@linguaai/validation/identity';

import type { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';

describe('AuthController', () => {
  const publicUser: PublicUser = {
    id: 'u-1',
    email: 'user@test.local',
    displayName: 'Test User',
    avatarUrl: null,
    locale: 'en-US',
    timezone: 'UTC',
    role: 'USER',
    status: 'ACTIVE',
    mfaEnrolled: false,
    organizationId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  describe('register', () => {
    it('delegates to AuthService.register and returns its result', async () => {
      const authService = {
        register: jest.fn().mockResolvedValue(publicUser),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const dto = {
        email: 'user@test.local',
        password: 'correct horse battery staple',
        displayName: 'Test User',
        locale: 'en-US',
        timezone: 'UTC',
        tosAccepted: true,
        privacyPolicyAccepted: true,
        marketingConsent: false,
      } as RegisterRequest;

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toBe(publicUser);
    });
  });

  describe('login', () => {
    it('issues a session for req.user, sets an httpOnly/SameSite=strict refresh cookie, and returns the login response', async () => {
      const authService = {
        loginResponse: jest.fn().mockResolvedValue({
          result: { status: 'AUTHENTICATED', accessToken: 'jwt-token', user: publicUser },
          refreshToken: 'raw-refresh-token',
        }),
      } as unknown as AuthService;
      const controller = new AuthController(authService);

      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;
      const req = {
        user: publicUser,
        headers: { 'user-agent': 'jest-agent' },
        ip: '1.2.3.4',
      } as unknown as Parameters<AuthController['login']>[0];

      const result = await controller.login(req, res);

      expect(authService.loginResponse).toHaveBeenCalledWith(publicUser, 'jest-agent', '1.2.3.4');
      expect(cookie).toHaveBeenCalledWith(
        'refreshToken',
        'raw-refresh-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
      expect(result).toEqual({
        status: 'AUTHENTICATED',
        accessToken: 'jwt-token',
        user: publicUser,
      });
    });

    it('falls back to a null device label when no user-agent header is present', async () => {
      const authService = {
        loginResponse: jest.fn().mockResolvedValue({
          result: { status: 'AUTHENTICATED', accessToken: 'jwt-token', user: publicUser },
          refreshToken: 'raw-refresh-token',
        }),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const res = { cookie: jest.fn() } as unknown as Response;
      const req = { user: publicUser, headers: {} } as unknown as Parameters<
        AuthController['login']
      >[0];

      await controller.login(req, res);

      expect(authService.loginResponse).toHaveBeenCalledWith(publicUser, null, null);
    });

    it('returns the refresh token in the JSON body, and sets no cookie, for an X-Client-Platform: mobile caller (E21 T1)', async () => {
      const authService = {
        loginResponse: jest.fn().mockResolvedValue({
          result: { status: 'AUTHENTICATED', accessToken: 'jwt-token', user: publicUser },
          refreshToken: 'raw-refresh-token',
        }),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;
      const req = {
        user: publicUser,
        headers: { 'x-client-platform': 'mobile' },
        ip: '1.2.3.4',
      } as unknown as Parameters<AuthController['login']>[0];

      const result = await controller.login(req, res);

      expect(cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'AUTHENTICATED',
        accessToken: 'jwt-token',
        user: publicUser,
        refreshToken: 'raw-refresh-token',
      });
    });
  });

  describe('refresh', () => {
    it('rotates using the cookie-supplied refresh token and sets the new one on the response', async () => {
      const authService = {
        refreshSession: jest
          .fn()
          .mockResolvedValue({ accessToken: 'new-jwt', refreshToken: 'new-raw-refresh' }),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;
      const req = { cookies: { refreshToken: 'old-raw-refresh' } } as unknown as Parameters<
        AuthController['refresh']
      >[0];

      const result = await controller.refresh(req, {}, res);

      expect(authService.refreshSession).toHaveBeenCalledWith('old-raw-refresh');
      expect(cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-raw-refresh',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
      expect(result).toEqual({ accessToken: 'new-jwt' });
    });

    it('falls back to a body-supplied refresh token and returns the rotated token in the body (mobile, E21 T1, no cookie jar)', async () => {
      const authService = {
        refreshSession: jest
          .fn()
          .mockResolvedValue({ accessToken: 'new-jwt', refreshToken: 'new-raw-refresh' }),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;
      const req = { cookies: {} } as unknown as Parameters<AuthController['refresh']>[0];

      const result = await controller.refresh(req, { refreshToken: 'old-raw-refresh' }, res);

      expect(authService.refreshSession).toHaveBeenCalledWith('old-raw-refresh');
      expect(cookie).not.toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'new-jwt', refreshToken: 'new-raw-refresh' });
    });

    it('throws UnauthorizedException when neither a cookie nor a body refresh token is present, without calling AuthService', async () => {
      const authService = { refreshSession: jest.fn() } as unknown as AuthService;
      const controller = new AuthController(authService);
      const res = { cookie: jest.fn() } as unknown as Response;
      const req = { cookies: {} } as unknown as Parameters<AuthController['refresh']>[0];

      await expect(controller.refresh(req, {}, res)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authService.refreshSession).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session identified by the refresh-token cookie, scoped to the Bearer token caller, and clears the cookie', async () => {
      const authService = {
        logout: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const clearCookie = jest.fn();
      const res = { clearCookie } as unknown as Response;
      const req = {
        user: { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null },
        cookies: { refreshToken: 'raw-refresh-token' },
      } as unknown as Parameters<AuthController['logout']>[0];

      await controller.logout(req, {}, res);

      expect(authService.logout).toHaveBeenCalledWith('raw-refresh-token', 'u-1');
      expect(clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('falls back to a body-supplied refresh token when no cookie is present (mobile, E21 T1)', async () => {
      const authService = {
        logout: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const res = { clearCookie: jest.fn() } as unknown as Response;
      const req = {
        user: { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null },
        cookies: {},
      } as unknown as Parameters<AuthController['logout']>[0];

      await controller.logout(req, { refreshToken: 'raw-refresh-token' }, res);

      expect(authService.logout).toHaveBeenCalledWith('raw-refresh-token', 'u-1');
    });
  });

  describe('requestPasswordReset', () => {
    it('delegates to AuthService.requestPasswordReset with the validated email', async () => {
      const authService = {
        requestPasswordReset: jest.fn().mockResolvedValue({ status: 'EMAIL_SENT' }),
      } as unknown as AuthService;
      const controller = new AuthController(authService);

      const result = await controller.requestPasswordReset({ email: 'user@test.local' });

      expect(authService.requestPasswordReset).toHaveBeenCalledWith('user@test.local');
      expect(result).toEqual({ status: 'EMAIL_SENT' });
    });
  });

  describe('confirmPasswordReset', () => {
    it('delegates to AuthService.confirmPasswordReset with the token and new password', async () => {
      const authService = {
        confirmPasswordReset: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuthService;
      const controller = new AuthController(authService);

      await controller.confirmPasswordReset({
        token: 'raw-token',
        newPassword: 'correct horse battery staple',
      });

      expect(authService.confirmPasswordReset).toHaveBeenCalledWith(
        'raw-token',
        'correct horse battery staple',
      );
    });
  });
});

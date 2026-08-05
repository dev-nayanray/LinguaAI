import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { PublicUser } from '@linguaai/validation/identity';
import type { Request } from 'express';

import { AuthService } from '../auth.service.js';

/**
 * `POST /v1/auth/login`'s credential-check step (Part 7's component design
 * names this file explicitly). `usernameField: 'email'` since the request
 * body uses `email`, not Passport's `username` default. `passReqToCallback:
 * true` (E2-T20) — `identity.login.failed`'s payload needs the caller's IP,
 * which only the request itself carries.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email', passReqToCallback: true });
  }

  async validate(req: Request, email: string, password: string): Promise<PublicUser> {
    const user = await this.authService.validateCredentials(email, password, req.ip ?? null);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }
}

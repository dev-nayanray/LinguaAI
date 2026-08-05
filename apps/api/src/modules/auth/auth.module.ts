import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import {
  AUTH_CONFIG,
  LOGIN_FAILURE_CONFIG,
  MFA_CONFIG,
  OAUTH_CONFIG,
  resolveAuthConfig,
  resolveLoginFailureConfig,
  resolveMfaConfig,
  resolveOAuthConfig,
} from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MfaGuard } from './guards/mfa.guard.js';
import {
  AppleCallbackGuard,
  AppleLinkStartGuard,
  AppleStartGuard,
  GoogleCallbackGuard,
  GoogleLinkStartGuard,
  GoogleStartGuard,
} from './guards/oauth.guards.js';
import { RolesGuard } from './guards/roles.guard.js';
import { JtiDenylistService } from './jti-denylist.service.js';
import { MfaController } from './mfa/mfa.controller.js';
import { MfaService } from './mfa/mfa.service.js';
import { OAuthLinkController } from './oauth-link.controller.js';
import { OAuthService } from './oauth.service.js';
import { AppleStrategy } from './strategies/apple.strategy.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';

// Config resolution (fail-fast, DEPLOYMENT.md §7) happens inside provider/
// registerAsync factories below, not at module-file top level — E2-T16
// found that any file transitively importing this module through a
// barrel (`auth/index.js`), even just for a type, crashed plain unit
// tests that never set these env vars and never boot this module for
// real (the exact bug `database.module.ts` was already fixed for in
// E2-T10, for the identical reason — this module just hadn't been
// exercised through a deep barrel chain until E2-T16's
// `organizations.controller.ts → users/index.js → users.module.ts →
// auth/index.js` import path existed). `resolveAuthConfig()` is cheap and
// pure (Zod-parses env vars), so calling it twice (here and in
// `AUTH_CONFIG`'s own factory below) rather than wiring a cross-provider
// DI dependency into `JwtModule.registerAsync` is the simpler tradeoff.
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const authConfig = resolveAuthConfig();
        return {
          secret: authConfig.JWT_ACCESS_SECRET,
          // @nestjs/jwt's `expiresIn` takes the `ms` package's `StringValue`
          // literal-pattern type, stricter than Zod can express — JWT_ACCESS_TTL
          // is trusted, format-documented config (.env.example: "15m"), not
          // user input, so a narrow assertion here is appropriate.
          signOptions: {
            expiresIn:
              authConfig.JWT_ACCESS_TTL as `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController, OAuthLinkController, MfaController],
  providers: [
    AuthService,
    OAuthService,
    MfaService,
    JtiDenylistService,
    MfaGuard,
    RolesGuard,
    LocalStrategy,
    JwtStrategy,
    GoogleStrategy,
    AppleStrategy,
    GoogleStartGuard,
    AppleStartGuard,
    GoogleCallbackGuard,
    AppleCallbackGuard,
    GoogleLinkStartGuard,
    AppleLinkStartGuard,
    { provide: AUTH_CONFIG, useFactory: () => resolveAuthConfig() },
    { provide: OAUTH_CONFIG, useFactory: () => resolveOAuthConfig() },
    { provide: MFA_CONFIG, useFactory: () => resolveMfaConfig() },
    { provide: LOGIN_FAILURE_CONFIG, useFactory: () => resolveLoginFailureConfig() },
  ],
  // RolesGuard/MfaGuard exported too — the design doc's own instruction is
  // to land both guards together (Part 7), but the first real
  // ADMIN/ENTERPRISE_ADMIN-gated business route is OrganizationsModule
  // (E2-T15), a different module — this module builds and tests both
  // mechanisms; T15 attaches @UseGuards(AuthGuard('jwt'), RolesGuard,
  // MfaGuard) to its own routes.
  exports: [AuthService, MfaGuard, RolesGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { RoleChangeRequestsController } from './role-change-requests.controller.js';
import { RoleLifecycleService } from './role-lifecycle.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * `UsersModule` (Part 7's three-module split: `AuthModule`/`UsersModule`/
 * `OrganizationsModule`). Session management (E2-T10), role-lifecycle
 * (E2-T16, `RoleChangeRequestsController`/`RoleLifecycleService`), and
 * profile/GDPR-erasure (E2-T18, `GET`/`PATCH /v1/users/me`,
 * `POST /v1/users/me/deletion-request`) all live here.
 * `RoleLifecycleService` is exported — `OrganizationsModule` imports this
 * module to reach it for `PATCH .../members/:userId/role` (E2-T16), the
 * same cross-module pattern `AuthModule` already exports `RolesGuard`/
 * `MfaGuard` through.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController, RoleChangeRequestsController],
  providers: [UsersService, RoleLifecycleService],
  exports: [RoleLifecycleService],
})
export class UsersModule {}

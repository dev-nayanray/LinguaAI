import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { UsersModule } from '../users/index.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * `OrganizationsModule` (Part 7's three-module split: `AuthModule`/
 * `UsersModule`/`OrganizationsModule`, E2-T15). Imports `AuthModule` for
 * `RolesGuard`/`MfaGuard` (exported from there since E2-T14) and
 * `UsersModule` for `RoleLifecycleService` (E2-T16's `PATCH
 * .../members/:userId/role`) — a one-way dependency, `UsersModule` imports
 * neither of these back.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}

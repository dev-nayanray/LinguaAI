import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

/**
 * `AuditModule` (Part 7, E2-T17) — the fourth and final module in Part 7's
 * component tree (`AuthModule`/`UsersModule`/`OrganizationsModule`/
 * `AuditModule`). Imports `AuthModule` for `RolesGuard`/`MfaGuard`, the
 * same pattern `OrganizationsModule` already uses.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}

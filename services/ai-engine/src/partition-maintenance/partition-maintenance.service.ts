import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { AI_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';

/**
 * ADR-035 (E4 R-69, E5 T11): invokes pg_partman's own maintenance
 * procedure — pre-creates future partitions (and would drop retired ones,
 * if retention were configured) for every parent table pg_partman manages
 * (`AIMessage`/`LearningEvent`/`AIUsageLog`, ADR-028's own
 * `partman.create_parent()` calls).
 *
 * `CALL`, not `SELECT` — `run_maintenance_proc` is a stored PROCEDURE, not
 * a function (confirmed via `\df partman.run_maintenance_proc` /
 * `pg_proc.prosecdef` against the live database, not assumed from
 * pg_partman's own docs). It is `SECURITY INVOKER` (`prosecdef = false`),
 * so it runs with the calling role's (`app_role`, ADR-036) own
 * privileges against pg_partman's internal tracking tables, not the
 * extension owner's — this is exactly the real, previously-missing grant
 * this task's own migration
 * (`20260807040000_grant_partman_schema_to_app_role`) closes; without it,
 * every real invocation would fail with a live `permission denied`
 * error, not a hypothetical one (reproduced empirically before that
 * migration was written).
 */
@Injectable()
export class PartitionMaintenanceService {
  constructor(@Inject(AI_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async runMaintenance(): Promise<void> {
    await this.prisma.$executeRaw`CALL partman.run_maintenance_proc()`;
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

interface HealthStatus {
  status: 'ok';
}

/**
 * Pure liveness probe (E1 Part 8) — this skeleton has no DB/downstream
 * dependency wired up yet (packages/database isn't a dependency of this
 * task), so there is nothing else to check yet. Deliberately left
 * unversioned (not under /v1) — ALB/ECS target group health checks hit a
 * fixed, well-known path that shouldn't move with API version bumps.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'The service is up.' })
  check(): HealthStatus {
    return { status: 'ok' };
  }
}

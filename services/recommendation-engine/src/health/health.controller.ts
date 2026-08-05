import { Controller, Get } from '@nestjs/common';

interface HealthStatus {
  status: 'ok';
}

/** Pure liveness probe (E1 Part 8, T16) — health-check only at skeleton stage. */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }
}

import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { RedisHealthIndicator } from './indicators/redis.health';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
// Probes de orquestrador nao podem ser barradas pelo rate limit.
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /** Liveness: o processo HTTP responde. Nao toca em dependencias. */
  @Get('live')
  @ApiExcludeEndpoint()
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness: PostgreSQL e Redis respondem. Retorna 503 se algum falhar. */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Verifica PostgreSQL e Redis' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.database.pingCheck('postgres', { timeout: 3000 }),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}

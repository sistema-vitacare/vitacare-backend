import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * O Terminus nao traz indicador de Redis; este cobre a instancia externa
 * usada por cache e filas.
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly client: Redis,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const pong: string = await this.client.ping();

      return pong === 'PONG'
        ? indicator.up()
        : indicator.down({ message: `Resposta inesperada do Redis: ${pong}` });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'Redis indisponivel',
      });
    }
  }
}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import {
  HeartbeatProcessor,
  OPERATIONS_QUEUE,
} from './heartbeat/heartbeat.processor';
import { RedisHealthIndicator } from './indicators/redis.health';

@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue({ name: OPERATIONS_QUEUE }),
  ],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, HeartbeatProcessor],
})
export class HealthModule {}

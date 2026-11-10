import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { HeartbeatProcessor, OPERATIONS_QUEUE } from './heartbeat.processor';

/** Fora do HealthModule: os probes de health nao dependem do BullMQ. */
@Module({
  imports: [BullModule.registerQueue({ name: OPERATIONS_QUEUE })],
  providers: [HeartbeatProcessor],
})
export class HeartbeatModule {}

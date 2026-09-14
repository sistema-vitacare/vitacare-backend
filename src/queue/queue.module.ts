import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        prefix: config.getOrThrow<string>('redis.queuePrefix'),
        connection: {
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
          username: config.get<string>('redis.username'),
          password: config.get<string>('redis.password'),
          db: config.getOrThrow<number>('redis.database'),
          connectTimeout: config.getOrThrow<number>('redis.connectTimeoutMs'),
          maxRetriesPerRequest: null,
          tls: config.getOrThrow<boolean>('redis.tls') ? {} : undefined,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}

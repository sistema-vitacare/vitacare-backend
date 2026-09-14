import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Redis> => {
        const options: RedisOptions = {
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
          username: config.get<string>('redis.username'),
          password: config.get<string>('redis.password'),
          db: config.getOrThrow<number>('redis.database'),
          keyPrefix: config.getOrThrow<string>('redis.keyPrefix'),
          connectTimeout: config.getOrThrow<number>('redis.connectTimeoutMs'),
          enableReadyCheck: true,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          tls: config.getOrThrow<boolean>('redis.tls') ? {} : undefined,
        };
        const client = new Redis(options);
        await client.connect();
        return client;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}

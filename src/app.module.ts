import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { environmentValidationSchema } from './config/env.validation';
import redisConfig from './config/redis.config';
import securityConfig from './config/security.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

// pino-pretty e devDependency: a imagem de runtime instala com --omit=dev e nao
// o tem. Fora de producao usamos o log formatado quando o pacote existe e
// caimos em JSON puro quando nao existe, em vez de derrubar o boot.
function prettyTransport() {
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { singleLine: true } };
  } catch {
    return undefined;
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig, redisConfig, securityConfig],
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('app.logLevel'),
          // Em producao o log vai em JSON puro para o coletor de logs.
          transport:
            config.getOrThrow<string>('app.environment') === 'production'
              ? undefined
              : prettyTransport(),
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
          ],
          autoLogging: {
            ignore: (req: { url?: string }) =>
              req.url === '/health/live' || req.url === '/health/ready',
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('security.throttleTtlMs'),
            limit: config.getOrThrow<number>('security.throttleLimit'),
          },
        ],
      }),
    }),
    DatabaseModule,
    RedisModule,
    QueueModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

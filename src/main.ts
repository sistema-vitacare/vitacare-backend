import type { Server } from 'node:http';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.flushLogs();

  const config = app.get(ConfigService);
  const logger = new NestLogger('Bootstrap');

  const port = config.getOrThrow<number>('app.port');
  const apiPrefix = config.getOrThrow<string>('app.apiPrefix');
  const apiVersion = config.getOrThrow<string>('app.apiVersion');
  const swaggerEnabled = config.getOrThrow<boolean>('app.swaggerEnabled');

  const { docsPath } = setupApp(app, {
    apiPrefix,
    apiVersion,
    isProduction: config.getOrThrow<string>('app.environment') === 'production',
    corsOrigins: config.getOrThrow<string[]>('security.corsOrigins'),
    corsCredentials: config.getOrThrow<boolean>('security.corsCredentials'),
    swaggerEnabled,
    swaggerPath: config.getOrThrow<string>('app.swaggerPath'),
    trustProxy: config.get<false | number | string>('app.trustProxy'),
  });

  await app.listen(port, '0.0.0.0');

  // Hierarquia de timeouts, de dentro para fora: consulta (30s) < request do
  // Node (60s) < proxy publico (>= 90s).
  const server: Server = app.getHttpServer();
  const keepAliveTimeout = config.getOrThrow<number>('app.keepAliveTimeoutMs');
  server.keepAliveTimeout = keepAliveTimeout;
  server.headersTimeout = keepAliveTimeout + 1000;
  server.requestTimeout = config.getOrThrow<number>('app.requestTimeoutMs');

  logger.log(`API em http://0.0.0.0:${port}/${apiPrefix}/v${apiVersion}`);
  if (swaggerEnabled) {
    logger.log(`Swagger em http://0.0.0.0:${port}${docsPath}`);
  }
}

void bootstrap();

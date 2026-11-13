import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { setupApp } from '@/app.setup';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { buildDataSourceOptions } from '@/database/typeorm.options';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '@/modules/Notification/channels/emailSender';

/**
 * A API inteira (BE-24): `AppModule` sem nenhum provider trocado, sobre um
 * PostgreSQL vazio migrado pelas mesmas opcoes do entrypoint de producao, o
 * Redis real (rate limit, filas BullMQ e seus workers) e um diretorio de
 * arquivos temporario. O master nasce como em `npm run seed:platform`; todo o
 * resto o teste cria pela HTTP.
 */

export const MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  'src',
  'database',
  'migrations',
);

export const CORS_ORIGIN = 'https://app.example.test';

const MASTER = {
  organizationCode: 'vitacare',
  tradeName: 'VitaCare',
  adminName: 'Master Homologacao',
  adminEmail: 'master@vitacare.test',
  adminCpf: '11144477735',
};

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface FullApp {
  app: INestApplication;
  dataSource: DataSource;
  /** Migrations aplicadas no banco vazio, na ordem de execucao. */
  executedMigrations: string[];
  master: { organizationCode: string; email: string; password: string };
  server: () => App;
  http: (
    method: Method,
    path: string,
    token?: string | null,
    body?: object,
  ) => request.Test;
  close: () => Promise<void>;
}

const assertDisposableDatabase = (url: URL) => {
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/vitacare_schema_test'
  ) {
    throw new Error('O teste exige um banco local vitacare_schema_test.');
  }
};

/** Variaveis lidas pelo ConfigModule; nenhuma vem do `.env` do checkout. */
const applyEnvironment = (
  database: URL,
  redis: URL,
  storagePath: string,
  runId: string,
) => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_PREFIX: 'api',
    API_VERSION: '1',
    APP_VERSION: 'homologacao',
    SWAGGER_ENABLED: 'true',
    SWAGGER_PATH: 'docs',
    TRUST_PROXY: 'false',
    CORS_ORIGINS: CORS_ORIGIN,
    CORS_CREDENTIALS: 'false',
    THROTTLE_TTL_MS: '60000',
    THROTTLE_LIMIT: '100000',
    SMTP_ENABLED: 'false',
    INVITATION_ACCEPT_URL: `${CORS_ORIGIN}/aceitar-convite`,
    INVITATION_TTL_HOURS: '72',
    WEB_PUSH_ENABLED: 'false',
    NOTIFICATION_APP_URL: '',
    DB_HOST: database.hostname,
    DB_PORT: database.port || '5432',
    DB_USERNAME: decodeURIComponent(database.username),
    DB_PASSWORD: decodeURIComponent(database.password),
    DB_DATABASE: database.pathname.slice(1),
    DB_SCHEMA: 'public',
    DB_SSL: 'false',
    DB_POOL_SIZE: '10',
    DB_MIGRATIONS_TABLE: 'migrations',
    REDIS_HOST: redis.hostname,
    REDIS_PORT: redis.port || '6379',
    REDIS_USERNAME: decodeURIComponent(redis.username),
    REDIS_PASSWORD: decodeURIComponent(redis.password),
    REDIS_DB: redis.pathname.slice(1) || '0',
    REDIS_TLS: 'false',
    REDIS_KEY_PREFIX: `homologacao-${runId}:`,
    QUEUE_PREFIX: `homologacao-${runId}`,
    STORAGE_PATH: storagePath,
  });
};

const migrationSource = (config: ConfigService) =>
  new DataSource(
    buildDataSourceOptions({
      host: config.getOrThrow('DB_HOST'),
      port: Number(config.getOrThrow('DB_PORT')),
      username: config.getOrThrow('DB_USERNAME'),
      password: config.getOrThrow('DB_PASSWORD'),
      database: config.getOrThrow('DB_DATABASE'),
      schema: 'public',
      ssl: false,
      sslRejectUnauthorized: true,
      poolSize: 2,
      poolIdleTimeoutMs: 30000,
      statementTimeoutMs: 30000,
      applicationName: 'vitacare-homologacao',
      connectTimeoutMs: 10000,
      migrationsTableName: 'migrations',
    }),
  );

export const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort();

export interface FullAppOptions {
  /** Porta SMTP falsa (BE-31): troca o `EMAIL_SENDER` de todos os modulos. */
  emailSender?: EmailSender;
}

export const bootFullApp = async (
  databaseUrl: string,
  redisUrl: string,
  options: FullAppOptions = {},
): Promise<FullApp> => {
  const database = new URL(databaseUrl);
  const redis = new URL(redisUrl);

  assertDisposableDatabase(database);

  const runId = randomUUID().slice(0, 8);
  const storagePath = await mkdtemp(join(tmpdir(), 'vitacare-homologacao-'));

  applyEnvironment(database, redis, storagePath, runId);

  const env = new ConfigService(process.env);
  const migrations = migrationSource(env);

  await migrations.initialize();

  const [{ exists }] = await migrations.query<Array<{ exists: string | null }>>(
    "SELECT to_regclass('public.organizations')::text AS exists",
  );

  if (exists !== null) {
    await migrations.destroy();
    throw new Error('O banco de teste ja contem a tabela organizations.');
  }

  const executed = await migrations.runMigrations();

  await migrations.destroy();

  // O ConfigModule le o ambiente quando o modulo e importado.
  const { AppModule } = await import('@/app.module');
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (options.emailSender) {
    builder.overrideProvider(EMAIL_SENDER).useValue(options.emailSender);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  const config = app.get(ConfigService);

  setupApp(app, {
    apiPrefix: config.getOrThrow('app.apiPrefix'),
    apiVersion: config.getOrThrow('app.apiVersion'),
    isProduction: config.getOrThrow('app.environment') === 'production',
    corsOrigins: config.getOrThrow('security.corsOrigins'),
    corsCredentials: config.getOrThrow('security.corsCredentials'),
    swaggerEnabled: config.getOrThrow('app.swaggerEnabled'),
    swaggerPath: config.getOrThrow('app.swaggerPath'),
    trustProxy: config.get('app.trustProxy'),
  });

  await app.init();

  const dataSource = app.get(DataSource);
  const seeded = await runPlatformSeed(
    dataSource,
    app.get(PasswordHasher),
    MASTER,
  );
  const server = () => app.getHttpServer() as App;
  const http: FullApp['http'] = (method, path, token, body) => {
    const call = request(server())[method](`/api/v1${path}`);

    if (token) call.set('Authorization', `Bearer ${token}`);
    if (body) call.send(body);

    return call;
  };

  return {
    app,
    dataSource,
    executedMigrations: executed.map((migration) => migration.name),
    master: {
      organizationCode: MASTER.organizationCode,
      email: MASTER.adminEmail,
      password: seeded.temporaryPassword,
    },
    server,
    http,

    /**
     * Desfaz tudo: dados, cada migration pelo `down` (a ultima primeiro),
     * chaves do Redis com o prefixo desta execucao e os arquivos.
     */
    async close() {
      await app.close();

      const cleanup = migrationSource(env);

      await cleanup.initialize();

      const tables = await cleanup.query<Array<{ name: string }>>(
        `SELECT tablename AS name FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> 'migrations'`,
      );

      if (tables.length > 0) {
        await cleanup.query(
          `TRUNCATE ${tables.map((table) => `"${table.name}"`).join(', ')} CASCADE`,
        );
      }

      for (const _ of await cleanup.query('SELECT 1 FROM migrations')) {
        await cleanup.undoLastMigration();
      }

      await cleanup.destroy();

      const client = new Redis(redisUrl, { lazyConnect: true });

      await client.connect();

      for (const prefix of [`homologacao-${runId}:`, `homologacao-${runId}`]) {
        const keys = await client.keys(`${prefix}*`);

        if (keys.length > 0) await client.del(...keys);
      }

      await client.quit();
      await rm(storagePath, { recursive: true, force: true });
    },
  };
};

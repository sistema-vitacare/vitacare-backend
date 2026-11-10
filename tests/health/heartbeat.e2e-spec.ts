import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';

import operationsConfig from '@/config/operations.config';
import redisConfig from '@/config/redis.config';
import {
  HEARTBEAT_JOB,
  HeartbeatProcessor,
  OPERATIONS_QUEUE,
} from '@/health/heartbeat/heartbeat.processor';
import { QueueModule } from '@/queue/queue.module';

/**
 * Heartbeat contra Redis e PostgreSQL **reais**: o scheduler fica gravado no
 * Redis, o worker do processo consome e o pulso chega a um servidor HTTP
 * local no papel do Uptime Kuma.
 */
const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithInfra = databaseUrl && redisUrl ? describe : describe.skip;

describeWithInfra('heartbeat dos workers (Redis e PostgreSQL reais)', () => {
  let kuma: Server;
  let pushes: string[];
  let database: DataSource;

  const boot = async (pushUrl: string): Promise<TestingModule> => {
    const redis = new URL(redisUrl!);

    Object.assign(process.env, {
      REDIS_HOST: redis.hostname,
      REDIS_PORT: redis.port || '6379',
      REDIS_PASSWORD: decodeURIComponent(redis.password),
      REDIS_DB: redis.pathname.slice(1) || '0',
      QUEUE_PREFIX: `heartbeat-${randomUUID().slice(0, 8)}`,
      UPTIME_KUMA_PUSH_URL: pushUrl,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [redisConfig, operationsConfig],
        }),
        QueueModule,
        BullModule.registerQueue({ name: OPERATIONS_QUEUE }),
      ],
      providers: [
        HeartbeatProcessor,
        { provide: DataSource, useValue: database },
      ],
    }).compile();

    await moduleRef.init();

    return moduleRef;
  };

  const queueOf = (moduleRef: TestingModule) =>
    moduleRef.get<Queue>(getQueueToken(OPERATIONS_QUEUE));

  const cleanup = async (moduleRef: TestingModule) => {
    await queueOf(moduleRef).obliterate({ force: true });
    await moduleRef.close();
  };

  beforeAll(async () => {
    pushes = [];
    kuma = createServer((req, res) => {
      pushes.push(req.url ?? '');
      res.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => kuma.listen(0, '127.0.0.1', resolve));

    database = new DataSource({ type: 'postgres', url: databaseUrl });
    await database.initialize();
  }, 30000);

  afterAll(async () => {
    await new Promise((resolve) => kuma.close(resolve));
    await database.destroy();
  });

  it('agenda o pulso no Redis e o worker entrega ao Kuma', async () => {
    const { port } = kuma.address() as AddressInfo;
    const moduleRef = await boot(`http://127.0.0.1:${port}/api/push/token`);
    const queue = queueOf(moduleRef);

    for (let i = 0; i < 50; i++) {
      if ((await queue.getJobSchedulers()).length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await queue.getJobSchedulers()).map((s) => s.key)).toEqual([
      HEARTBEAT_JOB,
    ]);

    await queue.add(HEARTBEAT_JOB, {});

    for (let i = 0; i < 100 && pushes.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(pushes.length).toBeGreaterThanOrEqual(1);
    expect(pushes[0]).toBe('/api/push/token?status=up&msg=OK');

    await cleanup(moduleRef);
  }, 30000);

  it('sem URL nao deixa agendamento na fila', async () => {
    const moduleRef = await boot('');
    const queue = queueOf(moduleRef);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await queue.getJobSchedulers()).toEqual([]);

    await cleanup(moduleRef);
  }, 30000);
});

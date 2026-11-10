import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';

import { sendHeartbeat, type HeartbeatResult } from './sendHeartbeat';

export const OPERATIONS_QUEUE = 'operations';
export const HEARTBEAT_JOB = 'heartbeat';
export const HEARTBEAT_EVERY_MS = 300_000;

/** Kuma ou banco fora repetem a cada pulso: um aviso por hora basta. */
const FAILURE_LOG_INTERVAL_MS = 3_600_000;

/**
 * Prova de vida dos workers para o monitor Push do Uptime Kuma: o
 * `/health/live` responde 200 mesmo com as varreduras paradas. Sem pulso por
 * dois intervalos, o Kuma alerta.
 */
@Processor(OPERATIONS_QUEUE)
export class HeartbeatProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(HeartbeatProcessor.name);
  private readonly pushUrl: string | undefined;
  private lastFailureLog = 0;

  constructor(
    @InjectQueue(OPERATIONS_QUEUE) private readonly queue: Queue,
    config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    super();
    this.pushUrl = config.get<string>('operations.uptimeKumaPushUrl');
  }

  /** Sem `await`: Redis fora do ar nao impede a API de subir. */
  onApplicationBootstrap(): void {
    if (!this.pushUrl) {
      this.logger.log(
        'Heartbeat do Uptime Kuma desligado (UPTIME_KUMA_PUSH_URL vazia).',
      );
      this.queue.removeJobScheduler(HEARTBEAT_JOB).catch(() => undefined);
      return;
    }

    this.queue
      .upsertJobScheduler(
        HEARTBEAT_JOB,
        { every: HEARTBEAT_EVERY_MS },
        {
          name: HEARTBEAT_JOB,
          opts: { removeOnComplete: true, removeOnFail: 100 },
        },
      )
      .catch((error: unknown) =>
        this.logger.error(
          `Nao foi possivel agendar ${HEARTBEAT_JOB}.`,
          error instanceof Error ? error.stack : String(error),
        ),
      );
  }

  async process(job: Job): Promise<HeartbeatResult | 'disabled'> {
    if (job.name !== HEARTBEAT_JOB) {
      throw new Error(
        `Job desconhecido na fila ${OPERATIONS_QUEUE}: ${job.name}`,
      );
    }

    if (!this.pushUrl) return 'disabled';

    const result = await sendHeartbeat({
      pushUrl: this.pushUrl,
      pingDatabase: async () => {
        await this.dataSource.query('SELECT 1');
      },
      fetch: globalThis.fetch,
    });

    if (result !== 'sent') this.logFailure(result);

    return result;
  }

  private logFailure(result: HeartbeatResult): void {
    const now = Date.now();

    if (now - this.lastFailureLog < FAILURE_LOG_INTERVAL_MS) return;

    this.lastFailureLog = now;
    this.logger.warn(
      result === 'database_down'
        ? 'Heartbeat nao enviado: PostgreSQL sem resposta.'
        : 'Heartbeat nao entregue ao Uptime Kuma.',
    );
  }
}

import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import {
  type DeliveryCount,
  DeliverNotificationsUseCase,
} from './DeliverNotifications/deliverNotifications.useCase';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATION_DELIVERY_SWEEP = 'notification-delivery-sweep';

const SWEEP_EVERY_MS = 10_000;
/** Reconexao ao Redis repete o erro a cada segundo: um log por minuto basta. */
const CONNECTION_ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Entrega por push e e-mail (BE-17). O Redis so agenda a varredura; as
 * entregas, tentativas e reservas moram no PostgreSQL, entao uma varredura
 * perdida so adia e uma repetida nao reenvia.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(NotificationProcessor.name);
  private readonly lastConnectionLog = new Map<string, number>();

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly deliver: DeliverNotificationsUseCase,
  ) {
    super();
  }

  /** Sem `await`: Redis fora do ar nao impede a API de subir. */
  onApplicationBootstrap(): void {
    this.queue.on('error', (error) => this.logConnectionError('fila', error));
    this.queue
      .upsertJobScheduler(
        NOTIFICATION_DELIVERY_SWEEP,
        { every: SWEEP_EVERY_MS },
        {
          name: NOTIFICATION_DELIVERY_SWEEP,
          opts: { removeOnComplete: true, removeOnFail: 100 },
        },
      )
      .catch((error: unknown) =>
        this.logger.error(
          `Nao foi possivel agendar ${NOTIFICATION_DELIVERY_SWEEP}.`,
          error instanceof Error ? error.stack : String(error),
        ),
      );
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logConnectionError('worker', error);
  }

  process(job: Job): Promise<DeliveryCount> {
    if (job.name === NOTIFICATION_DELIVERY_SWEEP) return this.deliver.execute();

    return Promise.reject(
      new Error(`Job desconhecido na fila ${NOTIFICATIONS_QUEUE}: ${job.name}`),
    );
  }

  private logConnectionError(source: string, error: Error): void {
    const now = Date.now();

    if (
      now - (this.lastConnectionLog.get(source) ?? 0) <
      CONNECTION_ERROR_LOG_INTERVAL_MS
    ) {
      return;
    }

    this.lastConnectionLog.set(source, now);
    this.logger.warn(
      `Redis indisponivel para a entrega de notificacoes (${source}): ${error.message}`,
    );
  }
}

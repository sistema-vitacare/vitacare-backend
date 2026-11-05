import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { AlertRepository } from '../repositories/alert.repository';
import {
  EvaluateFollowUpAlertsUseCase,
  stackOf,
} from './evaluateFollowUpAlerts.useCase';

export const ALERTS_QUEUE = 'alerts';

const SWEEP_SCHEDULER_ID = 'alerts-sweep';
const SWEEP_EVERY_MS = 60_000;
/** Folga para nao disputar com a avaliacao logo apos o envio. */
const SWEEP_MIN_AGE_SECONDS = 60;
const SWEEP_BATCH = 100;
/** Reconexao ao Redis repete o erro a cada segundo: um log por minuto basta. */
const CONNECTION_ERROR_LOG_INTERVAL_MS = 60_000;

export interface SweepResult {
  evaluated: number;
  skipped: number;
  failed: number;
}

/**
 * Recupera registros que ficaram sem avaliacao (falha, queda do processo).
 * O agendamento vive no Redis (job scheduler do BullMQ), entao reinicios nao
 * duplicam a varredura; a trava e o `UNIQUE` do alerta cobrem execucoes
 * concorrentes. Registro que falha de novo e adiado para nao travar a fila.
 */
@Processor(ALERTS_QUEUE)
export class AlertSweepProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(AlertSweepProcessor.name);
  private readonly lastConnectionLog = new Map<string, number>();

  constructor(
    @InjectQueue(ALERTS_QUEUE) private readonly queue: Queue,
    private readonly alerts: AlertRepository,
    private readonly evaluate: EvaluateFollowUpAlertsUseCase,
  ) {
    super();
  }

  /** Sem `await`: Redis fora do ar nao impede a API de subir. */
  onApplicationBootstrap(): void {
    this.queue.on('error', (error) => this.logConnectionError('fila', error));
    this.queue
      .upsertJobScheduler(
        SWEEP_SCHEDULER_ID,
        { every: SWEEP_EVERY_MS },
        { name: 'sweep', opts: { removeOnComplete: true, removeOnFail: 100 } },
      )
      .catch((error: unknown) =>
        this.logger.error(
          'Nao foi possivel agendar a varredura de alertas.',
          stackOf(error),
        ),
      );
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logConnectionError('worker', error);
  }

  async process(): Promise<SweepResult> {
    const pending = await this.alerts.findPendingRecords(
      SWEEP_MIN_AGE_SECONDS,
      SWEEP_BATCH,
    );
    const result: SweepResult = { evaluated: 0, skipped: 0, failed: 0 };

    for (const record of pending) {
      try {
        const outcome = await this.evaluate.execute(
          record.organizationId,
          record.id,
        );

        result[outcome.kind] += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `Varredura nao avaliou o registro ${record.id}; nova tentativa em uma hora.`,
          stackOf(error),
        );
        await this.alerts
          .markEvaluationFailed(record.organizationId, record.id)
          .catch(() => undefined);
      }
    }

    return result;
  }

  /** So a mensagem: o erro de conexao nao carrega dado de paciente. */
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
      `Redis indisponivel para a varredura de alertas (${source}): ${error.message}`,
    );
  }
}

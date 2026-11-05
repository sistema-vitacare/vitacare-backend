import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { DispatchMedicationRemindersUseCase } from './DispatchMedicationReminders/dispatchMedicationReminders.useCase';
import { SweepAbsencesUseCase } from './SweepAbsences/sweepAbsences.useCase';
import type { SweepCount } from './types/automation.types';

export const AUTOMATION_QUEUE = 'automation';
export const ABSENCE_SWEEP = 'absence-sweep';
export const MEDICATION_REMINDER_SWEEP = 'medication-reminder-sweep';

const SWEEP_EVERY_MS = 60_000;
/** Reconexao ao Redis repete o erro a cada segundo: um log por minuto basta. */
const CONNECTION_ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Disparos por relogio do BE-16. O Redis so agenda (job schedulers do
 * BullMQ, que sobrevivem a reinicio sem duplicar o agendamento); o estado e o
 * cursor de cada item moram no PostgreSQL, entao uma varredura perdida ou
 * repetida so adia ou reconfere, sem perder nem duplicar evento.
 */
@Processor(AUTOMATION_QUEUE)
export class AutomationProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(AutomationProcessor.name);
  private readonly lastConnectionLog = new Map<string, number>();

  constructor(
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue,
    private readonly absences: SweepAbsencesUseCase,
    private readonly reminders: DispatchMedicationRemindersUseCase,
  ) {
    super();
  }

  /** Sem `await`: Redis fora do ar nao impede a API de subir. */
  onApplicationBootstrap(): void {
    this.queue.on('error', (error) => this.logConnectionError('fila', error));

    for (const name of [ABSENCE_SWEEP, MEDICATION_REMINDER_SWEEP]) {
      this.queue
        .upsertJobScheduler(
          name,
          { every: SWEEP_EVERY_MS },
          { name, opts: { removeOnComplete: true, removeOnFail: 100 } },
        )
        .catch((error: unknown) =>
          this.logger.error(
            `Nao foi possivel agendar ${name}.`,
            error instanceof Error ? error.stack : String(error),
          ),
        );
    }
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logConnectionError('worker', error);
  }

  process(job: Job): Promise<SweepCount> {
    switch (job.name) {
      case ABSENCE_SWEEP:
        return this.absences.execute();
      case MEDICATION_REMINDER_SWEEP:
        return this.reminders.execute();
      default:
        return Promise.reject(
          new Error(
            `Job desconhecido na fila ${AUTOMATION_QUEUE}: ${job.name}`,
          ),
        );
    }
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
      `Redis indisponivel para os disparos agendados (${source}): ${error.message}`,
    );
  }
}

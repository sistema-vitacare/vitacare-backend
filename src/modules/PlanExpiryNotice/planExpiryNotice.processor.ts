import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { DeliverPlanExpiryNoticesUseCase } from './DeliverPlanExpiryNotices/deliverPlanExpiryNotices.useCase';
import { GeneratePlanExpiryNoticesUseCase } from './GeneratePlanExpiryNotices/generatePlanExpiryNotices.useCase';
import {
  NOTICE_CRON,
  NOTICE_TIME_ZONE,
} from './policies/noticeSchedule.policy';
import type {
  GenerationCount,
  NoticeDeliveryCount,
} from './types/planExpiryNotice.types';

export const PLAN_EXPIRY_NOTICES_QUEUE = 'plan-expiry-notices';
/** Execucao diaria as 08:00 de Brasilia: gera os avisos e envia. */
export const PLAN_EXPIRY_NOTICE_DAILY = 'plan-expiry-notice-daily';
/** Na subida: recupera uma execucao das 08:00 perdida, sem gerar nada alem dela. */
export const PLAN_EXPIRY_NOTICE_CATCH_UP = 'plan-expiry-notice-catch-up';
/** Nova tentativa de envio, agendada so quando ha e-mail pendente. */
export const PLAN_EXPIRY_NOTICE_RETRY = 'plan-expiry-notice-retry';

/** Reconexao ao Redis repete o erro a cada segundo: um log por minuto basta. */
const CONNECTION_ERROR_LOG_INTERVAL_MS = 60_000;

const JOB_OPTIONS = { removeOnComplete: true, removeOnFail: 100 };

export interface NoticeRunResult {
  generated: GenerationCount | null;
  delivered: NoticeDeliveryCount;
}

/**
 * Aviso de vencimento do plano por e-mail (BE-28). Nao roda o tempo todo: uma
 * vez por dia, as 08:00 de Brasilia, uma recuperacao na subida e novas
 * tentativas so quando algum e-mail ficou pendente. O Redis so agenda; avisos,
 * entregas e tentativas moram no PostgreSQL, entao uma execucao perdida so
 * adia e uma repetida nao duplica.
 */
@Processor(PLAN_EXPIRY_NOTICES_QUEUE)
export class PlanExpiryNoticeProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(PlanExpiryNoticeProcessor.name);
  private readonly lastConnectionLog = new Map<string, number>();

  constructor(
    @InjectQueue(PLAN_EXPIRY_NOTICES_QUEUE) private readonly queue: Queue,
    private readonly generate: GeneratePlanExpiryNoticesUseCase,
    private readonly deliver: DeliverPlanExpiryNoticesUseCase,
  ) {
    super();
  }

  /** Sem `await`: Redis fora do ar nao impede a API de subir. */
  onApplicationBootstrap(): void {
    this.queue.on('error', (error) => this.logConnectionError('fila', error));
    this.queue
      .upsertJobScheduler(
        PLAN_EXPIRY_NOTICE_DAILY,
        { pattern: NOTICE_CRON, tz: NOTICE_TIME_ZONE },
        { name: PLAN_EXPIRY_NOTICE_DAILY, opts: JOB_OPTIONS },
      )
      .then(() => this.queue.add(PLAN_EXPIRY_NOTICE_CATCH_UP, {}, JOB_OPTIONS))
      .catch((error: unknown) =>
        this.logger.error(
          `Nao foi possivel agendar ${PLAN_EXPIRY_NOTICE_DAILY}.`,
          error instanceof Error ? error.stack : String(error),
        ),
      );
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logConnectionError('worker', error);
  }

  async process(job: Job): Promise<NoticeRunResult> {
    let generated: GenerationCount | null = null;

    if (
      job.name === PLAN_EXPIRY_NOTICE_DAILY ||
      job.name === PLAN_EXPIRY_NOTICE_CATCH_UP
    ) {
      generated = await this.generate.execute();
    } else if (job.name !== PLAN_EXPIRY_NOTICE_RETRY) {
      throw new Error(
        `Job desconhecido na fila ${PLAN_EXPIRY_NOTICES_QUEUE}: ${job.name}`,
      );
    }

    const delivered = await this.deliver.execute();

    if (generated && generated.notices > 0) {
      this.logger.log(
        `Avisos de vencimento do plano: ${generated.notices} gerado(s) para ${generated.recipients} administrador(es).`,
      );
    }
    await this.scheduleRetry(delivered.nextAttemptAt);

    return { generated, delivered };
  }

  /**
   * Um job atrasado por instante de tentativa: o id repetido nao duplica. Se o
   * Redis perder o job, a execucao das 08:00 seguinte envia o pendente.
   */
  private async scheduleRetry(at: Date | null): Promise<void> {
    if (!at) return;

    const time = new Date(at).getTime();

    await this.queue.add(
      PLAN_EXPIRY_NOTICE_RETRY,
      {},
      {
        ...JOB_OPTIONS,
        jobId: `${PLAN_EXPIRY_NOTICE_RETRY}-${time}`,
        delay: Math.max(0, time - Date.now()),
      },
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
      `Redis indisponivel para o aviso de vencimento do plano (${source}): ${error.message}`,
    );
  }
}

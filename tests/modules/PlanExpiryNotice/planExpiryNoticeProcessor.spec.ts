import type { Job, Queue } from 'bullmq';

import type { DeliverPlanExpiryNoticesUseCase } from '@/modules/PlanExpiryNotice/DeliverPlanExpiryNotices/deliverPlanExpiryNotices.useCase';
import type { GeneratePlanExpiryNoticesUseCase } from '@/modules/PlanExpiryNotice/GeneratePlanExpiryNotices/generatePlanExpiryNotices.useCase';
import {
  PLAN_EXPIRY_NOTICE_CATCH_UP,
  PLAN_EXPIRY_NOTICE_DAILY,
  PLAN_EXPIRY_NOTICE_RETRY,
  PlanExpiryNoticeProcessor,
} from '@/modules/PlanExpiryNotice/planExpiryNotice.processor';

const delivered = (nextAttemptAt: Date | null = null) => ({
  sent: 1,
  retried: 0,
  failed: 0,
  skipped: 0,
  nextAttemptAt,
});

describe('PlanExpiryNoticeProcessor (BE-28)', () => {
  const queue = {
    on: jest.fn(),
    upsertJobScheduler: jest.fn(),
    add: jest.fn(),
  };
  const generate = { execute: jest.fn() };
  const deliver = { execute: jest.fn() };
  const processor = new PlanExpiryNoticeProcessor(
    queue as unknown as Queue,
    generate as unknown as GeneratePlanExpiryNoticesUseCase,
    deliver as unknown as DeliverPlanExpiryNoticesUseCase,
  );
  const job = (name: string) => ({ name }) as Job;
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.resetAllMocks();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
    queue.add.mockResolvedValue(undefined);
    generate.execute.mockResolvedValue({
      notices: 1,
      recipients: 2,
      failed: 0,
    });
    deliver.execute.mockResolvedValue(delivered());
  });

  it('agenda a execucao diaria as 08:00 de Brasilia e uma recuperacao na subida', async () => {
    processor.onApplicationBootstrap();
    await flush();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      PLAN_EXPIRY_NOTICE_DAILY,
      { pattern: '0 8 * * *', tz: 'America/Sao_Paulo' },
      expect.objectContaining({ name: PLAN_EXPIRY_NOTICE_DAILY }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      PLAN_EXPIRY_NOTICE_CATCH_UP,
      {},
      expect.objectContaining({ removeOnComplete: true }),
    );
  });

  it('nao derruba a subida se o Redis recusar o agendamento', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(() => processor.onApplicationBootstrap()).not.toThrow();
    await flush();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([PLAN_EXPIRY_NOTICE_DAILY, PLAN_EXPIRY_NOTICE_CATCH_UP])(
    '%s gera os avisos e envia',
    async (name) => {
      await processor.process(job(name));

      expect(generate.execute).toHaveBeenCalledTimes(1);
      expect(deliver.execute).toHaveBeenCalledTimes(1);
    },
  );

  it('a nova tentativa so envia, sem gerar', async () => {
    await processor.process(job(PLAN_EXPIRY_NOTICE_RETRY));

    expect(generate.execute).not.toHaveBeenCalled();
    expect(deliver.execute).toHaveBeenCalledTimes(1);
  });

  it('com e-mail pendente, agenda uma nova tentativa no instante dele, com id que nao duplica', async () => {
    const at = new Date(Date.now() + 60_000);
    deliver.execute.mockResolvedValue(delivered(at));

    await processor.process(job(PLAN_EXPIRY_NOTICE_DAILY));

    expect(queue.add).toHaveBeenCalledWith(
      PLAN_EXPIRY_NOTICE_RETRY,
      {},
      expect.objectContaining({
        jobId: `${PLAN_EXPIRY_NOTICE_RETRY}-${at.getTime()}`,
        delay: expect.any(Number) as number,
      }),
    );
    const delay = (
      queue.add.mock.calls[0] as [string, object, { delay: number }]
    )[2].delay;
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60_000);
  });

  it('sem pendente, nao agenda nada; tentativa vencida sai sem atraso', async () => {
    await processor.process(job(PLAN_EXPIRY_NOTICE_RETRY));
    expect(queue.add).not.toHaveBeenCalled();

    deliver.execute.mockResolvedValue(delivered(new Date(Date.now() - 1000)));
    await processor.process(job(PLAN_EXPIRY_NOTICE_RETRY));
    expect(queue.add).toHaveBeenCalledWith(
      PLAN_EXPIRY_NOTICE_RETRY,
      {},
      expect.objectContaining({ delay: 0 }),
    );
  });

  it('recusa job desconhecido', async () => {
    await expect(processor.process(job('outro'))).rejects.toThrow('outro');
    expect(deliver.execute).not.toHaveBeenCalled();
  });
});

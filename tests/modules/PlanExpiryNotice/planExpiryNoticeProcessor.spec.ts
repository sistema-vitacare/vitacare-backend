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

  it('agenda a execucao diaria as 08:00 de Brasilia e uma recuperacao na subida, com novas tentativas se falharem', async () => {
    processor.onApplicationBootstrap();
    await flush();

    const retried = expect.objectContaining({
      removeOnComplete: true,
      attempts: 6,
      backoff: { type: 'exponential', delay: 30_000 },
    }) as unknown;
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      PLAN_EXPIRY_NOTICE_DAILY,
      { pattern: '0 8 * * *', tz: 'America/Sao_Paulo' },
      { name: PLAN_EXPIRY_NOTICE_DAILY, opts: retried },
    );
    expect(queue.add).toHaveBeenCalledWith(
      PLAN_EXPIRY_NOTICE_CATCH_UP,
      {},
      retried,
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

  const retryCall = () =>
    queue.add.mock.calls.find(([name]) => name === PLAN_EXPIRY_NOTICE_RETRY) as
      [string, object, { jobId: string; delay: number }] | undefined;

  it('com e-mail pendente, agenda uma nova tentativa no segundo dele, com id que nao duplica', async () => {
    const at = new Date(Date.now() + 60_000);
    deliver.execute.mockResolvedValue(delivered(at));

    await processor.process(job(PLAN_EXPIRY_NOTICE_DAILY));

    const expected = Math.ceil(at.getTime() / 1000) * 1000;
    const [, , options] = retryCall()!;
    expect(options.jobId).toBe(`${PLAN_EXPIRY_NOTICE_RETRY}-${expected}`);
    expect(options.delay).toBeGreaterThan(59_000);
    expect(options.delay).toBeLessThanOrEqual(61_000);
  });

  it('sem pendente, nao agenda nada', async () => {
    await processor.process(job(PLAN_EXPIRY_NOTICE_RETRY));

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('tentativa ja vencida (relogio do banco atras) sai ao menos 1 s depois, com id diferente do job em execucao', async () => {
    const before = Date.now();
    const at = new Date(before - 1);
    deliver.execute.mockResolvedValue(delivered(at));

    await processor.process(job(PLAN_EXPIRY_NOTICE_RETRY));

    const [, , options] = retryCall()!;
    expect(options.delay).toBeGreaterThanOrEqual(1_000);
    expect(options.delay).toBeLessThanOrEqual(2_100);
    expect(options.jobId).not.toBe(
      `${PLAN_EXPIRY_NOTICE_RETRY}-${Math.ceil(at.getTime() / 1000) * 1000}`,
    );
  });

  it('recusa job desconhecido', async () => {
    await expect(processor.process(job('outro'))).rejects.toThrow('outro');
    expect(deliver.execute).not.toHaveBeenCalled();
  });
});

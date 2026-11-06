import type { Job, Queue } from 'bullmq';

import type { DeliverNotificationsUseCase } from '@/modules/Notification/DeliverNotifications/deliverNotifications.useCase';
import {
  NOTIFICATION_DELIVERY_SWEEP,
  NotificationProcessor,
} from '@/modules/Notification/notification.processor';

const count = { sent: 1, retried: 0, failed: 0, skipped: 0 };

describe('NotificationProcessor', () => {
  const queue = { on: jest.fn(), upsertJobScheduler: jest.fn() };
  const deliver = { execute: jest.fn() };
  const processor = new NotificationProcessor(
    queue as unknown as Queue,
    deliver as unknown as DeliverNotificationsUseCase,
  );
  const job = (name: string) => ({ name }) as Job;

  beforeEach(() => {
    jest.resetAllMocks();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
  });

  it('agenda a varredura de entrega a cada 10 s sem esperar o Redis', () => {
    processor.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      NOTIFICATION_DELIVERY_SWEEP,
      { every: 10_000 },
      expect.objectContaining({ name: NOTIFICATION_DELIVERY_SWEEP }),
    );
  });

  it('nao derruba a subida se o Redis recusar o agendamento', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(() => processor.onApplicationBootstrap()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('despacha a varredura e recusa job desconhecido', async () => {
    deliver.execute.mockResolvedValue(count);

    await expect(
      processor.process(job(NOTIFICATION_DELIVERY_SWEEP)),
    ).resolves.toBe(count);
    await expect(processor.process(job('outro'))).rejects.toThrow('outro');
  });
});

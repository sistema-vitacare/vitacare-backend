import type { Job, Queue } from 'bullmq';

import {
  ABSENCE_SWEEP,
  AutomationProcessor,
  MEDICATION_REMINDER_SWEEP,
} from '@/modules/Automation/automation.processor';
import type { DispatchMedicationRemindersUseCase } from '@/modules/Automation/DispatchMedicationReminders/dispatchMedicationReminders.useCase';
import type { SweepAbsencesUseCase } from '@/modules/Automation/SweepAbsences/sweepAbsences.useCase';

const count = { items: 1, alerts: 2, failed: 0 };

describe('AutomationProcessor', () => {
  const queue = {
    on: jest.fn(),
    upsertJobScheduler: jest.fn(),
  };
  const absences = { execute: jest.fn() };
  const reminders = { execute: jest.fn() };
  const processor = new AutomationProcessor(
    queue as unknown as Queue,
    absences as unknown as SweepAbsencesUseCase,
    reminders as unknown as DispatchMedicationRemindersUseCase,
  );
  const job = (name: string) => ({ name }) as Job;

  beforeEach(() => {
    jest.resetAllMocks();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
  });

  it('agenda as duas varreduras a cada 60 s sem esperar o Redis', () => {
    processor.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    for (const name of [ABSENCE_SWEEP, MEDICATION_REMINDER_SWEEP]) {
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        name,
        { every: 60_000 },
        expect.objectContaining({ name }),
      );
    }
  });

  it('nao derruba a subida se o Redis recusar o agendamento', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(() => processor.onApplicationBootstrap()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('despacha cada job para a sua varredura', async () => {
    absences.execute.mockResolvedValue(count);
    reminders.execute.mockResolvedValue(count);

    await expect(processor.process(job(ABSENCE_SWEEP))).resolves.toBe(count);
    expect(absences.execute).toHaveBeenCalledTimes(1);
    expect(reminders.execute).not.toHaveBeenCalled();

    await expect(
      processor.process(job(MEDICATION_REMINDER_SWEEP)),
    ).resolves.toBe(count);
    expect(reminders.execute).toHaveBeenCalledTimes(1);
  });

  it('recusa job desconhecido', async () => {
    await expect(processor.process(job('outro'))).rejects.toThrow('outro');
  });
});

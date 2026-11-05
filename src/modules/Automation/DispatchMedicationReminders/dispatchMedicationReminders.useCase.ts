import { Injectable, Logger } from '@nestjs/common';

import { runDueItems } from '../policies/runDueItems.policy';
import { MedicationReminderDispatchRepository } from '../repositories/medicationReminderDispatch.repository';
import type { SweepCount } from '../types/automation.types';

/**
 * RF014/UC13, horario de medicamento com lembrete ativo (UC08). Todo horario
 * vencido gera lembrete, mesmo depois de uma queda (decisao de Mateus em
 * 2026-11-05), desde que a linha da agenda ainda valha.
 */
@Injectable()
export class DispatchMedicationRemindersUseCase {
  private readonly logger = new Logger(DispatchMedicationRemindersUseCase.name);

  constructor(
    private readonly reminders: MedicationReminderDispatchRepository,
  ) {}

  async execute(): Promise<SweepCount> {
    const now = await this.reminders.now();

    return runDueItems({
      findDue: (limit, exclude) => this.reminders.findDue(now, limit, exclude),
      dispatch: (item) =>
        this.reminders.dispatch(item.organizationId, item.id, now),
      onFailure: (item, error) =>
        this.logger.error(
          `Lembretes da agenda ${item.id} nao foram gerados; nova tentativa na proxima varredura.`,
          error instanceof Error ? error.stack : String(error),
        ),
    });
  }
}

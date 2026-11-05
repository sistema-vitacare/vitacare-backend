import { Injectable, Logger } from '@nestjs/common';

import { AbsenceMonitorRepository } from '../repositories/absenceMonitor.repository';
import { runDueItems } from '../policies/runDueItems.policy';
import type { SweepCount } from '../types/automation.types';

/**
 * RF014/UC13, ausencia de registro (decisao de Mateus em 2026-11-05: um
 * alerta por periodo vencido, sem tolerancia). Fecha os pares que deixaram de
 * valer, abre os novos e despacha os pendentes ate o `now` do banco.
 */
@Injectable()
export class SweepAbsencesUseCase {
  private readonly logger = new Logger(SweepAbsencesUseCase.name);

  constructor(private readonly monitors: AbsenceMonitorRepository) {}

  async execute(): Promise<SweepCount> {
    const now = await this.monitors.now();

    await this.monitors.closeIneligible(now);
    await this.monitors.openEligible(now);

    return runDueItems({
      findDue: (limit, exclude) => this.monitors.findDue(now, limit, exclude),
      dispatch: (item) =>
        this.monitors.dispatch(item.organizationId, item.id, now),
      onFailure: (item, error) =>
        this.logger.error(
          `Ausencia do par ${item.id} nao foi conferida; nova tentativa na proxima varredura.`,
          error instanceof Error ? error.stack : String(error),
        ),
    });
  }
}

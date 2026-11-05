import { Injectable, Logger } from '@nestjs/common';

import { AlertRepository } from '../repositories/alert.repository';
import type { EvaluateRecordOutcome } from '../types/alert.types';

export const stackOf = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/**
 * RF014/UC11: avalia os valores de um registro ja gravado contra as regras.
 * Roda fora da transacao do registro: falhar aqui nunca desfaz o dado, e o
 * registro fica pendente para a varredura.
 */
@Injectable()
export class EvaluateFollowUpAlertsUseCase {
  private readonly logger = new Logger(EvaluateFollowUpAlertsUseCase.name);

  constructor(private readonly alerts: AlertRepository) {}

  execute(
    organizationId: string,
    followUpId: string,
  ): Promise<EvaluateRecordOutcome> {
    return this.alerts.evaluateRecord(organizationId, followUpId);
  }

  /** Chamado logo apos o envio; erro so vai para o log. */
  async afterSubmit(organizationId: string, followUpId: string): Promise<void> {
    try {
      await this.execute(organizationId, followUpId);
    } catch (error) {
      this.logger.error(
        `Avaliacao de alertas do registro ${followUpId} falhou; fica para a varredura.`,
        stackOf(error),
      );
    }
  }
}

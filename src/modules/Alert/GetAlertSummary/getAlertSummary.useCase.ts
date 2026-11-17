import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { PatientErrors } from '@/modules/Patient/patient.errors';

import type { AlertSummaryDto } from '../dtos/alertSummary.dto';
import { toAlertSummaryResponse } from '../parsers/alertSummary.parser';
import { alertScope } from '../policies/alertScope.policy';
import { AlertRepository } from '../repositories/alert.repository';
import type { AlertSummaryQueryDto } from './getAlertSummary.dto';

/**
 * Contadores dos alertas em aberto por severidade, no alcance da lista
 * (Figura 42, BE-33).
 */
@Injectable()
export class GetAlertSummaryUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(
    query: AlertSummaryQueryDto,
    ctx: RequestContext,
  ): Promise<AlertSummaryDto> {
    const outcome = await this.alerts.summary(alertScope(ctx), {
      patientId: query.patientId,
      source: query.source,
    });

    if (outcome.kind === 'patient_not_found') {
      throw new DomainException({
        ...PatientErrors.NOT_FOUND,
        detail:
          'Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.',
      });
    }

    return toAlertSummaryResponse(outcome.open);
  }
}

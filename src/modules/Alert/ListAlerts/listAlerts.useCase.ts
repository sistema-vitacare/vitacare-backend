import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { AlertDto } from '../dtos/alert.dto';
import { toAlertResponse } from '../parsers/alert.parser';
import { AlertRepository } from '../repositories/alert.repository';
import type { ListAlertsQueryDto } from './listAlerts.dto';

/** Alertas de um paciente do alcance, mais recentes primeiro (UC13 passo 5). */
@Injectable()
export class ListAlertsUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(
    query: ListAlertsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<AlertDto[]>> {
    const outcome = await this.alerts.list(patientScope(ctx), {
      patientId: query.patientId,
      severity: query.severity,
      skip: query.skip,
      take: query.limit,
    });

    if (outcome.kind === 'patient_not_found') {
      throw new DomainException({
        ...PatientErrors.NOT_FOUND,
        detail:
          'Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.',
      });
    }

    return paginate(
      outcome.items.map((item) => toAlertResponse(item, ctx)),
      outcome.total,
      query,
    );
  }
}

import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';
import { Permissions } from '@/modules/Access/access.permissions';
import { hasPermission } from '@/modules/Access/policies/access.policy';
import { alertScope } from '@/modules/Alert/policies/alertScope.policy';
import { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import { PatientOverviewRepository } from '../repositories/patientOverview.repository';
import type { PatientOverviewDto } from './getPatientOverview.dto';
import { toPatientOverviewResponse } from './getPatientOverview.parser';
import {
  ACTIVE_MEDICATIONS_LIMIT,
  MEASUREMENT_VALUES_PER_FIELD,
  OVERVIEW_NO_FOLLOW_UPS_MESSAGE,
  RECENT_ALERTS_LIMIT,
} from './getPatientOverview.type';

const patientNotFound = () =>
  new DomainException({
    ...PatientErrors.NOT_FOUND,
    detail:
      'Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.',
  });

/**
 * Visao consolidada do paciente (Figura 36): contadores, ultimas medicoes,
 * medicamentos ativos e alertas recentes, cada bloco so com a permissao de
 * leitura que o perfil tem. Fora do alcance, nada e contado nem devolvido.
 * Sem registro valido, `meta.message` informa a ausencia de dados.
 */
@Injectable()
export class GetPatientOverviewUseCase {
  constructor(
    private readonly overview: PatientOverviewRepository,
    private readonly medications: MedicationRepository,
    private readonly alerts: AlertRepository,
  ) {}

  async execute(
    patientId: string,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<PatientOverviewDto>> {
    const scope = patientScope(ctx);
    const records = await this.overview.findRecordSummary(
      scope,
      patientId,
      MEASUREMENT_VALUES_PER_FIELD,
    );

    if (!records) throw patientNotFound();

    const readsAlerts = hasPermission(ctx, Permissions.ALERTS_READ);
    const [medications, recentAlerts, openAlerts] = await Promise.all([
      hasPermission(ctx, Permissions.MEDICATIONS_READ)
        ? this.medications.list(scope, {
            patientId,
            status: 'active',
            skip: 0,
            take: ACTIVE_MEDICATIONS_LIMIT,
          })
        : null,
      readsAlerts
        ? this.alerts.list(alertScope(ctx), {
            patientId,
            skip: 0,
            take: RECENT_ALERTS_LIMIT,
          })
        : null,
      readsAlerts
        ? this.alerts.list(alertScope(ctx), {
            patientId,
            status: 'open',
            skip: 0,
            take: 0,
          })
        : null,
    ]);

    // Vinculo revogado entre as consultas: nada parcial sai.
    if (
      medications?.kind === 'patient_not_found' ||
      recentAlerts?.kind === 'patient_not_found' ||
      openAlerts?.kind === 'patient_not_found'
    ) {
      throw patientNotFound();
    }

    const response = toPatientOverviewResponse(
      {
        patientId,
        records,
        medications,
        alerts:
          recentAlerts && openAlerts
            ? { recent: recentAlerts.items, open: openAlerts.total }
            : null,
      },
      ctx,
    );

    return withMeta(
      response,
      records.validFollowUps === 0
        ? { message: OVERVIEW_NO_FOLLOW_UPS_MESSAGE }
        : {},
    );
  }
}

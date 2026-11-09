import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { PatientEvolutionRepository } from '@/modules/Indicator/repositories/patientEvolution.repository';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';
import { PatientRepository } from '@/modules/Patient/repositories/patient.repository';

import { ReportErrors } from '../report.errors';
import { PatientReportRepository } from '../repositories/patientReport.repository';
import {
  REPORT_MAX_MEDICATIONS,
  REPORT_MAX_RECORDS,
} from '../types/patientReport.types';
import type {
  PatientReportDto,
  PatientReportQueryDto,
} from './getPatientReport.dto';
import { toPatientReportResponse } from './getPatientReport.parser';

const patientNotFound = () =>
  new DomainException({
    ...PatientErrors.NOT_FOUND,
    detail:
      'Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.',
  });

/**
 * Relatorio consolidado do paciente no periodo (RF012, UC10 passos 1-5):
 * identificacao, registros validos com resumo, series com indicadores e
 * medicamentos ativos. Fora do alcance, nada alem do paciente e lido.
 */
@Injectable()
export class GetPatientReportUseCase {
  constructor(
    private readonly patients: PatientRepository,
    private readonly followUps: FollowUpRepository,
    private readonly evolution: PatientEvolutionRepository,
    private readonly medications: MedicationRepository,
    private readonly reports: PatientReportRepository,
  ) {}

  async execute(
    patientId: string,
    query: PatientReportQueryDto,
    ctx: RequestContext,
    now: Date = new Date(),
  ): Promise<PatientReportDto> {
    const period = resolveEvolutionPeriod(query, todayInBrazil(now));
    const scope = patientScope(ctx);
    const patient = await this.patients.findById(scope, patientId);

    if (!patient) throw patientNotFound();

    const [records, points, medications, header] = await Promise.all([
      this.followUps.list(scope, {
        patientId,
        ...period,
        status: 'valid',
        includeAnnulled: false,
        skip: 0,
        take: REPORT_MAX_RECORDS,
      }),
      this.evolution.findPoints(scope, patientId, period),
      this.medications.list(scope, {
        patientId,
        status: 'active',
        skip: 0,
        take: REPORT_MAX_MEDICATIONS,
      }),
      this.reports.findHeader(ctx.organizationId, ctx.userId),
    ]);

    // Alcance perdido entre as consultas: nada parcial sai.
    if (!records || !points || medications.kind === 'patient_not_found') {
      throw patientNotFound();
    }

    const [items, total] = records;

    if (total > REPORT_MAX_RECORDS) {
      throw new DomainException({
        ...ReportErrors.TOO_MANY_RECORDS,
        detail: `${total} registros validos no periodo; o maximo e ${REPORT_MAX_RECORDS}.`,
      });
    }

    return toPatientReportResponse(
      { period, patient, records: items, points, medications, header },
      ctx,
      now,
    );
  }
}

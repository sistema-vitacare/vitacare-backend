import type { RequestContext } from '@/common/context/requestContext.type';
import { toFollowUpResponse } from '@/modules/FollowUp/parsers/followUp.parser';
import type { FollowUpDetail } from '@/modules/FollowUp/types/followUp.types';
import { toPatientEvolutionResponse } from '@/modules/Indicator/GetPatientEvolution/getPatientEvolution.parser';
import { groupSeries } from '@/modules/Indicator/policies/evolutionIndicators.policy';
import { toMedicationResponse } from '@/modules/Medication/parsers/medication.parser';
import type { PatientRow } from '@/modules/Patient/types/patient.types';

import type { PatientReportSource } from '../types/patientReport.types';
import type {
  PatientReportDto,
  ReportPatientDto,
  ReportRecordsDto,
} from './getPatientReport.dto';

const toReportPatient = (patient: PatientRow): ReportPatientDto => ({
  id: patient.id,
  name: patient.name,
  birthDate: patient.birthDate,
  sex: patient.sex,
  status: patient.status,
  mainCondition: patient.mainCondition,
  secondaryConditions: patient.secondaryConditions,
  responsible:
    patient.responsibleId && patient.responsibleName
      ? { id: patient.responsibleId, name: patient.responsibleName }
      : null,
});

/** Contagem por chave, do maior total para o menor e, no empate, por nome. */
const countBy = <T extends { name: string }>(
  records: readonly FollowUpDetail[],
  keyOf: (record: FollowUpDetail) => string,
  entryOf: (record: FollowUpDetail) => T,
): Array<T & { total: number }> => {
  const counts = new Map<string, T & { total: number }>();

  for (const record of records) {
    const key = keyOf(record);
    const entry = counts.get(key) ?? { ...entryOf(record), total: 0 };

    entry.total += 1;
    counts.set(key, entry);
  }

  return [...counts.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  );
};

const toRecords = (
  newestFirst: readonly FollowUpDetail[],
  ctx: RequestContext,
): ReportRecordsDto => {
  const records = [...newestFirst].reverse();

  return {
    total: records.length,
    firstVisitedAt: records[0]?.visitedAt.toISOString() ?? null,
    lastVisitedAt: records.at(-1)?.visitedAt.toISOString() ?? null,
    byForm: countBy(
      records,
      (record) => record.formId,
      (record) => ({ formId: record.formId, name: record.formName }),
    ).map(({ formId, name, total }) => ({ formId, formName: name, total })),
    byAuthor: countBy(
      records,
      (record) => record.author.id,
      (record) => ({ userId: record.author.id, name: record.author.name }),
    ),
    items: records.map((record) => toFollowUpResponse(record, ctx)),
  };
};

/**
 * Leituras autorizadas -> relatorio. Series e indicadores saem das mesmas
 * funcoes do `GET /evolution`, para o PDF conferir com a API.
 */
export const toPatientReportResponse = (
  source: PatientReportSource,
  ctx: RequestContext,
  now: Date,
): PatientReportDto => {
  const evolution = toPatientEvolutionResponse(
    source.patient.id,
    source.period,
    groupSeries(source.points),
  );

  return {
    generatedAt: now.toISOString(),
    generatedBy: { id: ctx.userId, name: source.header.userName },
    organization: { name: source.header.organizationName },
    period: evolution.period,
    patient: toReportPatient(source.patient),
    records: toRecords(source.records, ctx),
    series: evolution.series,
    medications: source.medications.items.map((row) =>
      toMedicationResponse(row, source.medications.others, ctx, now),
    ),
  };
};

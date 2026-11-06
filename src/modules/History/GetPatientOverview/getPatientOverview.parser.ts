import type { RequestContext } from '@/common/context/requestContext.type';
import { toAlertResponse } from '@/modules/Alert/parsers/alert.parser';
import { toAnswerValue } from '@/modules/FollowUp/parsers/followUp.parser';
import { toMedicationResponse } from '@/modules/Medication/parsers/medication.parser';

import type {
  PatientMeasurementDto,
  PatientOverviewDto,
} from './getPatientOverview.dto';
import type {
  MeasurementRow,
  PatientOverview,
} from './getPatientOverview.type';

/** Agrupa por `fieldKey`; nome, unidade e formulario vem do valor mais recente. */
const toMeasurements = (rows: MeasurementRow[]): PatientMeasurementDto[] => {
  const groups = new Map<string, MeasurementRow[]>();

  for (const row of rows) {
    groups.set(row.fieldKey, [...(groups.get(row.fieldKey) ?? []), row]);
  }

  return [...groups.values()]
    .sort(
      ([a], [b]) =>
        a.formName.localeCompare(b.formName) ||
        a.position - b.position ||
        a.fieldKey.localeCompare(b.fieldKey),
    )
    .map(([latest, ...older]) => ({
      fieldKey: latest.fieldKey,
      name: latest.name,
      fieldType: latest.fieldType,
      unit: latest.unit,
      section: latest.section,
      form: { id: latest.formId, name: latest.formName },
      values: [latest, ...older].map((row) => ({
        value: toAnswerValue(row.fieldType, row.value) as number,
        visitedAt: row.visitedAt.toISOString(),
        followUpId: row.followUpId,
      })),
    }));
};

/**
 * Visao consolidada -> resposta, igual para todos os perfis: so registros
 * validos entram, e o familiar le medicamentos e alertas completos (BE-19).
 */
export const toPatientOverviewResponse = (
  overview: PatientOverview,
  ctx: RequestContext,
  now: Date = new Date(),
): PatientOverviewDto => ({
  patientId: overview.patientId,
  counts: {
    validFollowUps: overview.records.validFollowUps,
    openAlerts: overview.alerts?.open ?? null,
    activeMedications: overview.medications?.total ?? null,
  },
  lastVisitedAt: overview.records.lastVisitedAt?.toISOString() ?? null,
  measurements: toMeasurements(overview.records.measurements),
  activeMedications:
    overview.medications?.items.map((row) =>
      toMedicationResponse(row, overview.medications!.others, ctx, now),
    ) ?? null,
  recentAlerts:
    overview.alerts?.recent.map((row) => toAlertResponse(row, ctx)) ?? null,
});

import { ProfileCode } from '@/common/context/requestContext.type';
import type { EvolutionPointRow } from '@/modules/Indicator/types/evolution.types';
import type { PatientReportDto } from '@/modules/Report/GetPatientReport/getPatientReport.dto';
import { toPatientReportResponse } from '@/modules/Report/GetPatientReport/getPatientReport.parser';
import type { PatientReportSource } from '@/modules/Report/types/patientReport.types';

import { followUpDetail } from '../FollowUp/followUp.fixtures';
import { medicationRow } from '../Medication/medication.fixtures';
import { patientRow, sessionOf } from '../Patient/patient.fixtures';

export const REPORT_NOW = new Date('2026-11-09T15:00:00.000Z');

export const glicemiaPoint = (
  value: string,
  visitedAt: string,
): EvolutionPointRow => ({
  fieldKey: '7a5b3c1d-0000-4000-8000-00000000000a',
  name: 'Glicemia capilar',
  fieldType: 'number',
  unit: 'mg/dL',
  scaleMin: null,
  scaleMax: null,
  section: 'Sinais vitais',
  position: 0,
  formId: '8888888a-0000-4000-8000-00000000000a',
  formName: 'Acompanhamento Geral',
  value,
  visitedAt: new Date(visitedAt),
  followUpId: '5555555a-0000-4000-8000-00000000000a',
});

/** Relatorio montado pelo parser real a partir de linhas sinteticas. */
export const patientReport = (
  overrides: Partial<PatientReportSource> = {},
): PatientReportDto =>
  toPatientReportResponse(
    {
      period: { from: '2026-10-01', to: '2026-10-31' },
      patient: patientRow(),
      records: [
        followUpDetail({
          visitedAt: new Date('2026-10-19T03:00:00.000Z'),
          answers: [
            ...followUpDetail().answers,
            {
              fieldId: 'f2',
              fieldKey: 'k2',
              name: 'Observacao',
              fieldType: 'text',
              unit: null,
              section: null,
              position: 1,
              value: 'Sem queixas',
            },
            {
              fieldId: 'f3',
              fieldKey: 'k3',
              name: 'Tomou medicacao',
              fieldType: 'boolean',
              unit: null,
              section: null,
              position: 2,
              value: 'false',
            },
          ],
        }),
      ],
      points: [
        glicemiaPoint('105', '2026-10-01T03:00:00.000Z'),
        glicemiaPoint('98', '2026-10-10T03:00:00.000Z'),
        glicemiaPoint('142', '2026-10-19T03:00:00.000Z'),
      ],
      medications: { items: [medicationRow()], others: [] },
      header: {
        organizationName: 'Clinica Sintetica',
        userName: 'Profissional Sintetico',
      },
      ...overrides,
    },
    sessionOf(ProfileCode.PROFESSIONAL),
    REPORT_NOW,
  );

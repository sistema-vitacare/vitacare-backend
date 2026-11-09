import { HttpStatus } from '@nestjs/common';

import { ProfileCode } from '@/common/context/requestContext.type';
import type { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import type { PatientEvolutionRepository } from '@/modules/Indicator/repositories/patientEvolution.repository';
import type { EvolutionPointRow } from '@/modules/Indicator/types/evolution.types';
import type { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import type { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import { GetPatientReportUseCase } from '@/modules/Report/GetPatientReport/getPatientReport.useCase';
import type { PatientReportRepository } from '@/modules/Report/repositories/patientReport.repository';
import { REPORT_MAX_RECORDS } from '@/modules/Report/types/patientReport.types';

import { followUpDetail } from '../FollowUp/followUp.fixtures';
import { medicationRow } from '../Medication/medication.fixtures';
import {
  ACTOR_ID,
  captureError,
  ORGANIZATION_ID,
  PATIENT_ID,
  patientRow,
  sessionOf,
} from '../Patient/patient.fixtures';

const NOW = new Date('2026-11-09T15:00:00.000Z');
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
const FORM_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const BRUNO = { id: '22222222-0000-4000-8000-000000000002', name: 'Bruno' };

const point = (value: string, visitedAt: string): EvolutionPointRow => ({
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

/** Registros como saem do repositorio: visita mais recente primeiro. */
const RECORDS = [
  followUpDetail({
    id: 'r3',
    formId: FORM_B,
    formName: 'Bem-estar',
    author: BRUNO,
    visitedAt: new Date('2026-10-20T12:00:00.000Z'),
  }),
  followUpDetail({ id: 'r2', visitedAt: new Date('2026-10-10T12:00:00.000Z') }),
  followUpDetail({ id: 'r1', visitedAt: new Date('2026-10-01T12:00:00.000Z') }),
];

const setup = (
  overrides: {
    patient?: ReturnType<typeof patientRow> | null;
    records?: [typeof RECORDS, number] | null;
    points?: EvolutionPointRow[] | null;
    medications?: 'patient_not_found';
  } = {},
) => {
  const patients = {
    findById: jest
      .fn()
      .mockResolvedValue(
        'patient' in overrides ? overrides.patient : patientRow(),
      ),
  };
  const followUps = {
    list: jest
      .fn()
      .mockResolvedValue(
        'records' in overrides ? overrides.records : [RECORDS, 3],
      ),
  };
  const evolution = {
    findPoints: jest
      .fn()
      .mockResolvedValue(
        'points' in overrides
          ? overrides.points
          : [
              point('98', '2026-10-01T12:00:00.000Z'),
              point('142', '2026-10-10T12:00:00.000Z'),
            ],
      ),
  };
  const medications = {
    list: jest.fn().mockResolvedValue(
      overrides.medications
        ? { kind: overrides.medications }
        : {
            kind: 'ok',
            items: [medicationRow()],
            total: 1,
            others: [],
          },
    ),
  };
  const reports = {
    findHeader: jest.fn().mockResolvedValue({
      organizationName: 'Clinica Sintetica',
      userName: 'Profissional Sintetico',
    }),
  };
  const useCase = new GetPatientReportUseCase(
    patients as unknown as PatientRepository,
    followUps as unknown as FollowUpRepository,
    evolution as unknown as PatientEvolutionRepository,
    medications as unknown as MedicationRepository,
    reports as unknown as PatientReportRepository,
  );

  return { useCase, patients, followUps, evolution, medications, reports };
};

const professional = sessionOf(ProfileCode.PROFESSIONAL);

describe('GetPatientReportUseCase', () => {
  it('consolida identificacao, resumo, registros, series e medicamentos do periodo', async () => {
    const { useCase, followUps, evolution, medications } = setup();
    const report = await useCase.execute(
      PATIENT_ID,
      OCTOBER,
      professional,
      NOW,
    );

    expect(followUps.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      {
        patientId: PATIENT_ID,
        ...OCTOBER,
        status: 'valid',
        includeAnnulled: false,
        skip: 0,
        take: REPORT_MAX_RECORDS,
      },
    );
    expect(evolution.findPoints).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      PATIENT_ID,
      OCTOBER,
    );
    expect(medications.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patientId: PATIENT_ID, status: 'active' }),
    );

    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.generatedBy).toEqual({
      id: ACTOR_ID,
      name: 'Profissional Sintetico',
    });
    expect(report.organization).toEqual({ name: 'Clinica Sintetica' });
    expect(report.period).toEqual({
      ...OCTOBER,
      timeZone: 'America/Sao_Paulo',
    });
    expect(report.patient).toEqual({
      id: PATIENT_ID,
      name: 'Paciente Sintetico',
      birthDate: '1948-03-12',
      sex: 'female',
      status: 'active',
      mainCondition: 'Hipertensao arterial',
      secondaryConditions: ['Diabetes tipo 2'],
      responsible: {
        id: '4444444a-0000-4000-8000-00000000000a',
        name: 'Profissional Sintetico',
      },
    });

    expect(report.records.total).toBe(3);
    expect(report.records.firstVisitedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(report.records.lastVisitedAt).toBe('2026-10-20T12:00:00.000Z');
    expect(report.records.items.map((item) => item.id)).toEqual([
      'r1',
      'r2',
      'r3',
    ]);
    expect(report.records.byForm).toEqual([
      {
        formId: '8888888a-0000-4000-8000-00000000000a',
        formName: 'Acompanhamento Geral',
        total: 2,
      },
      { formId: FORM_B, formName: 'Bem-estar', total: 1 },
    ]);
    expect(report.records.byAuthor).toEqual([
      {
        userId: '11111111-0000-4000-8000-000000000001',
        name: 'Ana Cuidadora',
        total: 2,
      },
      { userId: BRUNO.id, name: 'Bruno', total: 1 },
    ]);

    expect(report.series).toHaveLength(1);
    expect(report.series[0].indicators).toMatchObject({
      sampleSize: 2,
      mean: 120,
      variation: 44,
      trend: null,
    });
    expect(report.medications.map((item) => item.name)).toEqual([
      'Losartana potassica',
    ]);
  });

  it('nao expoe CPF, contato, endereco, plano de saude nem observacoes do cadastro', async () => {
    const { useCase } = setup({
      patient: patientRow({
        phone: '11999990000',
        email: 'paciente@example.com',
        healthPlan: 'Plano Exemplo',
        notes: 'Nota do cadastro',
      }),
    });
    const report = await useCase.execute(
      PATIENT_ID,
      OCTOBER,
      professional,
      NOW,
    );
    const serialized = JSON.stringify(report.patient);

    for (const hidden of [
      '52998224725',
      '11999990000',
      'paciente@example.com',
      'Avenida Exemplo',
      'Plano Exemplo',
      'Nota do cadastro',
    ]) {
      expect(serialized).not.toContain(hidden);
    }
  });

  it('periodo vazio: total 0, sem visitas e sem series', async () => {
    const { useCase } = setup({ records: [[], 0], points: [] });
    const report = await useCase.execute(
      PATIENT_ID,
      OCTOBER,
      professional,
      NOW,
    );

    expect(report.records).toEqual({
      total: 0,
      firstVisitedAt: null,
      lastVisitedAt: null,
      byForm: [],
      byAuthor: [],
      items: [],
    });
    expect(report.series).toEqual([]);
  });

  it('periodo padrao: ultimos 30 dias ate hoje no fuso de Sao Paulo', async () => {
    const { useCase } = setup();
    const report = await useCase.execute(PATIENT_ID, {}, professional, NOW);

    expect(report.period).toMatchObject({
      from: '2026-10-11',
      to: '2026-11-09',
    });
  });

  it(`mais de ${REPORT_MAX_RECORDS} registros no periodo: 422 REPORT_TOO_MANY_RECORDS`, async () => {
    const { useCase } = setup({
      records: [RECORDS, REPORT_MAX_RECORDS + 1],
    });
    const error = await captureError(
      useCase.execute(PATIENT_ID, OCTOBER, professional, NOW),
    );

    expect(error.code).toBe('REPORT_TOO_MANY_RECORDS');
    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it.each([
    ['paciente fora do alcance', { patient: null }],
    ['registros fora do alcance', { records: null }],
    ['series fora do alcance', { points: null }],
    ['medicamentos fora do alcance', { medications: 'patient_not_found' }],
  ] as const)('%s: 404 PATIENT_NOT_FOUND', async (_case, overrides) => {
    const { useCase } = setup(overrides);
    const error = await captureError(
      useCase.execute(PATIENT_ID, OCTOBER, professional, NOW),
    );

    expect(error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('paciente fora do alcance: nada alem do paciente e lido', async () => {
    const { useCase, followUps, evolution, medications } = setup({
      patient: null,
    });

    await captureError(useCase.execute(PATIENT_ID, OCTOBER, professional, NOW));

    expect(followUps.list).not.toHaveBeenCalled();
    expect(evolution.findPoints).not.toHaveBeenCalled();
    expect(medications.list).not.toHaveBeenCalled();
  });
});

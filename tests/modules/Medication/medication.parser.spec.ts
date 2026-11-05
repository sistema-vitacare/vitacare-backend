import { ProfileCode } from '@/common/context/requestContext.type';
import {
  toMedicationInput,
  toMedicationPatch,
  toMedicationResponse,
} from '@/modules/Medication/parsers/medication.parser';

import { ACTOR_ID, PATIENT_ID, sessionOf } from '../Patient/patient.fixtures';
import {
  MEDICATION_ID,
  OTHER_MEDICATION_ID,
  conflictSource,
  medicationRow,
} from './medication.fixtures';

const ctx = sessionOf(ProfileCode.PROFESSIONAL);
const NOW = new Date('2026-11-05T12:00:00Z');

describe('toMedicationInput', () => {
  it('ordena horarios e aplica os padroes', () => {
    const input = toMedicationInput(
      {
        patientId: PATIENT_ID,
        name: 'Losartana',
        doseAmount: 0.5,
        doseUnit: 'tablet',
        times: ['20:00', '08:00'],
      },
      '2026-11-05',
    );

    expect(input).toEqual({
      fields: {
        name: 'Losartana',
        doseAmount: 0.5,
        doseUnit: 'tablet',
        route: null,
        notes: null,
        remindersEnabled: false,
      },
      schedule: {
        startDate: '2026-11-05',
        endDate: null,
        intervalDays: 1,
        times: ['08:00', '20:00'],
      },
    });
  });
});

describe('toMedicationPatch', () => {
  it('so leva o que veio; null limpa via, observacao e fim', () => {
    expect(
      toMedicationPatch({
        route: null,
        notes: null,
        endDate: null,
        times: ['21:00', '09:00'],
      }),
    ).toEqual({
      fields: { route: null, notes: null },
      schedule: { endDate: null, times: ['09:00', '21:00'] },
    });
    expect(toMedicationPatch({})).toEqual({ fields: {}, schedule: {} });
  });
});

describe('toMedicationResponse', () => {
  it('monta agenda, proximo horario em UTC, autoria e conflitos com outros', () => {
    const response = toMedicationResponse(
      medicationRow(),
      [
        conflictSource(),
        conflictSource({ id: MEDICATION_ID, name: 'O proprio' }),
      ],
      ctx,
      NOW,
    );

    expect(response).toEqual({
      id: MEDICATION_ID,
      patientId: PATIENT_ID,
      name: 'Losartana potassica',
      doseAmount: 50,
      doseUnit: 'mg',
      route: 'oral',
      notes: null,
      schedule: {
        startDate: '2026-11-01',
        endDate: null,
        intervalDays: 1,
        times: ['08:00', '20:00'],
        timeZone: 'America/Sao_Paulo',
      },
      remindersEnabled: true,
      nextScheduledAt: '2026-11-05T23:00:00.000Z',
      scheduleConflicts: [
        {
          medicationId: OTHER_MEDICATION_ID,
          medicationName: 'Metformina',
          time: '20:00',
        },
      ],
      status: 'active',
      createdBy: { id: ACTOR_ID, name: 'Profissional Sintetico' },
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
      deactivatedAt: null,
    });
  });

  it('inativo nao tem proximo horario nem conflito', () => {
    const response = toMedicationResponse(
      medicationRow({
        status: 'inactive',
        deletedAt: new Date('2026-11-04T10:00:00Z'),
      }),
      [conflictSource()],
      ctx,
      NOW,
    );

    expect(response.nextScheduledAt).toBeNull();
    expect(response.scheduleConflicts).toEqual([]);
    expect(response.deactivatedAt).toBe('2026-11-04T10:00:00.000Z');
    expect(response.schedule.times).toEqual(['08:00', '20:00']);
  });

  it('converte a dose numerica gravada como texto', () => {
    expect(
      toMedicationResponse(
        medicationRow({ doseAmount: Number('0.500') }),
        [],
        ctx,
        NOW,
      ).doseAmount,
    ).toBe(0.5);
  });
});

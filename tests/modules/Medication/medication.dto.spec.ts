import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateMedicationDto } from '@/modules/Medication/CreateMedication/createMedication.dto';
import { ListMedicationsQueryDto } from '@/modules/Medication/ListMedications/listMedications.dto';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';
import { UpdateMedicationDto } from '@/modules/Medication/UpdateMedication/updateMedication.dto';

import { PATIENT_ID } from '../Patient/patient.fixtures';

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const validBody = {
  patientId: PATIENT_ID,
  name: 'Losartana',
  doseAmount: 50,
  doseUnit: 'mg',
  times: ['08:00'],
};

/** Mesmas opcoes do `ValidationPipe` global de `app.setup.ts`. */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

const invalidFields = async (
  type: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> =>
  (await validate(plainToInstance(type, body), PIPE_OPTIONS)).map(
    (error) => error.property,
  );

describe('CreateMedicationDto', () => {
  it('aceita o minimo obrigatorio', async () => {
    expect(await invalidFields(CreateMedicationDto, validBody)).toEqual([]);
  });

  it('acusa cada obrigatorio ausente', async () => {
    expect((await invalidFields(CreateMedicationDto, {})).sort()).toEqual([
      'doseAmount',
      'doseUnit',
      'name',
      'patientId',
      'times',
    ]);
  });

  it.each([
    ['nome em branco', { name: '   ' }],
    ['nome longo', { name: 'x'.repeat(201) }],
    ['dose zero', { doseAmount: 0 }],
    ['dose com 4 casas', { doseAmount: 1.2345 }],
    ['dose acima do teto', { doseAmount: 10_000_000 }],
    ['dose em texto', { doseAmount: '50' }],
    ['unidade fora da lista', { doseUnit: 'kg' }],
    ['via fora da lista', { route: 'xyz' }],
    ['observacao longa', { notes: 'x'.repeat(2001) }],
    ['observacao em branco', { notes: '  ' }],
    ['sem horarios', { times: [] }],
    ['horario sem zero', { times: ['8:00'] }],
    ['horario 24:00', { times: ['24:00'] }],
    ['horario repetido', { times: ['08:00', '08:00'] }],
    [
      '25 horarios',
      {
        times: Array.from(
          { length: 25 },
          (_, index) =>
            `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
        ),
      },
    ],
    ['intervalo zero', { intervalDays: 0 }],
    ['intervalo 31', { intervalDays: 31 }],
    ['intervalo fracionado', { intervalDays: 1.5 }],
    ['inicio antes de 2000', { startDate: '1999-12-31' }],
    [
      'inicio mais de um ano a frente',
      { startDate: addDays(todayInBrazil(), 366) },
    ],
    ['data inexistente', { startDate: '2026-02-30' }],
    ['fim depois de 2100', { endDate: '2101-01-01' }],
    ['fim antes do inicio', { startDate: '2026-11-10', endDate: '2026-11-09' }],
    ['fim antes de hoje com inicio padrao', { endDate: '2001-01-01' }],
    [
      'fim antes de hoje com inicio nulo (= hoje)',
      { startDate: null, endDate: '2001-01-01' },
    ],
    ['lembrete em texto', { remindersEnabled: 'sim' }],
  ])('recusa %s', async (_label, override) => {
    expect(
      await invalidFields(CreateMedicationDto, { ...validBody, ...override }),
    ).toHaveLength(1);
  });

  it('aceita dose fracionada, via, periodo e intervalo nos limites', async () => {
    expect(
      await invalidFields(CreateMedicationDto, {
        ...validBody,
        doseAmount: 0.5,
        doseUnit: 'tablet',
        route: 'sublingual',
        startDate: '2000-01-01',
        endDate: '2000-01-01',
        intervalDays: 30,
        times: ['00:00', '23:59'],
        remindersEnabled: true,
        notes: null,
      }),
    ).toEqual([]);
    expect(
      await invalidFields(CreateMedicationDto, {
        ...validBody,
        startDate: addDays(todayInBrazil(), 365),
      }),
    ).toEqual([]);
  });
});

describe('UpdateMedicationDto', () => {
  it('aceita corpo vazio (o caso de uso recusa)', async () => {
    expect(await invalidFields(UpdateMedicationDto, {})).toEqual([]);
  });

  it('aceita endDate nulo para voltar a uso continuo', async () => {
    expect(await invalidFields(UpdateMedicationDto, { endDate: null })).toEqual(
      [],
    );
  });

  it('recusa nulo nos campos obrigatorios', async () => {
    expect(
      (
        await invalidFields(UpdateMedicationDto, {
          name: null,
          doseAmount: null,
          doseUnit: null,
          times: null,
          intervalDays: null,
          startDate: null,
          remindersEnabled: null,
        })
      ).sort(),
    ).toEqual([
      'doseAmount',
      'doseUnit',
      'intervalDays',
      'name',
      'remindersEnabled',
      'startDate',
      'times',
    ]);
  });

  it('nao aceita trocar o paciente', async () => {
    expect(
      await invalidFields(UpdateMedicationDto, { patientId: PATIENT_ID }),
    ).toEqual(['patientId']);
  });
});

describe('ListMedicationsQueryDto', () => {
  it('exige paciente e limita o status', async () => {
    const errors = async (query: Record<string, unknown>) =>
      (
        await validate(
          plainToInstance(ListMedicationsQueryDto, query),
          PIPE_OPTIONS,
        )
      ).map((error) => error.property);

    expect(await errors({})).toEqual(['patientId']);
    expect(await errors({ patientId: PATIENT_ID, status: 'paused' })).toEqual([
      'status',
    ]);
    expect(await errors({ patientId: PATIENT_ID, status: 'inactive' })).toEqual(
      [],
    );
  });
});

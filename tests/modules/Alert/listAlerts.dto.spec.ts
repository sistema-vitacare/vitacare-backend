import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AlertSummaryQueryDto } from '@/modules/Alert/GetAlertSummary/getAlertSummary.dto';
import { ListAlertsQueryDto } from '@/modules/Alert/ListAlerts/listAlerts.dto';

import { PATIENT_ID } from '../Patient/patient.fixtures';

/** Mesmas opcoes do `ValidationPipe` global de `app.setup.ts`. */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

const invalidListFields = async (query: Record<string, unknown>) =>
  (
    await validate(plainToInstance(ListAlertsQueryDto, query), PIPE_OPTIONS)
  ).map((error) => error.property);

const invalidSummaryFields = async (query: Record<string, unknown>) =>
  (
    await validate(plainToInstance(AlertSummaryQueryDto, query), PIPE_OPTIONS)
  ).map((error) => error.property);

describe('ListAlertsQueryDto', () => {
  it('sem patientId lista o alcance inteiro, em ordem recent', async () => {
    const dto = plainToInstance(ListAlertsQueryDto, {});

    expect(await invalidListFields({})).toEqual([]);
    expect(dto.patientId).toBeUndefined();
    expect(dto.sort).toBe('recent');
  });

  it('aceita todos os filtros combinados', async () => {
    expect(
      await invalidListFields({
        patientId: PATIENT_ID.toUpperCase(),
        severity: 'critical',
        status: 'open',
        source: 'medication_reminder',
        sort: 'priority',
        page: '2',
        limit: '50',
      }),
    ).toEqual([]);
    expect(
      plainToInstance(ListAlertsQueryDto, {
        patientId: ` ${PATIENT_ID.toUpperCase()} `,
      }).patientId,
    ).toBe(PATIENT_ID);
  });

  it.each([
    ['patientId', 'nao-e-uuid'],
    ['source', 'manual'],
    ['sort', 'severity'],
    ['severity', 'high'],
    ['status', 'closed'],
  ])('recusa %s invalido', async (field, value) => {
    expect(await invalidListFields({ [field]: value })).toEqual([field]);
  });

  it('recusa parametro desconhecido', async () => {
    expect(await invalidListFields({ from: '2026-11-01' })).toEqual(['from']);
  });
});

describe('AlertSummaryQueryDto', () => {
  it('aceita so paciente e origem, ambos opcionais', async () => {
    expect(await invalidSummaryFields({})).toEqual([]);
    expect(
      await invalidSummaryFields({ patientId: PATIENT_ID, source: 'absence' }),
    ).toEqual([]);
  });

  it.each(['severity', 'status', 'sort', 'page', 'limit'])(
    'recusa %s, que nao se aplica aos contadores',
    async (field) => {
      expect(await invalidSummaryFields({ [field]: '1' })).toEqual([field]);
    },
  );

  it('recusa origem e paciente invalidos', async () => {
    expect(
      await invalidSummaryFields({ patientId: 'x', source: 'manual' }),
    ).toEqual(['patientId', 'source']);
  });
});

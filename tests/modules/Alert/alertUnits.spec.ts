import { ProfileCode } from '@/common/context/requestContext.type';
import { AlertSweepProcessor } from '@/modules/Alert/EvaluateFollowUpAlerts/alertSweep.processor';
import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { toAlertResponse } from '@/modules/Alert/parsers/alert.parser';
import {
  toAlertRulePatch,
  toAlertRuleResponse,
} from '@/modules/Alert/parsers/alertRule.parser';
import { alertMessage } from '@/modules/Alert/policies/alertMessage.policy';
import type { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
import type { AlertMatch } from '@/modules/Alert/types/alert.types';

import { sessionOf } from '../Patient/patient.fixtures';
import { alertRow, ruleRow } from './alert.fixtures';

const match = (overrides: Partial<AlertMatch> = {}): AlertMatch => ({
  ruleId: 'r',
  ruleName: 'Regra',
  severity: 'warning',
  operator: 'gt',
  referenceValue: '180.000',
  responseItemId: 'i',
  fieldKey: 'k',
  fieldName: 'Glicemia capilar',
  fieldUnit: 'mg/dL',
  value: '250',
  ...overrides,
});

describe('alertMessage', () => {
  it.each([
    ['gt', 'maior que'],
    ['gte', 'maior ou igual a'],
    ['lt', 'menor que'],
    ['lte', 'menor ou igual a'],
  ] as const)('descreve %s sem interpretacao clinica', (operator, label) => {
    expect(alertMessage(match({ operator }))).toBe(
      `Glicemia capilar: 250 mg/dL (${label} 180 mg/dL).`,
    );
  });

  it('referencia decimal sem zeros finais e campo sem unidade', () => {
    expect(
      alertMessage(
        match({
          fieldName: 'Dor',
          fieldUnit: null,
          value: '0',
          operator: 'lte',
          referenceValue: '0.500',
        }),
      ),
    ).toBe('Dor: 0 (menor ou igual a 0.5).');
    expect(alertMessage(match({ referenceValue: '-10.000' }))).toContain(
      'maior que -10 mg/dL',
    );
  });
});

describe('parsers de regra e alerta', () => {
  const ctx = sessionOf(ProfileCode.PROFESSIONAL);

  it('PATCH leva so os campos enviados; null limpa a descricao', () => {
    expect(toAlertRulePatch({ description: null, referenceValue: 0 })).toEqual({
      description: null,
      referenceValue: 0,
    });
    expect(toAlertRulePatch({})).toEqual({});
  });

  it('regra inativa expoe deactivatedAt', () => {
    const deletedAt = new Date('2026-11-05T13:00:00.000Z');

    expect(
      toAlertRuleResponse(ruleRow({ status: 'inactive', deletedAt }), ctx),
    ).toMatchObject({
      status: 'inactive',
      deactivatedAt: '2026-11-05T13:00:00.000Z',
    });
  });

  it('alerta expoe a copia do disparo e o estado do registro de origem', () => {
    expect(
      toAlertResponse(
        alertRow({
          followUp: {
            id: 'f',
            visitedAt: new Date('2026-11-05T11:00:00.000Z'),
            status: 'annulled',
          },
        }),
        ctx,
      ),
    ).toMatchObject({
      value: '250',
      operator: 'gt',
      referenceValue: 180,
      followUp: { status: 'annulled', visitedAt: '2026-11-05T11:00:00.000Z' },
      generatedAt: '2026-11-05T12:01:00.000Z',
      absence: null,
      medicationReminder: null,
    });
  });

  const scheduled = {
    rule: null,
    followUp: null,
    field: null,
    value: null,
    operator: null,
    referenceValue: null,
  };

  it('ausencia expoe formulario, ultimo envio, prazo e frequencia', () => {
    expect(
      toAlertResponse(
        alertRow({
          ...scheduled,
          source: 'absence',
          absence: {
            form: { id: 'form', name: 'Sinais vitais' },
            since: new Date('2026-11-04T12:00:00.000Z'),
            dueAt: new Date('2026-11-05T12:00:00.000Z'),
            frequency: { interval: 1, unit: 'days' },
          },
        }),
        ctx,
      ),
    ).toMatchObject({
      source: 'absence',
      rule: null,
      followUp: null,
      field: null,
      value: null,
      operator: null,
      referenceValue: null,
      medicationReminder: null,
      absence: {
        form: { id: 'form', name: 'Sinais vitais' },
        since: '2026-11-04T12:00:00.000Z',
        dueAt: '2026-11-05T12:00:00.000Z',
        frequency: { interval: 1, unit: 'days' },
      },
    });
  });

  it('lembrete expoe medicamento, linha da agenda e horario programado', () => {
    expect(
      toAlertResponse(
        alertRow({
          ...scheduled,
          source: 'medication_reminder',
          medicationReminder: {
            medication: { id: 'med', name: 'Losartana' },
            reminderId: 'rem',
            scheduledAt: new Date('2026-11-05T11:00:00.000Z'),
          },
        }),
        ctx,
      ),
    ).toMatchObject({
      source: 'medication_reminder',
      absence: null,
      medicationReminder: {
        medication: { id: 'med', name: 'Losartana' },
        reminderId: 'rem',
        scheduledAt: '2026-11-05T11:00:00.000Z',
      },
    });
  });
});

describe('EvaluateFollowUpAlertsUseCase', () => {
  const repository = { evaluateRecord: jest.fn() };
  const useCase = new EvaluateFollowUpAlertsUseCase(
    repository as unknown as AlertRepository,
  );

  beforeEach(() => jest.resetAllMocks());

  it('avalia o registro na organizacao informada', async () => {
    repository.evaluateRecord.mockResolvedValue({
      kind: 'evaluated',
      alerts: 2,
    });

    await expect(useCase.execute('org', 'rec')).resolves.toEqual({
      kind: 'evaluated',
      alerts: 2,
    });
    expect(repository.evaluateRecord).toHaveBeenCalledWith('org', 'rec');
  });

  it('falha logo apos o envio nao chega a quem registrou', async () => {
    repository.evaluateRecord.mockRejectedValue(new Error('banco fora'));
    const log = jest
      .spyOn(
        (useCase as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(useCase.afterSubmit('org', 'rec')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('rec'),
      expect.stringContaining('banco fora'),
    );
  });
});

describe('AlertSweepProcessor', () => {
  const repository = {
    findPendingRecords: jest.fn(),
    markEvaluationFailed: jest.fn(),
  };
  const evaluator = { execute: jest.fn() };
  const queue = { on: jest.fn(), upsertJobScheduler: jest.fn() };
  const processor = new AlertSweepProcessor(
    queue as never,
    repository as unknown as AlertRepository,
    evaluator as unknown as EvaluateFollowUpAlertsUseCase,
  );
  const logger = (processor as unknown as { logger: Record<string, jest.Mock> })
    .logger;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  it('conta avaliados, ja avaliados e falhas; a falha adia o registro', async () => {
    repository.findPendingRecords.mockResolvedValue([
      { organizationId: 'o', id: 'a' },
      { organizationId: 'o', id: 'b' },
      { organizationId: 'o', id: 'c' },
    ]);
    repository.markEvaluationFailed.mockResolvedValue(undefined);
    evaluator.execute
      .mockResolvedValueOnce({ kind: 'evaluated', alerts: 1 })
      .mockResolvedValueOnce({ kind: 'skipped' })
      .mockRejectedValueOnce(new Error('falha'));

    await expect(processor.process()).resolves.toEqual({
      evaluated: 1,
      skipped: 1,
      failed: 1,
    });
    expect(repository.markEvaluationFailed).toHaveBeenCalledWith('o', 'c');
  });

  it('agendamento sem Redis so loga; erro de conexao repetido loga uma vez por minuto', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(() => processor.onApplicationBootstrap()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledWith(
      'Nao foi possivel agendar a varredura de alertas.',
      expect.stringContaining('ECONNREFUSED'),
    );

    processor.onWorkerError(new Error('ECONNREFUSED'));
    processor.onWorkerError(new Error('ECONNREFUSED'));

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

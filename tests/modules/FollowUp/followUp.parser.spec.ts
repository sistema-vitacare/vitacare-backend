import { ProfileCode } from '@/common/context/requestContext.type';
import {
  toAnswerValue,
  toFollowUpResponse,
} from '@/modules/FollowUp/parsers/followUp.parser';

import { sessionOf } from '../Patient/patient.fixtures';
import { followUpDetail } from './followUp.fixtures';

describe('toAnswerValue', () => {
  it('devolve cada tipo a partir do texto canonico', () => {
    expect(toAnswerValue('number', '0')).toBe(0);
    expect(toAnswerValue('number', '36.5')).toBe(36.5);
    expect(toAnswerValue('scale', '-2')).toBe(-2);
    expect(toAnswerValue('boolean', 'false')).toBe(false);
    expect(toAnswerValue('boolean', 'true')).toBe(true);
    expect(toAnswerValue('text', 'Sem queixas')).toBe('Sem queixas');
    expect(toAnswerValue('single_choice', 'Calmo')).toBe('Calmo');
    expect(toAnswerValue('multiple_choice', '["Calmo","Triste"]')).toEqual([
      'Calmo',
      'Triste',
    ]);
  });
});

describe('toFollowUpResponse', () => {
  const ctx = sessionOf(ProfileCode.FAMILY);

  it('monta o registro valido sem anulacao', () => {
    expect(toFollowUpResponse(followUpDetail(), ctx)).toEqual({
      id: followUpDetail().id,
      patientId: followUpDetail().patientId,
      form: {
        id: followUpDetail().formId,
        name: 'Acompanhamento Geral',
        versionId: followUpDetail().formVersionId,
        versionNumber: 1,
      },
      author: followUpDetail().author,
      visitedAt: '2026-11-04T12:30:00.000Z',
      submittedAt: '2026-11-04T12:40:00.000Z',
      notes: 'Paciente relatou melhora na mobilidade.',
      status: 'valid',
      annulment: null,
      answers: [
        {
          fieldId: followUpDetail().answers[0].fieldId,
          fieldKey: followUpDetail().answers[0].fieldKey,
          name: 'Glicemia capilar',
          fieldType: 'number',
          unit: 'mg/dL',
          section: 'Sinais vitais',
          position: 0,
          value: 324,
        },
      ],
    });
  });

  it('expoe quem anulou, quando e por que', () => {
    const annulledBy = {
      id: 'f0000000-0000-4000-8000-000000000001',
      name: 'Dra. Ana',
    };

    expect(
      toFollowUpResponse(
        followUpDetail({
          status: 'annulled',
          annulledAt: new Date('2026-11-04T13:00:00.000Z'),
          annulledBy,
          annulmentReason: 'Valor digitado errado.',
        }),
        ctx,
      ).annulment,
    ).toEqual({
      annulledAt: '2026-11-04T13:00:00.000Z',
      annulledBy,
      reason: 'Valor digitado errado.',
    });
  });
});

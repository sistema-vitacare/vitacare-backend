import {
  formatBrazilDateTime,
  planExpiryNoticeMilestone,
  planExpiryNoticeValidUntil,
  planExpirySchedule,
  planExpiryWarning,
  planExpiryWarningMessage,
} from '@/modules/Plan/policies/planExpiry.policy';

/** Brasilia esta em UTC-3 desde 2019: 08:00 local = 11:00Z. */
const at = (iso: string) => new Date(iso);

describe('planExpiry.policy (BE-28)', () => {
  // 20/11/2026 23:59 em Brasilia.
  const endsAt = at('2026-11-21T02:59:00.000Z');

  describe('planExpirySchedule', () => {
    it('marca 08:00 de Brasilia sete dias e um dia antes da data de fim e a primeira 08:00 depois do fim', () => {
      expect(planExpirySchedule(endsAt)).toEqual({
        sevenDays: at('2026-11-13T11:00:00.000Z'),
        oneDay: at('2026-11-19T11:00:00.000Z'),
        expired: at('2026-11-21T11:00:00.000Z'),
      });
    });

    it('fim a 00:00 local: o aviso de vencimento sai as 08:00 do mesmo dia', () => {
      expect(planExpirySchedule(at('2026-11-20T03:00:00.000Z'))).toEqual({
        sevenDays: at('2026-11-13T11:00:00.000Z'),
        oneDay: at('2026-11-19T11:00:00.000Z'),
        expired: at('2026-11-20T11:00:00.000Z'),
      });
    });

    it('fim exatamente as 08:00 local: o aviso de vencimento e o proprio fim', () => {
      const eight = at('2026-11-20T11:00:00.000Z');

      expect(planExpirySchedule(eight).expired).toEqual(eight);
    });
  });

  describe('planExpiryNoticeMilestone', () => {
    it.each([
      ['2026-11-12T11:00:00.000Z', null],
      ['2026-11-13T11:00:00.000Z', 'seven_days'],
      ['2026-11-18T11:00:00.000Z', 'seven_days'],
      ['2026-11-19T11:00:00.000Z', 'one_day'],
      ['2026-11-20T11:00:00.000Z', 'one_day'],
      ['2026-11-21T11:00:00.000Z', 'expired'],
      ['2026-12-30T11:00:00.000Z', 'expired'],
    ])('na referencia %s o marco vigente e %s', (reference, milestone) => {
      expect(planExpiryNoticeMilestone(endsAt, at(reference))).toBe(milestone);
    });

    it('queda longa: so o marco mais recente que ainda vale, nunca o de 7 dias depois do de 1 dia', () => {
      expect(
        planExpiryNoticeMilestone(endsAt, at('2026-11-19T11:00:00.000Z')),
      ).toBe('one_day');
    });

    it('o de 1 dia deixa de valer no fim; entre o fim e a 08:00 seguinte nao ha marco', () => {
      // Fim 20/11 05:00 local; referencia 19/11 08:00 ainda e o de 1 dia.
      const early = at('2026-11-20T08:00:00.000Z');

      expect(
        planExpiryNoticeMilestone(early, at('2026-11-19T11:00:00.000Z')),
      ).toBe('one_day');
      expect(
        planExpiryNoticeMilestone(early, at('2026-11-20T09:00:00.000Z')),
      ).toBeNull();
      expect(
        planExpiryNoticeMilestone(early, at('2026-11-20T11:00:00.000Z')),
      ).toBe('expired');
    });
  });

  describe('planExpiryNoticeValidUntil', () => {
    it('7 dias vale ate o marco de 1 dia, 1 dia ate o fim e o vencimento ate a renovacao', () => {
      expect(planExpiryNoticeValidUntil(endsAt, 'seven_days')).toEqual(
        at('2026-11-19T11:00:00.000Z'),
      );
      expect(planExpiryNoticeValidUntil(endsAt, 'one_day')).toEqual(endsAt);
      expect(planExpiryNoticeValidUntil(endsAt, 'expired')).toBeNull();
    });
  });

  describe('planExpiryWarning', () => {
    it.each([
      ['2026-11-13T10:59:59.000Z', null],
      ['2026-11-13T11:00:00.000Z', 'within_7_days'],
      ['2026-11-19T10:59:59.000Z', 'within_7_days'],
      ['2026-11-19T11:00:00.000Z', 'within_1_day'],
      ['2026-11-21T02:58:59.000Z', 'within_1_day'],
      ['2026-11-21T02:59:00.000Z', 'expired'],
    ])('em %s o aviso e %s', (now, warning) => {
      expect(planExpiryWarning(endsAt, at(now))).toBe(warning);
    });

    it('termo sem data de fim nao tem aviso', () => {
      expect(
        planExpiryWarning(null, at('2026-11-20T00:00:00.000Z')),
      ).toBeNull();
    });
  });

  describe('planExpiryWarningMessage', () => {
    it('antes do fim diz quando vence e como renovar', () => {
      expect(planExpiryWarningMessage('within_7_days', endsAt)).toBe(
        'O plano vence em 20/11/2026 às 23:59 (horário de Brasília). Depois disso, novos cadastros e reativações de usuários e pacientes ficam bloqueados até a renovação. Solicite a renovação na área de plano.',
      );
    });

    it('vencido diz o que esta bloqueado e o que continua', () => {
      expect(planExpiryWarningMessage('expired', endsAt)).toContain(
        'O plano venceu em 20/11/2026 às 23:59',
      );
      expect(planExpiryWarningMessage('expired', endsAt)).toContain(
        'a consulta e os registros continuam',
      );
    });

    it('sem aviso, sem mensagem', () => {
      expect(planExpiryWarningMessage(null, endsAt)).toBeNull();
      expect(planExpiryWarningMessage(null, null)).toBeNull();
    });
  });

  it('formata data e hora de Brasilia', () => {
    expect(formatBrazilDateTime(endsAt)).toBe('20/11/2026 às 23:59');
  });
});

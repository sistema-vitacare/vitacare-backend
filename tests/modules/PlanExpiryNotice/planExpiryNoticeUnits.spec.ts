import { planExpiryEmail } from '@/modules/PlanExpiryNotice/policies/planExpiryEmail.policy';
import { noticeReference } from '@/modules/PlanExpiryNotice/policies/noticeSchedule.policy';

const at = (iso: string) => new Date(iso);

describe('noticeReference (BE-28)', () => {
  it.each([
    ['2026-11-20T13:00:00.000Z', '2026-11-20T11:00:00.000Z'],
    ['2026-11-20T11:00:00.000Z', '2026-11-20T11:00:00.000Z'],
    // Disparo alguns instantes antes das 08:00 ainda conta como o de hoje.
    ['2026-11-20T10:57:00.000Z', '2026-11-20T11:00:00.000Z'],
    ['2026-11-20T10:50:00.000Z', '2026-11-19T11:00:00.000Z'],
    ['2026-11-20T02:00:00.000Z', '2026-11-19T11:00:00.000Z'],
  ])('em %s a referencia e a 08:00 de Brasilia %s', (now, reference) => {
    expect(noticeReference(at(now))).toEqual(at(reference));
  });
});

describe('planExpiryEmail (BE-28)', () => {
  // 20/11/2026 23:59 em Brasilia.
  const termEndsAt = at('2026-11-21T02:59:00.000Z');
  const base = {
    termEndsAt,
    organizationName: 'Clinica Exemplo',
    planName: 'Basic',
    appUrl: 'https://app.example.com',
  };

  it('7 dias: diz quando vence, o que acontece e como renovar', () => {
    const email = planExpiryEmail({
      ...base,
      milestone: 'seven_days',
      now: at('2026-11-13T11:00:00.000Z'),
    });

    expect(email.subject).toBe(
      'VitaCare: o plano da organização vence em 7 dias',
    );
    expect(email.text).toContain(
      'O plano Basic da organização Clinica Exemplo vence em 20/11/2026 às 23:59 (horário de Brasília).',
    );
    expect(email.text).toContain(
      'No vencimento, a organização deixa de cadastrar e de reativar usuários e pacientes.',
    );
    expect(email.text).toContain('continuam funcionando');
    expect(email.text).toContain('solicitação de mudança de plano');
    expect(email.text).toContain('https://app.example.com');
  });

  it('1 dia: vence amanha; enviado na data de fim, vence hoje', () => {
    expect(
      planExpiryEmail({
        ...base,
        milestone: 'one_day',
        now: at('2026-11-19T11:00:00.000Z'),
      }).subject,
    ).toBe('VitaCare: o plano da organização vence amanhã');
    expect(
      planExpiryEmail({
        ...base,
        milestone: 'one_day',
        now: at('2026-11-20T15:00:00.000Z'),
      }).subject,
    ).toBe('VitaCare: o plano da organização vence hoje');
  });

  it('vencido: diz o que ficou bloqueado ate a renovacao', () => {
    const email = planExpiryEmail({
      ...base,
      milestone: 'expired',
      now: at('2026-11-21T11:00:00.000Z'),
    });

    expect(email.subject).toBe('VitaCare: o plano da organização venceu');
    expect(email.text).toContain('venceu em 20/11/2026 às 23:59');
    expect(email.text).toContain(
      'Até a renovação, a organização não consegue cadastrar nem reativar usuários e pacientes.',
    );
  });

  it('sem endereco da aplicacao, sem link', () => {
    const email = planExpiryEmail({
      ...base,
      appUrl: undefined,
      milestone: 'expired',
      now: at('2026-11-21T11:00:00.000Z'),
    });

    expect(email.text).not.toContain('http');
  });
});

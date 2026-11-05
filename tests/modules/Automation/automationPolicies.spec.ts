import {
  absenceDueDates,
  reminderOccurrences,
} from '@/modules/Automation/policies/scheduledOccurrences.policy';
import {
  absenceMessage,
  reminderMessage,
} from '@/modules/Automation/policies/scheduledAlertMessage.policy';

const at = (iso: string) => new Date(iso);
const isoOf = (dates: Date[]) => dates.map((date) => date.toISOString());

describe('absenceDueDates', () => {
  // 05/11/2026 09:00 em Brasilia (UTC-3).
  const anchor = at('2026-11-05T12:00:00.000Z');

  it('um dia cai no mesmo horario local do dia seguinte', () => {
    expect(
      isoOf(
        absenceDueDates(
          anchor,
          { interval: 1, unit: 'days' },
          anchor,
          at('2026-11-07T12:00:00.000Z'),
          50,
        ),
      ),
    ).toEqual(['2026-11-06T12:00:00.000Z', '2026-11-07T12:00:00.000Z']);
  });

  it('seis horas dao quatro prazos em vinte e quatro horas', () => {
    expect(
      absenceDueDates(
        anchor,
        { interval: 6, unit: 'hours' },
        anchor,
        at('2026-11-06T12:00:00.000Z'),
        50,
      ),
    ).toHaveLength(4);
  });

  it('semana soma sete dias locais e preserva os segundos da ancora', () => {
    expect(
      isoOf(
        absenceDueDates(
          at('2026-11-05T12:00:07.250Z'),
          { interval: 2, unit: 'weeks' },
          anchor,
          at('2026-12-31T00:00:00.000Z'),
          50,
        ),
      ),
    ).toEqual([
      '2026-11-19T12:00:07.250Z',
      '2026-12-03T12:00:07.250Z',
      '2026-12-17T12:00:07.250Z',
    ]);
  });

  it('exclui o inicio da janela e inclui o fim', () => {
    expect(
      isoOf(
        absenceDueDates(
          anchor,
          { interval: 1, unit: 'days' },
          at('2026-11-06T12:00:00.000Z'),
          at('2026-11-08T12:00:00.000Z'),
          50,
        ),
      ),
    ).toEqual(['2026-11-07T12:00:00.000Z', '2026-11-08T12:00:00.000Z']);
  });

  it('respeita o limite e devolve os mais antigos', () => {
    const dates = absenceDueDates(
      anchor,
      { interval: 1, unit: 'hours' },
      anchor,
      at('2026-11-08T12:00:00.000Z'),
      50,
    );

    expect(dates).toHaveLength(50);
    expect(dates[0].toISOString()).toBe('2026-11-05T13:00:00.000Z');
  });

  it('nada vence antes do primeiro periodo', () => {
    expect(
      absenceDueDates(
        anchor,
        { interval: 1, unit: 'days' },
        anchor,
        at('2026-11-06T11:59:59.999Z'),
        50,
      ),
    ).toEqual([]);
  });
});

describe('reminderOccurrences', () => {
  const schedule = {
    startDate: '2026-11-01',
    endDate: '2026-11-07',
    intervalDays: 2,
    times: ['08:00'],
  };

  it('repete a cada dois dias a partir do inicio, no horario local', () => {
    expect(
      isoOf(
        reminderOccurrences(
          schedule,
          at('2026-11-01T00:00:00.000Z'),
          at('2026-11-06T00:00:00.000Z'),
          50,
        ),
      ),
    ).toEqual([
      '2026-11-01T11:00:00.000Z',
      '2026-11-03T11:00:00.000Z',
      '2026-11-05T11:00:00.000Z',
    ]);
  });

  it('para no fim da agenda', () => {
    expect(
      isoOf(
        reminderOccurrences(
          schedule,
          at('2026-11-06T00:00:00.000Z'),
          at('2026-11-30T00:00:00.000Z'),
          50,
        ),
      ),
    ).toEqual(['2026-11-07T11:00:00.000Z']);
  });

  it('exclui o cursor, inclui o agora e respeita o limite', () => {
    const daily = { ...schedule, endDate: null, intervalDays: 1 };

    expect(
      isoOf(
        reminderOccurrences(
          daily,
          at('2026-11-01T11:00:00.000Z'),
          at('2026-11-02T11:00:00.000Z'),
          50,
        ),
      ),
    ).toEqual(['2026-11-02T11:00:00.000Z']);
    expect(
      reminderOccurrences(
        daily,
        at('2026-11-01T00:00:00.000Z'),
        at('2027-11-01T00:00:00.000Z'),
        50,
      ),
    ).toHaveLength(50);
  });
});

describe('mensagens', () => {
  it('ausencia diz o formulario, o ultimo envio e a frequencia', () => {
    expect(
      absenceMessage({
        formName: 'Acompanhamento Geral',
        since: at('2026-11-05T12:00:00.000Z'),
        frequency: { interval: 1, unit: 'days' },
      }),
    ).toBe(
      'Sem registro de Acompanhamento Geral desde 05/11/2026 09:00; esperado a cada 1 dia.',
    );
    expect(
      absenceMessage({
        formName: 'Sinais vitais',
        since: at('2026-11-05T12:00:00.000Z'),
        frequency: { interval: 6, unit: 'hours' },
      }),
    ).toBe(
      'Sem registro de Sinais vitais desde 05/11/2026 09:00; esperado a cada 6 horas.',
    );
    expect(
      absenceMessage({
        formName: 'Escala',
        since: at('2026-11-05T12:00:00.000Z'),
        frequency: { interval: 2, unit: 'weeks' },
      }),
    ).toMatch(/a cada 2 semanas\.$/);
  });

  it('lembrete diz o medicamento, a dose e o horario local', () => {
    expect(
      reminderMessage({
        medicationName: 'Losartana',
        doseAmount: '50.000',
        doseUnit: 'mg',
        scheduledAt: at('2026-11-05T11:00:00.000Z'),
      }),
    ).toBe('Losartana 50 mg às 08:00.');
    expect(
      reminderMessage({
        medicationName: 'Dipirona',
        doseAmount: '20.000',
        doseUnit: 'drops',
        scheduledAt: at('2026-11-05T23:30:00.000Z'),
      }),
    ).toBe('Dipirona 20 gotas às 20:30.');
    expect(
      reminderMessage({
        medicationName: 'Metformina',
        doseAmount: '0.500',
        doseUnit: 'tablet',
        scheduledAt: at('2026-11-05T11:00:00.000Z'),
      }),
    ).toBe('Metformina 0.5 comprimido às 08:00.');
    expect(
      reminderMessage({
        medicationName: 'Vitamina D',
        doseAmount: '1000',
        doseUnit: 'iu',
        scheduledAt: at('2026-11-05T11:00:00.000Z'),
      }),
    ).toBe('Vitamina D 1000 UI às 08:00.');
  });
});

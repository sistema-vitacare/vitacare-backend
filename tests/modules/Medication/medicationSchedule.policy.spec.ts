import {
  brazilLocalToInstant,
  findScheduleConflicts,
  isSameSchedule,
  nextOccurrence,
  todayInBrazil,
} from '@/modules/Medication/policies/medicationSchedule.policy';
import type { MedicationSchedule } from '@/modules/Medication/types/medication.types';

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

describe('todayInBrazil', () => {
  it('usa o dia local de Brasilia, nao o de UTC', () => {
    expect(todayInBrazil(new Date('2026-11-06T02:00:00Z'))).toBe('2026-11-05');
    expect(todayInBrazil(new Date('2026-11-06T03:00:00Z'))).toBe('2026-11-06');
  });
});

describe('brazilLocalToInstant', () => {
  it('08:00 em Brasilia = 11:00Z', () => {
    expect(iso(brazilLocalToInstant('2026-11-05', '08:00'))).toBe(
      '2026-11-05T11:00:00.000Z',
    );
  });

  it('23:30 cai no dia seguinte em UTC', () => {
    expect(iso(brazilLocalToInstant('2026-11-05', '23:30'))).toBe(
      '2026-11-06T02:30:00.000Z',
    );
  });

  it('respeita o horario de verao historico (-02:00 em jan/2018)', () => {
    expect(iso(brazilLocalToInstant('2018-01-15', '08:00'))).toBe(
      '2018-01-15T10:00:00.000Z',
    );
  });
});

describe('nextOccurrence', () => {
  const daily: MedicationSchedule = {
    startDate: '2026-11-01',
    endDate: null,
    intervalDays: 1,
    times: ['08:00', '20:00'],
  };

  it('proximo horario do mesmo dia', () => {
    expect(iso(nextOccurrence(daily, new Date('2026-11-05T12:00:00Z')))).toBe(
      '2026-11-05T23:00:00.000Z',
    );
  });

  it('horario ja passado vai para o dia seguinte', () => {
    expect(iso(nextOccurrence(daily, new Date('2026-11-05T23:30:00Z')))).toBe(
      '2026-11-06T11:00:00.000Z',
    );
  });

  it('respeita o intervalo em dias a partir do inicio', () => {
    // inicio 01/11, a cada 2 dias: 01, 03, 05, 07.
    const everyOther = { ...daily, intervalDays: 2, times: ['08:00'] };

    expect(
      iso(nextOccurrence(everyOther, new Date('2026-11-06T00:00:00Z'))),
    ).toBe('2026-11-07T11:00:00.000Z');
  });

  it('inicio no futuro comeca no inicio', () => {
    expect(
      iso(
        nextOccurrence(
          { ...daily, startDate: '2026-12-01' },
          new Date('2026-11-05T12:00:00Z'),
        ),
      ),
    ).toBe('2026-12-01T11:00:00.000Z');
  });

  it('fim no passado nao tem proxima ocorrencia', () => {
    expect(
      nextOccurrence(
        { ...daily, endDate: '2026-11-04' },
        new Date('2026-11-05T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('ultimo horario do dia final e estritamente depois de agora', () => {
    const ending = { ...daily, endDate: '2026-11-05' };

    expect(iso(nextOccurrence(ending, new Date('2026-11-05T12:00:00Z')))).toBe(
      '2026-11-05T23:00:00.000Z',
    );
    expect(nextOccurrence(ending, new Date('2026-11-05T23:00:00Z'))).toBeNull();
  });

  it('agenda sem horarios nao tem proxima ocorrencia (sem laco infinito)', () => {
    expect(
      nextOccurrence({ ...daily, times: [] }, new Date('2026-11-05T12:00:00Z')),
    ).toBeNull();
  });

  it('agenda sem inicio valido nao tem proxima ocorrencia', () => {
    expect(
      nextOccurrence(
        { ...daily, startDate: null as unknown as string },
        new Date('2026-11-05T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('dia alinhado depois do fim nao conta', () => {
    const sparse = {
      ...daily,
      intervalDays: 7,
      endDate: '2026-11-07',
      times: ['08:00'],
    };

    expect(nextOccurrence(sparse, new Date('2026-11-02T12:00:00Z'))).toBeNull();
  });
});

describe('findScheduleConflicts', () => {
  const base: MedicationSchedule = {
    startDate: '2026-11-01',
    endDate: null,
    intervalDays: 1,
    times: ['08:00', '20:00'],
  };
  const today = '2026-11-05';
  const other = (schedule: Partial<MedicationSchedule>, id = 'b') => ({
    id,
    name: 'Metformina',
    schedule: { ...base, ...schedule },
  });

  it('mesmo horario em medicamentos diarios', () => {
    expect(
      findScheduleConflicts(base, [other({ times: ['20:00'] })], today),
    ).toEqual([
      { medicationId: 'b', medicationName: 'Metformina', time: '20:00' },
    ]);
  });

  it('horario diferente nao conflita', () => {
    expect(
      findScheduleConflicts(base, [other({ times: ['20:01'] })], today),
    ).toEqual([]);
  });

  it('intervalos de 2 dias com paridades opostas nunca coincidem', () => {
    expect(
      findScheduleConflicts(
        { ...base, intervalDays: 2 },
        [other({ startDate: '2026-11-02', intervalDays: 2 })],
        today,
      ),
    ).toEqual([]);
  });

  it('intervalos de 2 e 3 dias coincidem em algum dia', () => {
    expect(
      findScheduleConflicts(
        { ...base, intervalDays: 2 },
        [other({ startDate: '2026-11-02', intervalDays: 3 })],
        today,
      ),
    ).toHaveLength(2);
  });

  it('tratamento ja encerrado nao conflita', () => {
    expect(
      findScheduleConflicts(base, [other({ endDate: '2026-11-04' })], today),
    ).toEqual([]);
  });

  it('periodos sem dia comum nao conflitam', () => {
    expect(
      findScheduleConflicts(
        { ...base, endDate: '2026-11-10' },
        [other({ startDate: '2026-11-11' })],
        today,
      ),
    ).toEqual([]);
  });

  it('semanais em dias diferentes nunca coincidem', () => {
    // A: 05, 12, 19...; B: 06, 13, 20... (semanais, nunca no mesmo dia).
    expect(
      findScheduleConflicts(
        { ...base, startDate: '2026-11-05', intervalDays: 7 },
        [other({ startDate: '2026-11-06', intervalDays: 7 })],
        today,
      ),
    ).toEqual([]);
  });

  it('ordena por horario e depois por nome', () => {
    expect(
      findScheduleConflicts(
        base,
        [
          { id: 'c', name: 'Sinvastatina', schedule: { ...base } },
          {
            id: 'b',
            name: 'Anlodipino',
            schedule: { ...base, times: ['20:00'] },
          },
        ],
        today,
      ),
    ).toEqual([
      { medicationId: 'c', medicationName: 'Sinvastatina', time: '08:00' },
      { medicationId: 'b', medicationName: 'Anlodipino', time: '20:00' },
      { medicationId: 'c', medicationName: 'Sinvastatina', time: '20:00' },
    ]);
  });
});

describe('isSameSchedule', () => {
  const schedule: MedicationSchedule = {
    startDate: '2026-11-01',
    endDate: null,
    intervalDays: 1,
    times: ['08:00', '20:00'],
  };

  it('ignora a ordem dos horarios', () => {
    expect(
      isSameSchedule(schedule, { ...schedule, times: ['20:00', '08:00'] }),
    ).toBe(true);
  });

  it('fim diferente e outra agenda', () => {
    expect(
      isSameSchedule(schedule, { ...schedule, endDate: '2026-12-01' }),
    ).toBe(false);
  });
});

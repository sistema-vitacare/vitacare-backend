import {
  fillDays,
  periodDays,
  previousPeriod,
} from '@/modules/Dashboard/policies/dashboardPeriod.policy';

describe('periodo do painel', () => {
  it('o anterior tem o mesmo tamanho e termina na vespera', () => {
    expect(previousPeriod({ from: '2026-10-01', to: '2026-10-30' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-01' })).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  it('lista cada dia do periodo, inclusive', () => {
    expect(periodDays({ from: '2026-10-30', to: '2026-11-01' })).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('preenche com zero os dias sem contagem e ignora o que esta fora', () => {
    expect(
      fillDays({ from: '2026-10-30', to: '2026-11-01' }, [
        { date: '2026-11-01', total: 4 },
        { date: '2026-10-30', total: 2 },
        { date: '2026-11-02', total: 9 },
      ]),
    ).toEqual([
      { date: '2026-10-30', total: 2 },
      { date: '2026-10-31', total: 0 },
      { date: '2026-11-01', total: 4 },
    ]);
  });
});

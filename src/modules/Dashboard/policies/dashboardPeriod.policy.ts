import type { DashboardPeriod, DayCount } from '../types/dashboard.types';

const DAY_MS = 86_400_000;

const toDay = (date: string): number =>
  Date.parse(`${date}T00:00:00.000Z`) / DAY_MS;

const fromDay = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Os mesmos `n` dias imediatamente antes de `from` (variacao da Figura 33). */
export const previousPeriod = ({
  from,
  to,
}: DashboardPeriod): DashboardPeriod => {
  const length = toDay(to) - toDay(from) + 1;

  return {
    from: fromDay(toDay(from) - length),
    to: fromDay(toDay(from) - 1),
  };
};

export const periodDays = ({ from, to }: DashboardPeriod): string[] => {
  const days: string[] = [];

  for (let day = toDay(from); day <= toDay(to); day += 1) {
    days.push(fromDay(day));
  }

  return days;
};

/** Todo dia do periodo aparece, com zero onde nada foi contado. */
export const fillDays = (
  period: DashboardPeriod,
  rows: DayCount[],
): DayCount[] => {
  const totals = new Map(rows.map((row) => [row.date, row.total]));

  return periodDays(period).map((date) => ({
    date,
    total: totals.get(date) ?? 0,
  }));
};

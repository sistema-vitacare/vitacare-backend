import {
  MEDICATION_TIME_ZONE,
  type MedicationSchedule,
  type ScheduleConflict,
} from '../types/medication.types';

const DAY_MS = 86_400_000;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MEDICATION_TIME_ZONE,
});

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MEDICATION_TIME_ZONE,
  timeZoneName: 'longOffset',
});

/** `YYYY-MM-DD` -> dias desde 1970-01-01 (calendario puro, sem fuso). */
const toDay = (date: string): number =>
  Date.parse(`${date}T00:00:00.000Z`) / DAY_MS;

const fromDay = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

const minutesOf = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Deslocamento do fuso no instante, em minutos (`GMT-03:00` -> -180). */
const offsetMinutes = (instant: number): number => {
  const name =
    offsetFormatter
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);

  if (!match) return 0;

  const minutes = Number(match[2]) * 60 + Number(match[3]);

  return match[1] === '-' ? -minutes : minutes;
};

const mod = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Hoje no fuso da agenda, como `YYYY-MM-DD`. */
export const todayInBrazil = (now: Date = new Date()): string =>
  dateFormatter.format(now);

/**
 * Data e hora locais de Brasilia -> instante UTC. O deslocamento e relido no
 * instante corrigido para acertar dias de troca de horario de verao.
 */
export const brazilLocalToInstant = (date: string, time: string): Date => {
  const wallClock = toDay(date) * DAY_MS + minutesOf(time) * 60_000;
  const guess = wallClock - offsetMinutes(wallClock) * 60_000;

  return new Date(wallClock - offsetMinutes(guess) * 60_000);
};

/** Primeiro dia da agenda em ou depois de `day`, ou `null` se passou do fim. */
const firstScheduledDayFrom = (
  schedule: MedicationSchedule,
  day: number,
): number | null => {
  const start = toDay(schedule.startDate);
  const from = Math.max(start, day);
  const aligned =
    from +
    mod(
      schedule.intervalDays - mod(from - start, schedule.intervalDays),
      schedule.intervalDays,
    );

  return schedule.endDate !== null && aligned > toDay(schedule.endDate)
    ? null
    : aligned;
};

/** Proxima ocorrencia estritamente depois de `now`; `null` se a agenda acabou. */
export const nextOccurrence = (
  schedule: MedicationSchedule,
  now: Date,
): Date | null => {
  const times = [...schedule.times].sort();

  // Agenda sem horario ou sem inicio valido nunca ocorre (e travaria o laco).
  if (times.length === 0 || !Number.isFinite(toDay(schedule.startDate))) {
    return null;
  }

  let day = firstScheduledDayFrom(schedule, toDay(todayInBrazil(now)));

  while (day !== null) {
    for (const time of times) {
      const instant = brazilLocalToInstant(fromDay(day), time);

      if (instant.getTime() > now.getTime()) return instant;
    }

    day = firstScheduledDayFrom(schedule, day + 1);
  }

  return null;
};

/** As duas agendas caem num mesmo dia, de `today` em diante? */
const shareScheduledDay = (
  a: MedicationSchedule,
  b: MedicationSchedule,
  today: string,
): boolean => {
  const startA = toDay(a.startDate);
  const startB = toDay(b.startDate);
  const step = gcd(a.intervalDays, b.intervalDays);

  if (mod(startB - startA, step) !== 0) return false;

  const ends = [a.endDate, b.endDate]
    .filter((end): end is string => end !== null)
    .map(toDay);
  const last = ends.length ? Math.min(...ends) : Number.POSITIVE_INFINITY;
  const from = Math.max(startA, startB, toDay(today));
  const period = (a.intervalDays * b.intervalDays) / step;

  for (let day = from; day <= Math.min(last, from + period - 1); day += 1) {
    if (
      mod(day - startA, a.intervalDays) === 0 &&
      mod(day - startB, b.intervalDays) === 0
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Sobreposicao do UC08 (decisao de 2026-11-05): mesmo `HH:mm` de outro
 * medicamento num dia em que os dois ocorrem, de hoje em diante. Aviso, nunca
 * bloqueio. Quem chama passa so os outros medicamentos ativos.
 */
export const findScheduleConflicts = (
  target: MedicationSchedule,
  others: ReadonlyArray<{
    id: string;
    name: string;
    schedule: MedicationSchedule;
  }>,
  today: string,
): ScheduleConflict[] => {
  const targetTimes = new Set(target.times);

  return others
    .filter((other) => shareScheduledDay(target, other.schedule, today))
    .flatMap((other) =>
      other.schedule.times
        .filter((time) => targetTimes.has(time))
        .map((time) => ({
          medicationId: other.id,
          medicationName: other.name,
          time,
        })),
    )
    .sort(
      (x, y) =>
        x.time.localeCompare(y.time) ||
        x.medicationName.localeCompare(y.medicationName, 'pt-BR') ||
        x.medicationId.localeCompare(y.medicationId),
    );
};

/** Mesma agenda, ignorando a ordem dos horarios. */
export const isSameSchedule = (
  a: MedicationSchedule,
  b: MedicationSchedule,
): boolean =>
  a.startDate === b.startDate &&
  a.endDate === b.endDate &&
  a.intervalDays === b.intervalDays &&
  [...a.times].sort().join() === [...b.times].sort().join();

import type { FormFrequency } from '@/modules/Form/types/form.types';
import {
  brazilLocalToInstant,
  nextOccurrence,
  todayInBrazil,
} from '@/modules/Medication/policies/medicationSchedule.policy';
import {
  MEDICATION_TIME_ZONE,
  type MedicationSchedule,
} from '@/modules/Medication/types/medication.types';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MEDICATION_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * Soma dias no relogio de Brasilia: "1 dia" depois das 09:00 e 09:00 do dia
 * seguinte. Fusos tem minutos inteiros, entao segundos e milissegundos da
 * ancora passam direto.
 */
const plusLocalDays = (instant: Date, days: number): Date => {
  const local = brazilLocalToInstant(
    addDays(todayInBrazil(instant), days),
    timeFormatter.format(instant),
  );

  return new Date(local.getTime() + (instant.getTime() % MINUTE_MS));
};

const periodAfter = (
  anchor: Date,
  frequency: FormFrequency,
  k: number,
): Date => {
  if (frequency.unit === 'hours') {
    return new Date(anchor.getTime() + k * frequency.interval * HOUR_MS);
  }

  const days = frequency.unit === 'weeks' ? 7 : 1;

  return plusLocalDays(anchor, k * frequency.interval * days);
};

const approximateStepMs = (frequency: FormFrequency): number =>
  frequency.interval *
  (frequency.unit === 'hours'
    ? HOUR_MS
    : frequency.unit === 'weeks'
      ? 7 * DAY_MS
      : DAY_MS);

/**
 * Prazos de ausencia `anchor + k x frequencia` (k >= 1) em `(after, until]`,
 * do mais antigo ao mais novo, no maximo `limit` (decisao de 2026-11-05: um
 * alerta por periodo vencido, sem tolerancia).
 */
export const absenceDueDates = (
  anchor: Date,
  frequency: FormFrequency,
  after: Date,
  until: Date,
  limit: number,
): Date[] => {
  const dates: Date[] = [];
  let k = Math.max(
    1,
    Math.floor(
      (after.getTime() - anchor.getTime()) / approximateStepMs(frequency),
    ),
  );

  while (k > 1 && periodAfter(anchor, frequency, k - 1) > after) k -= 1;

  for (
    let due = periodAfter(anchor, frequency, k);
    due <= until && dates.length < limit;
    due = periodAfter(anchor, frequency, ++k)
  ) {
    if (due > after) dates.push(due);
  }

  return dates;
};

/** Horarios da agenda em `(after, until]`, no maximo `limit`. */
export const reminderOccurrences = (
  schedule: MedicationSchedule,
  after: Date,
  until: Date,
  limit: number,
): Date[] => {
  const dates: Date[] = [];

  for (
    let next = nextOccurrence(schedule, after);
    next !== null && next <= until && dates.length < limit;
    next = nextOccurrence(schedule, next)
  ) {
    dates.push(next);
  }

  return dates;
};

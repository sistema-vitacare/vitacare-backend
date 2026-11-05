import type { FrequencyUnit } from '@/modules/Form/types/form.types';
import {
  MEDICATION_TIME_ZONE,
  type MedicationDoseUnit,
} from '@/modules/Medication/types/medication.types';

import type {
  AbsenceMessageInput,
  ReminderMessageInput,
} from '../types/automation.types';

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: MEDICATION_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: MEDICATION_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const FREQUENCY_LABELS: Readonly<Record<FrequencyUnit, [string, string]>> = {
  hours: ['hora', 'horas'],
  days: ['dia', 'dias'],
  weeks: ['semana', 'semanas'],
};

const DOSE_LABELS: Readonly<Record<MedicationDoseUnit, [string, string]>> = {
  mg: ['mg', 'mg'],
  mcg: ['mcg', 'mcg'],
  g: ['g', 'g'],
  ml: ['mL', 'mL'],
  iu: ['UI', 'UI'],
  drops: ['gota', 'gotas'],
  tablet: ['comprimido', 'comprimidos'],
  capsule: ['cápsula', 'cápsulas'],
  application: ['aplicação', 'aplicações'],
};

/** `50.000` -> `50`; `0.500` -> `0.5`. */
const trimDecimal = (value: string): string =>
  value.includes('.') ? value.replace(/\.?0+$/, '') : value;

const plural = ([one, many]: [string, string], amount: number): string =>
  amount > 1 ? many : one;

/** So o fato e a frequencia configurada, sem interpretacao clinica (R04/R10). */
export const absenceMessage = ({
  formName,
  since,
  frequency,
}: AbsenceMessageInput): string =>
  `Sem registro de ${formName} desde ${dateTimeFormatter
    .format(since)
    .replace(',', '')}; esperado a cada ${frequency.interval} ${plural(
    FREQUENCY_LABELS[frequency.unit],
    frequency.interval,
  )}.`;

export const reminderMessage = ({
  medicationName,
  doseAmount,
  doseUnit,
  scheduledAt,
}: ReminderMessageInput): string => {
  const amount = trimDecimal(doseAmount);

  return `${medicationName} ${amount} ${plural(
    DOSE_LABELS[doseUnit],
    Number(amount),
  )} às ${timeFormatter.format(scheduledAt)}.`;
};

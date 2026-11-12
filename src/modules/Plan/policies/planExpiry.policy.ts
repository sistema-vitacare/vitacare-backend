import {
  brazilLocalToInstant,
  todayInBrazil,
} from '@/modules/Medication/policies/medicationSchedule.policy';

import type {
  PlanExpiryMilestone,
  PlanExpiryWarning,
} from '../types/plan.types';

/** Hora local de Brasilia dos avisos de vencimento (decisao de 2026-11-12). */
export const PLAN_EXPIRY_NOTICE_TIME = '08:00';

const DAY_MS = 86_400_000;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const noticeAt = (date: string): Date =>
  brazilLocalToInstant(date, PLAN_EXPIRY_NOTICE_TIME);

export interface PlanExpirySchedule {
  sevenDays: Date;
  oneDay: Date;
  expired: Date;
}

/**
 * Instantes dos tres marcos de um termo (BE-28): 08:00 de Brasilia sete dias e
 * um dia antes da data local de fim, e a primeira 08:00 em ou depois do fim.
 */
export const planExpirySchedule = (endsAt: Date): PlanExpirySchedule => {
  const endDate = todayInBrazil(endsAt);
  const sameDay = noticeAt(endDate);

  return {
    sevenDays: noticeAt(addDays(endDate, -7)),
    oneDay: noticeAt(addDays(endDate, -1)),
    expired:
      sameDay.getTime() >= endsAt.getTime()
        ? sameDay
        : noticeAt(addDays(endDate, 1)),
  };
};

/**
 * Marco que vale na `reference` (uma 08:00): so o mais recente que ja chegou e
 * ainda faz sentido. O de 7 dias vale ate o de 1 dia; o de 1 dia, ate o fim; o
 * de vencimento, ate a renovacao. Uma queda longa nao manda os tres de vez.
 */
export const planExpiryNoticeMilestone = (
  endsAt: Date,
  reference: Date,
): PlanExpiryMilestone | null => {
  const schedule = planExpirySchedule(endsAt);
  const time = reference.getTime();

  if (time >= schedule.expired.getTime()) return 'expired';
  if (time >= endsAt.getTime()) return null;
  if (time >= schedule.oneDay.getTime()) return 'one_day';
  if (time >= schedule.sevenDays.getTime()) return 'seven_days';

  return null;
};

/** Ate quando o aviso ainda pode sair; `null` = ate o termo ser substituido. */
export const planExpiryNoticeValidUntil = (
  endsAt: Date,
  milestone: PlanExpiryMilestone,
): Date | null => {
  if (milestone === 'seven_days') return planExpirySchedule(endsAt).oneDay;
  if (milestone === 'one_day') return endsAt;

  return null;
};

/**
 * Aviso exibido na consulta do plano: as mesmas janelas dos marcos, mas o
 * vencido vale desde o fim, como o `status = expired` do termo.
 */
export const planExpiryWarning = (
  endsAt: Date | null,
  now: Date,
): PlanExpiryWarning | null => {
  if (!endsAt) return null;

  const time = now.getTime();

  if (time >= endsAt.getTime()) return 'expired';

  const schedule = planExpirySchedule(endsAt);

  if (time >= schedule.oneDay.getTime()) return 'within_1_day';
  if (time >= schedule.sevenDays.getTime()) return 'within_7_days';

  return null;
};

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `20/11/2026 às 23:59`, no horario de Brasilia. */
export const formatBrazilDateTime = (date: Date): string => {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateTimeFormatter.formatToParts(date).find((p) => p.type === type)?.value;

  return `${part('day')}/${part('month')}/${part('year')} às ${part('hour')}:${part('minute')}`;
};

/** `meta.message` da consulta do plano quando ha aviso de vencimento. */
export const planExpiryWarningMessage = (
  warning: PlanExpiryWarning | null,
  endsAt: Date | null,
): string | null => {
  if (!warning || !endsAt) return null;

  const when = `${formatBrazilDateTime(endsAt)} (horário de Brasília)`;

  return warning === 'expired'
    ? `O plano venceu em ${when}. Novos cadastros e reativações de usuários e pacientes estão bloqueados até a renovação; a consulta e os registros continuam. Solicite a renovação na área de plano.`
    : `O plano vence em ${when}. Depois disso, novos cadastros e reativações de usuários e pacientes ficam bloqueados até a renovação. Solicite a renovação na área de plano.`;
};

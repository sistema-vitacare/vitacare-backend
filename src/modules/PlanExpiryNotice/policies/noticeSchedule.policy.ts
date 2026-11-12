import {
  brazilLocalToInstant,
  todayInBrazil,
} from '@/modules/Medication/policies/medicationSchedule.policy';
import { PLAN_EXPIRY_NOTICE_TIME } from '@/modules/Plan/policies/planExpiry.policy';

/** Execucao diaria as 08:00 de Brasilia (decisao de Mateus em 2026-11-12). */
export const NOTICE_CRON = '0 8 * * *';
export const NOTICE_TIME_ZONE = 'America/Sao_Paulo';

/** Um disparo adiantado por relogio ainda conta como a 08:00 do dia. */
const EARLY_FIRE_TOLERANCE_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/**
 * A 08:00 de Brasilia mais recente: toda execucao (a diaria, a atrasada por
 * queda ou a de recuperacao na subida) gera o que a execucao das 08:00 teria
 * gerado, e nada fora desse horario.
 */
export const noticeReference = (now: Date): Date => {
  const limit = now.getTime() + EARLY_FIRE_TOLERANCE_MS;
  const today = brazilLocalToInstant(
    todayInBrazil(new Date(limit)),
    PLAN_EXPIRY_NOTICE_TIME,
  );

  if (today.getTime() <= limit) return today;

  return brazilLocalToInstant(
    todayInBrazil(new Date(today.getTime() - DAY_MS)),
    PLAN_EXPIRY_NOTICE_TIME,
  );
};

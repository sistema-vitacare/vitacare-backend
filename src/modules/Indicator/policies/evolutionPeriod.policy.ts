import { HttpStatus } from '@nestjs/common';

import { CommonErrors } from '@/common/errors/commonErrors';
import { DomainException } from '@/common/errors/domain.exception';

import {
  EVOLUTION_DEFAULT_DAYS,
  EVOLUTION_MAX_DAYS,
  type EvolutionPeriod,
} from '../types/evolution.types';

const DAY_MS = 86_400_000;

const toDay = (date: string): number =>
  Date.parse(`${date}T00:00:00.000Z`) / DAY_MS;

const addDays = (date: string, days: number): string =>
  new Date((toDay(date) + days) * DAY_MS).toISOString().slice(0, 10);

const invalidPeriod = (field: 'from' | 'to', code: string, message: string) =>
  new DomainException({
    code: CommonErrors.VALIDATION_FAILED,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Alguns campos precisam ser corrigidos.',
    detail: '1 campo invalido na requisicao.',
    fields: [{ field, code, message }],
  });

/**
 * Periodo de dias locais inclusivos. Sem datas, os ultimos 30 dias ate hoje;
 * so `from` termina hoje; so `to` comeca 29 dias antes. `to < from` com as
 * duas datas informadas ja e recusado pelo DTO.
 */
export const resolveEvolutionPeriod = (
  { from, to }: Partial<EvolutionPeriod>,
  today: string,
): EvolutionPeriod => {
  const end = to ?? today;
  const start = from ?? addDays(end, 1 - EVOLUTION_DEFAULT_DAYS);

  if (start > end) {
    throw invalidPeriod(
      'from',
      'AFTER_END',
      'A data inicial nao pode ser posterior a hoje quando a final e omitida.',
    );
  }

  if (toDay(end) - toDay(start) + 1 > EVOLUTION_MAX_DAYS) {
    throw invalidPeriod(
      'to',
      'PERIOD_TOO_LONG',
      `O periodo pode ter no maximo ${EVOLUTION_MAX_DAYS} dias.`,
    );
  }

  return { from: start, to: end };
};

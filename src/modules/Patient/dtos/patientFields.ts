import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

import { isCalendarDate } from '@/common/validation/calendarDate';
import { Trim } from '@/modules/Organization/dtos/organizationFields';

export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export const MIN_BIRTH_DATE = '1900-01-01';

/**
 * Texto aparado, nao vazio e com teto; a obrigatoriedade fica no DTO. Com
 * `each`, vale para cada item de uma lista (aparada por `TrimEach`).
 */
export const PatientText = (
  label: string,
  max: number,
  { each = false }: { each?: boolean } = {},
): PropertyDecorator =>
  applyDecorators(
    ...(each ? [TrimEach()] : [Trim()]),
    IsString({ each, message: `${label} deve ser texto.` }),
    MinLength(1, { each, message: `${label} nao pode ser vazio.` }),
    MaxLength(max, { each, message: `${label} aceita ate ${max} caracteres.` }),
  );

export const UpperTrim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );

export const TrimEach = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim() : item,
        )
      : value,
  );

/** Hoje no fuso de Brasilia, como `YYYY-MM-DD`. */
const todayInBrazil = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );

/** `YYYY-MM-DD` existente, entre 1900-01-01 e hoje (fuso de Brasilia). */
export const IsBirthDate =
  (options?: ValidationOptions): PropertyDecorator =>
  (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'isBirthDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown) =>
          isCalendarDate(value) &&
          value >= MIN_BIRTH_DATE &&
          value <= todayInBrazil(),
      },
    });

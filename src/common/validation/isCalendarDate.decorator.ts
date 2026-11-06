import { ValidateBy, type ValidationOptions } from 'class-validator';

import { isCalendarDate } from './calendarDate';

/**
 * `YYYY-MM-DD` existente. Com `notBefore`, tambem nao anterior a data valida
 * da propriedade irma (fim de periodo contra o inicio).
 */
export const IsCalendarDate = (
  { notBefore }: { notBefore?: string } = {},
  options?: ValidationOptions,
): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: (value: unknown, args) => {
          if (!isCalendarDate(value)) return false;
          if (!notBefore) return true;

          const start = (args?.object as Record<string, unknown>)[notBefore];

          return !isCalendarDate(start) || value >= start;
        },
      },
    },
    options,
  );

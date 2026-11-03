import { Transform } from 'class-transformer';

import { onlyDigits } from '@/common/validation/cpf';

export const LowerTrim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export const OnlyDigits = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? onlyDigits(value) : value,
  );

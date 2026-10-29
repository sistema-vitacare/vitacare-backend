import { ValidateBy, type ValidationOptions } from 'class-validator';

import { isValidCpf } from './cpf';

export const IsCpf = (options?: ValidationOptions): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isCpf',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isValidCpf(value),
      },
    },
    options,
  );

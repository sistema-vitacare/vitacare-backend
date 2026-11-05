import {
  IsIn,
  IsNumber,
  Max,
  Min,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

import {
  type FieldMode,
  medicationField,
} from '@/modules/Medication/dtos/medicationFields';
import { PatientText } from '@/modules/Patient/dtos/patientFields';

import { ALERT_RULE_OPERATORS, ALERT_SEVERITIES } from '../types/alert.types';

/** Teto de `numeric(12,3)`. */
export const MAX_REFERENCE_VALUE = 999_999_999.999;

export const MAX_REFERENCE_DECIMALS = 3;

/**
 * Ate N casas pela representacao do numero. O `maxDecimalPlaces` do
 * class-validator lanca `TypeError` (500) com notacao exponencial (`1e-7`).
 */
const HasMaxDecimals =
  (max: number, options?: ValidationOptions): PropertyDecorator =>
  (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'hasMaxDecimals',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
          }

          const text = String(value);

          return (
            !text.includes('e') && (text.split('.')[1] ?? '').length <= max
          );
        },
      },
    });

export const RuleNameField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      type: String,
      example: 'Glicemia acima de 180',
      maxLength: 120,
      description: 'Vira o titulo do alerta gerado.',
    },
    PatientText('O nome da regra', 120),
  );

export const RuleDescriptionField = (): PropertyDecorator =>
  medicationField(
    'optional',
    {
      type: String,
      nullable: true,
      maxLength: 500,
      example: null,
      description: 'Texto livre; `null` limpa.',
    },
    PatientText('A descricao', 500),
  );

export const OperatorField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      enum: [...ALERT_RULE_OPERATORS],
      example: 'gt',
      description:
        'Dispara quando o valor registrado e: gt maior que, gte maior ou igual a, lt menor que, lte menor ou igual a referencia.',
    },
    IsIn(ALERT_RULE_OPERATORS, {
      message: 'Escolha um operador valido: gt, gte, lt ou lte.',
    }),
  );

export const ReferenceValueField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      type: Number,
      example: 180,
      minimum: -MAX_REFERENCE_VALUE,
      maximum: MAX_REFERENCE_VALUE,
      description:
        'Limiar na unidade do campo, ate 3 casas decimais. Definido pelo profissional; o sistema nao traz limiar clinico padrao.',
    },
    IsNumber(
      { allowNaN: false, allowInfinity: false },
      { message: 'Informe a referencia como numero.' },
    ),
    HasMaxDecimals(MAX_REFERENCE_DECIMALS, {
      message: 'A referencia aceita ate 3 casas decimais.',
    }),
    Min(-MAX_REFERENCE_VALUE, { message: 'A referencia e pequena demais.' }),
    Max(MAX_REFERENCE_VALUE, { message: 'A referencia e grande demais.' }),
  );

export const SeverityField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      enum: [...ALERT_SEVERITIES],
      example: 'warning',
      description:
        'critical (Critico), warning (Atencao) ou info (Informativo). Rotulo de prioridade, sem efeito clinico automatico.',
    },
    IsIn(ALERT_SEVERITIES, {
      message: 'Escolha uma severidade valida: critical, warning ou info.',
    }),
  );

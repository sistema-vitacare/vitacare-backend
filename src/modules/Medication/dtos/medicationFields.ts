import { applyDecorators } from '@nestjs/common';
import {
  ApiProperty,
  ApiPropertyOptional,
  type ApiPropertyOptions,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidateIf,
  type ValidationOptions,
} from 'class-validator';

import { isCalendarDate } from '@/common/validation/calendarDate';
import { PatientText, TrimEach } from '@/modules/Patient/dtos/patientFields';

import { todayInBrazil } from '../policies/medicationSchedule.policy';
import {
  MEDICATION_DOSE_UNITS,
  MEDICATION_ROUTES,
} from '../types/medication.types';

export const MIN_START_DATE = '2000-01-01';
export const MAX_END_DATE = '2100-12-31';
export const MAX_START_DAYS_AHEAD = 365;
export const MAX_TIMES = 24;
export const MAX_INTERVAL_DAYS = 30;
export const MAX_DOSE_AMOUNT = 9_999_999.999;

/** `HH:mm` de 00:00 a 23:59. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Inicio entre 2000-01-01 e um ano a frente de hoje (Brasilia). */
export const IsStartDate =
  (options?: ValidationOptions): PropertyDecorator =>
  (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'isMedicationStartDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown) =>
          isCalendarDate(value) &&
          value >= MIN_START_DATE &&
          value <= addDays(todayInBrazil(), MAX_START_DAYS_AHEAD),
      },
    });

/**
 * Fim ate 2100-12-31 e nao anterior ao inicio do mesmo corpo (ou a hoje,
 * quando o inicio e omitido ou nulo na criacao). No `PATCH` sem inicio, o caso de uso
 * compara com o inicio gravado.
 */
export const IsEndDate =
  (
    { startDefaultsToToday }: { startDefaultsToToday: boolean },
    options?: ValidationOptions,
  ): PropertyDecorator =>
  (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'isMedicationEndDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown, args) => {
          if (!isCalendarDate(value) || value > MAX_END_DATE) return false;

          const { startDate } = args?.object as { startDate?: unknown };
          const start = isCalendarDate(startDate)
            ? startDate
            : startDefaultsToToday && startDate == null
              ? todayInBrazil()
              : null;

          return start === null || value >= start;
        },
      },
    });

/**
 * `required`: obrigatorio. `optional`: pode faltar ou ser `null` (padrao ou
 * limpa). `patch`: pode faltar, mas `null` e recusado.
 */
export type FieldMode = 'required' | 'optional' | 'patch';

const present = (_object: unknown, value: unknown) => value !== undefined;

export const medicationField = (
  mode: FieldMode,
  api: ApiPropertyOptions,
  ...validators: PropertyDecorator[]
): PropertyDecorator =>
  applyDecorators(
    mode === 'required' ? ApiProperty(api) : ApiPropertyOptional(api),
    ...(mode === 'optional' ? [IsOptional()] : []),
    ...(mode === 'patch' ? [ValidateIf(present)] : []),
    ...validators,
  );

export const NameField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    { type: String, example: 'Losartana potassica', maxLength: 200 },
    PatientText('O nome do medicamento', 200),
  );

export const DoseAmountField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      type: Number,
      example: 50,
      exclusiveMinimum: true,
      minimum: 0,
      maximum: MAX_DOSE_AMOUNT,
      description:
        'Quantidade por administracao, ate 3 casas decimais (0.5 = meio).',
    },
    IsNumber(
      { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false },
      { message: 'Informe a dose como numero com ate 3 casas decimais.' },
    ),
    IsPositive({ message: 'A dose deve ser maior que zero.' }),
    Max(MAX_DOSE_AMOUNT, { message: 'A dose informada e grande demais.' }),
  );

export const DoseUnitField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      enum: [...MEDICATION_DOSE_UNITS],
      example: 'mg',
      description:
        'mg, mcg, g, ml, iu (UI), drops (gotas), tablet (comprimido), capsule (capsula), application (aplicacao).',
    },
    IsIn(MEDICATION_DOSE_UNITS, {
      message: 'Escolha uma unidade de dose valida.',
    }),
  );

export const RouteField = (): PropertyDecorator =>
  medicationField(
    'optional',
    {
      enum: [...MEDICATION_ROUTES],
      nullable: true,
      example: 'oral',
      description: 'Via de administracao; `null` = nao informada.',
    },
    IsIn(MEDICATION_ROUTES, {
      message: 'Escolha uma via de administracao valida.',
    }),
  );

export const NotesField = (): PropertyDecorator =>
  medicationField(
    'optional',
    {
      example: 'Tomar em jejum.',
      maxLength: 2000,
      nullable: true,
      type: String,
      description: 'Observacao; `null` limpa.',
    },
    PatientText('A observacao', 2000),
  );

export const StartDateField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      type: String,
      format: 'date',
      example: '2026-11-05',
      description: `Inicio do tratamento e ancora do intervalo (hora local de Brasilia). Omitido na criacao = hoje. Entre ${MIN_START_DATE} e hoje + ${MAX_START_DAYS_AHEAD} dias.`,
    },
    IsStartDate({
      message:
        'Informe uma data de inicio valida (AAAA-MM-DD), a partir de 2000-01-01 e ate um ano a frente.',
    }),
  );

export const EndDateField = (
  startDefaultsToToday: boolean,
): PropertyDecorator =>
  medicationField(
    'optional',
    {
      format: 'date',
      nullable: true,
      type: String,
      example: null,
      description: `Ultimo dia do tratamento; \`null\` = uso continuo. Nao anterior ao inicio (enviado, gravado ou, na criacao sem inicio, hoje); ate ${MAX_END_DATE}.`,
    },
    IsEndDate(
      { startDefaultsToToday },
      {
        message:
          'Informe uma data de fim valida (AAAA-MM-DD), nao anterior ao inicio e ate 2100-12-31.',
      },
    ),
  );

export const IntervalDaysField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      type: 'integer',
      minimum: 1,
      maximum: MAX_INTERVAL_DAYS,
      default: 1,
      description:
        'Os horarios se repetem a cada N dias a partir do inicio (1 = diario, 2 = dia sim, dia nao).',
    },
    IsInt({ message: 'O intervalo deve ser um numero inteiro de dias.' }),
    Min(1, { message: 'O intervalo minimo e 1 dia.' }),
    Max(MAX_INTERVAL_DAYS, {
      message: `O intervalo maximo e ${MAX_INTERVAL_DAYS} dias.`,
    }),
  );

export const TimesField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      type: [String],
      example: ['08:00', '20:00'],
      minItems: 1,
      maxItems: MAX_TIMES,
      description:
        'Horarios de administracao (HH:mm, hora local de Brasilia), sem repeticao. A frequencia diaria e a quantidade de horarios.',
    },
    IsArray({ message: 'Informe os horarios como lista.' }),
    ArrayMinSize(1, { message: 'Informe ao menos um horario.' }),
    ArrayMaxSize(MAX_TIMES, { message: `Informe ate ${MAX_TIMES} horarios.` }),
    ArrayUnique({ message: 'Os horarios nao podem se repetir.' }),
    TrimEach(),
    Matches(TIME_PATTERN, {
      each: true,
      message: 'Informe cada horario no formato HH:mm (00:00 a 23:59).',
    }),
  );

export const RemindersEnabledField = (mode: FieldMode): PropertyDecorator =>
  medicationField(
    mode,
    {
      type: Boolean,
      default: false,
      description:
        'Programa lembretes automaticos nos horarios (UC08, "se desejado").',
    },
    IsBoolean({
      message: 'Informe se os lembretes estao ligados (true/false).',
    }),
  );

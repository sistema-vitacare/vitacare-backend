import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';

export const MAX_FORM_PATIENTS = 500;

/**
 * `patients` exige `patientIds` com ao menos um paciente; `organization` nao
 * aceita lista. Vai no `audience` para valer tambem quando `patientIds` falta.
 */
export const AudienceMatchesPatientIds =
  (): PropertyDecorator => (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'audienceMatchesPatientIds',
      target: target.constructor,
      propertyName: String(propertyName),
      options: {
        message:
          'Com audience patients informe patientIds; com organization nao envie patientIds.',
      },
      validator: {
        validate: (audience: unknown, args: ValidationArguments) => {
          const { patientIds } = args.object as { patientIds?: unknown };

          return audience === 'patients'
            ? Array.isArray(patientIds) && patientIds.length > 0
            : patientIds === undefined;
        },
      },
    });

/** Lista de pacientes: so validada quando enviada. */
export const PatientIdList = (): PropertyDecorator =>
  applyDecorators(
    ValidateIf(
      (object: { patientIds?: unknown }) => object.patientIds !== undefined,
    ),
    Transform(({ value }: { value: unknown }) =>
      Array.isArray(value)
        ? value.map((item: unknown) =>
            typeof item === 'string' ? item.trim().toLowerCase() : item,
          )
        : value,
    ),
    IsArray({ message: 'patientIds deve ser uma lista.' }),
    ArrayMinSize(1, { message: 'Informe ao menos um paciente.' }),
    ArrayMaxSize(MAX_FORM_PATIENTS, {
      message: `A lista aceita ate ${MAX_FORM_PATIENTS} pacientes.`,
    }),
    ArrayUnique({ message: 'A lista nao pode repetir paciente.' }),
    IsUUID('all', {
      each: true,
      message: 'Cada paciente deve ser um identificador valido.',
    }),
  );

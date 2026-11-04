import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormDto } from '../dtos/form.dto';
import { FormErrors } from '../form.errors';
import {
  toFieldConfig,
  toFormProperties,
  toFormResponse,
} from '../parsers/form.parser';
import { assertFieldsConfigurable } from '../policies/formFields.policy';
import { FormRepository } from '../repositories/form.repository';
import type { CreateFormDto } from './createForm.dto';

/**
 * UC09 passos 1 a 4: cria o formulario como rascunho, com campos, publico e
 * frequencia esperada. Publicar ("salva e ativa") e a rota de publicacao.
 */
@Injectable()
export class CreateFormUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(input: CreateFormDto, ctx: RequestContext): Promise<FormDto> {
    const fields = input.fields.map(toFieldConfig);

    assertFieldsConfigurable(fields);

    const outcome = await this.forms.create({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      properties: toFormProperties(input),
      audience: input.audience,
      patientIds: input.patientIds ?? [],
      fields,
    });

    switch (outcome.kind) {
      case 'invalid_patients':
        throw new DomainException({
          ...FormErrors.INVALID_PATIENTS,
          detail: 'Paciente inexistente, inativo ou fora da organização.',
          fields: [{ field: 'patientIds', code: 'INVALID_PATIENT' }],
        });

      case 'invalid_fields':
        throw new DomainException({
          ...FormErrors.INVALID_FIELDS,
          detail: 'Chave de campo que não pertence a este formulário.',
          fields: outcome.errors,
        });

      default:
        return toFormResponse(outcome.form, ctx);
    }
  }
}

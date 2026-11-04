import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormDto } from '../dtos/form.dto';
import { FormErrors } from '../form.errors';
import { toFormPatch, toFormResponse } from '../parsers/form.parser';
import { FormRepository } from '../repositories/form.repository';
import type { UpdateFormDto } from './updateForm.dto';

/**
 * Nome, descricao, tipo, frequencia e publico mudam sem nova versao: nao
 * alteram o significado de respostas ja dadas.
 */
@Injectable()
export class UpdateFormUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(
    formId: string,
    input: UpdateFormDto,
    ctx: RequestContext,
  ): Promise<FormDto> {
    const patch = toFormPatch(input);

    if (Object.keys(patch).length === 0 && input.audience === undefined) {
      throw new DomainException({
        ...FormErrors.NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editável.',
      });
    }

    const outcome = await this.forms.update({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      formId,
      patch,
      audience: input.audience,
      patientIds: input.patientIds,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...FormErrors.NOT_FOUND,
          detail: 'Formulário inexistente ou fora da organização.',
        });

      case 'inactive':
        throw new DomainException({
          ...FormErrors.INACTIVE,
          detail: 'Formulário desativado não é editado.',
        });

      case 'invalid_patients':
        throw new DomainException({
          ...FormErrors.INVALID_PATIENTS,
          detail: 'Paciente inexistente, inativo ou fora da organização.',
          fields: [{ field: 'patientIds', code: 'INVALID_PATIENT' }],
        });

      default:
        return toFormResponse(outcome.form, ctx);
    }
  }
}

import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormDto } from '../dtos/form.dto';
import { FormErrors } from '../form.errors';
import { toFormResponse } from '../parsers/form.parser';
import { FormRepository } from '../repositories/form.repository';

/** Exclusao de formulario (UC09): desativa e preserva os registros coletados. */
@Injectable()
export class DeactivateFormUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(formId: string, ctx: RequestContext): Promise<FormDto> {
    const outcome = await this.forms.deactivate({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      formId,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...FormErrors.NOT_FOUND,
          detail: 'Formulário inexistente ou fora da organização.',
        });

      case 'already_inactive':
        throw new DomainException({
          ...FormErrors.ALREADY_INACTIVE,
          detail: 'Formulário já desativado.',
        });

      default:
        return toFormResponse(outcome.form, ctx);
    }
  }
}

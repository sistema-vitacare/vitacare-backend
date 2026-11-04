import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormDto } from '../dtos/form.dto';
import { FormErrors } from '../form.errors';
import { toFormResponse } from '../parsers/form.parser';
import { FormRepository } from '../repositories/form.repository';
import type { PublishFormDto } from './publishForm.dto';

/**
 * UC09 passo 6 ("salva e ativa") e edicao de formulario com registros: o
 * rascunho vira a versao vigente; as respostas antigas ficam na versao delas.
 */
@Injectable()
export class PublishFormUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(
    formId: string,
    input: PublishFormDto,
    ctx: RequestContext,
  ): Promise<FormDto> {
    const outcome = await this.forms.publish({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      formId,
      confirmImpact: input.confirmImpact === true,
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
          detail: 'Formulário desativado não é publicado.',
        });

      case 'no_draft':
        throw new DomainException({
          ...FormErrors.NO_DRAFT,
          detail: 'Não há rascunho vivo para publicar.',
        });

      case 'empty':
        throw new DomainException({
          ...FormErrors.EMPTY,
          detail: 'Rascunho só com campos desabilitados.',
        });

      case 'confirmation_required':
        throw new DomainException({
          ...FormErrors.IMPACT_CONFIRMATION_REQUIRED,
          detail: 'Já existe versão vigente; envie confirmImpact = true.',
          fields: [{ field: 'confirmImpact', code: 'REQUIRED' }],
        });

      default:
        return toFormResponse(outcome.form, ctx);
    }
  }
}

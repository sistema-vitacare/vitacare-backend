import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormDto } from '../dtos/form.dto';
import { FormErrors } from '../form.errors';
import { toFormResponse } from '../parsers/form.parser';
import { FormRepository } from '../repositories/form.repository';

/** "Descartar alteracoes" (Figura 39): a versao vigente continua valendo. */
@Injectable()
export class DiscardFormDraftUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(formId: string, ctx: RequestContext): Promise<FormDto> {
    const outcome = await this.forms.discardDraft({
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

      case 'inactive':
        throw new DomainException({
          ...FormErrors.INACTIVE,
          detail: 'Formulário desativado não tem rascunho a descartar.',
        });

      case 'no_draft':
        throw new DomainException({
          ...FormErrors.NO_DRAFT,
          detail: 'Não há rascunho vivo.',
        });

      case 'not_published':
        throw new DomainException({
          ...FormErrors.NOT_PUBLISHED,
          detail: 'Formulário sem versão publicada.',
        });

      default:
        return toFormResponse(outcome.form, ctx);
    }
  }
}

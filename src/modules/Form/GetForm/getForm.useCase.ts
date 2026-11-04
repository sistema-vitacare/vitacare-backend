import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormDto } from '../dtos/form.dto';
import { FormErrors } from '../form.errors';
import { toFormResponse } from '../parsers/form.parser';
import { FormRepository } from '../repositories/form.repository';

/** Detalhe com a versao vigente e, para quem configura, o rascunho. */
@Injectable()
export class GetFormUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(formId: string, ctx: RequestContext): Promise<FormDto> {
    const form = await this.forms.findById(patientScope(ctx), formId);

    if (!form) {
      throw new DomainException({
        ...FormErrors.NOT_FOUND,
        detail: 'Formulário inexistente ou fora do alcance da sessão.',
      });
    }

    return toFormResponse(form, ctx);
  }
}

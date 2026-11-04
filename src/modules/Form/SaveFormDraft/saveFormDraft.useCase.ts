import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormDto } from '../dtos/form.dto';
import { FormErrors } from '../form.errors';
import { toFieldConfig, toFormResponse } from '../parsers/form.parser';
import { assertFieldsConfigurable } from '../policies/formFields.policy';
import { FormRepository } from '../repositories/form.repository';
import type { SaveFormDraftDto } from './saveFormDraft.dto';

/** Edicao de formulario (UC09): monta a proxima versao sem tocar a vigente. */
@Injectable()
export class SaveFormDraftUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(
    formId: string,
    input: SaveFormDraftDto,
    ctx: RequestContext,
  ): Promise<FormDto> {
    const fields = input.fields.map(toFieldConfig);

    assertFieldsConfigurable(fields);

    const outcome = await this.forms.saveDraft({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      formId,
      fields,
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
          detail: 'Formulário desativado não recebe rascunho.',
        });

      case 'invalid_fields':
        throw new DomainException({
          ...FormErrors.INVALID_FIELDS,
          detail: 'Chave de campo alheia a este formulário ou com outro tipo.',
          fields: outcome.errors,
        });

      default:
        return toFormResponse(outcome.form, ctx);
    }
  }
}

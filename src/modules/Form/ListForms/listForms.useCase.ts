import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FormSummaryDto } from '../dtos/form.dto';
import { toFormSummaryResponse } from '../parsers/form.parser';
import { FormRepository } from '../repositories/form.repository';
import type { ListFormsQueryDto } from './listForms.dto';

/** Area de formularios (UC09 passo 1) e formulario vigente do paciente (UC11). */
@Injectable()
export class ListFormsUseCase {
  constructor(private readonly forms: FormRepository) {}

  async execute(
    query: ListFormsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<FormSummaryDto[]>> {
    const result = await this.forms.list(patientScope(ctx), {
      status: query.status,
      search: query.search,
      patientId: query.patientId,
      skip: query.skip,
      take: query.limit,
    });

    if (!result) {
      throw new DomainException({
        ...PatientErrors.NOT_FOUND,
        detail: 'Paciente do filtro inexistente ou fora do alcance da sessão.',
      });
    }

    const [items, total] = result;

    return paginate(
      items.map((item) => toFormSummaryResponse(item, ctx)),
      total,
      query,
    );
  }
}

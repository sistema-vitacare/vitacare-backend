import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { PatientDto } from '../dtos/patient.dto';
import { toPatientResponse } from '../parsers/patient.parser';
import {
  noCareLinkMessage,
  patientScope,
  readsFullPatientRecord,
} from '../policies/patient.policy';
import { PatientRepository } from '../repositories/patient.repository';
import {
  PATIENTS_EMPTY_MESSAGE,
  type PatientScope,
} from '../types/patient.types';
import type { ListPatientsQueryDto } from './listPatients.dto';

/**
 * Listagem da Figura 34: so ativos por padrao; CPF sai mascarado. O familiar
 * busca so pelo nome, porque nao ve o CPF. Lista vazia leva `meta.message`:
 * orientacao a quem nao tem vinculo vigente, senao o aviso de busca vazia.
 */
@Injectable()
export class ListPatientsUseCase {
  constructor(private readonly patients: PatientRepository) {}

  async execute(
    query: ListPatientsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<PatientDto[]>> {
    const scope = patientScope(ctx);
    const [items, total] = await this.patients.list(scope, {
      status: query.status,
      search: query.search,
      searchCpf: readsFullPatientRecord(ctx),
      condition: query.condition,
      skip: query.skip,
      take: query.limit,
    });

    const page = paginate(
      items.map((item) => toPatientResponse(item, ctx, { maskCpf: true })),
      total,
      query,
    );

    if (total === 0) page.extras.message = await this.emptyMessage(scope, ctx);

    return page;
  }

  private async emptyMessage(
    scope: PatientScope,
    ctx: RequestContext,
  ): Promise<string> {
    const noLinkMessage = noCareLinkMessage(ctx);

    if (noLinkMessage && !(await this.patients.hasCareLink(scope))) {
      return noLinkMessage;
    }

    return PATIENTS_EMPTY_MESSAGE;
  }
}

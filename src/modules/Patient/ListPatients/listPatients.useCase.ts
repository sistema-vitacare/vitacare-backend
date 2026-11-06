import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { PatientDto } from '../dtos/patient.dto';
import { toPatientResponse } from '../parsers/patient.parser';
import {
  patientScope,
  readsFullPatientRecord,
} from '../policies/patient.policy';
import { PatientRepository } from '../repositories/patient.repository';
import type { ListPatientsQueryDto } from './listPatients.dto';

/**
 * Listagem da Figura 34: so ativos por padrao; CPF sai mascarado. O familiar
 * busca so pelo nome, porque nao ve o CPF.
 */
@Injectable()
export class ListPatientsUseCase {
  constructor(private readonly patients: PatientRepository) {}

  async execute(
    query: ListPatientsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<PatientDto[]>> {
    const [items, total] = await this.patients.list(patientScope(ctx), {
      status: query.status,
      search: query.search,
      searchCpf: readsFullPatientRecord(ctx),
      condition: query.condition,
      skip: query.skip,
      take: query.limit,
    });

    return paginate(
      items.map((item) => toPatientResponse(item, ctx, { maskCpf: true })),
      total,
      query,
    );
  }
}

import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { PatientLinkDto } from '../dtos/patientLink.dto';
import { toPatientLinkResponse } from '../parsers/patientLink.parser';
import { PatientLinkRepository } from '../repositories/patientLink.repository';
import type { ListPatientLinksQueryDto } from './listPatientLinks.dto';

/** Vinculos da organizacao, pelo paciente (UC07/UC14) ou pelo usuario (UC03). */
@Injectable()
export class ListPatientLinksUseCase {
  constructor(private readonly links: PatientLinkRepository) {}

  async execute(
    query: ListPatientLinksQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<PatientLinkDto[]>> {
    const [items, total] = await this.links.list(ctx.organizationId, {
      patientId: query.patientId,
      userId: query.userId,
      role: query.role,
      status: query.status,
      skip: query.skip,
      take: query.limit,
    });

    return paginate(
      items.map((item) => toPatientLinkResponse(item, ctx)),
      total,
      query,
    );
  }
}

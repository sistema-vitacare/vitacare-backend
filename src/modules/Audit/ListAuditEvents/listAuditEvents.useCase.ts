import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import type {
  AuditEventDto,
  ListAuditEventsQueryDto,
} from '../dtos/auditEvent.dto';
import { toAuditEventResponse } from '../parsers/auditEvent.parser';
import { resolveAuditFilter } from '../policies/auditFilter.policy';
import { AuditEventQueryRepository } from '../repositories/auditEventQuery.repository';
import { AUDIT_EMPTY_MESSAGE } from '../types/auditEvent.types';

/** UC06 passos 2-4; filtro sem resultado e o fluxo alternativo (lista vazia com aviso). */
@Injectable()
export class ListAuditEventsUseCase {
  constructor(private readonly events: AuditEventQueryRepository) {}

  async execute(
    query: ListAuditEventsQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<AuditEventDto[]>> {
    const filter = resolveAuditFilter(query, ctx, today);
    const [rows, total] = await this.events.list(
      filter,
      (query.page - 1) * query.limit,
      query.limit,
    );
    const page = paginate(rows.map(toAuditEventResponse), total, query);

    if (total === 0) page.extras.message = AUDIT_EMPTY_MESSAGE;

    return page;
  }
}

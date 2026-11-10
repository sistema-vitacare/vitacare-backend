import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { isPlatformContext } from '@/modules/Organization/policies/organization.policy';

import { AuditErrors } from '../audit.errors';
import type { AuditEventDetailDto } from '../dtos/auditEvent.dto';
import { toAuditEventDetailResponse } from '../parsers/auditEvent.parser';
import { maskForeignPersonalData } from '../policies/auditPersonalData.policy';
import { AuditEventQueryRepository } from '../repositories/auditEventQuery.repository';

/** UC06 passo 5: detalhe com os valores gravados. */
@Injectable()
export class GetAuditEventUseCase {
  constructor(private readonly events: AuditEventQueryRepository) {}

  async execute(
    eventId: string,
    ctx: RequestContext,
  ): Promise<AuditEventDetailDto> {
    const row = await this.events.findById(
      eventId,
      isPlatformContext(ctx) ? null : ctx.organizationId,
    );

    if (!row) {
      throw new DomainException({
        ...AuditErrors.EVENT_NOT_FOUND,
        detail: 'Evento inexistente ou de outra organizacao.',
      });
    }

    return toAuditEventDetailResponse(
      maskForeignPersonalData(row, ctx.organizationId),
    );
  }
}

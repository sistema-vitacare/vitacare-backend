import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';
import { isPlatformContext } from '@/modules/Organization/policies/organization.policy';

import type {
  ListTermsAcceptancesQueryDto,
  TermsAcceptanceItemDto,
} from '../dtos/termsAcceptance.dto';
import { toTermsAcceptanceItemResponse } from '../parsers/termsAcceptance.parser';
import { TermsAcceptanceRepository } from '../repositories/termsAcceptance.repository';
import { TERMS_ACCEPTANCES_EMPTY_MESSAGE } from '../types/terms.types';

/**
 * Prova dos aceites (BE-32), com a regra de escopo da auditoria (BE-23): o
 * admin ve so a propria organizacao, o master todas ou a escolhida. Periodo do
 * BE-20 sobre `accepted_at`.
 */
@Injectable()
export class ListTermsAcceptancesUseCase {
  constructor(private readonly acceptances: TermsAcceptanceRepository) {}

  async execute(
    query: ListTermsAcceptancesQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<TermsAcceptanceItemDto[]>> {
    const [rows, total] = await this.acceptances.list(
      {
        organizationId: isPlatformContext(ctx)
          ? (query.organizationId ?? null)
          : ctx.organizationId,
        period: resolveEvolutionPeriod(query, today),
        version: query.version,
        userId: query.userId,
      },
      (query.page - 1) * query.limit,
      query.limit,
    );
    const page = paginate(
      rows.map((row) => toTermsAcceptanceItemResponse(row, ctx.organizationId)),
      total,
      query,
    );

    if (total === 0) page.extras.message = TERMS_ACCEPTANCES_EMPTY_MESSAGE;

    return page;
  }
}

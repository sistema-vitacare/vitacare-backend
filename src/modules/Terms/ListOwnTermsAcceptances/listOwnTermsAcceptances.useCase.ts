import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { OwnTermsAcceptanceDto } from '../dtos/termsAcceptance.dto';
import { toOwnTermsAcceptanceResponse } from '../parsers/termsAcceptance.parser';
import { TermsAcceptanceRepository } from '../repositories/termsAcceptance.repository';

/** Os proprios aceites, da versao mais nova para a mais antiga (BE-32). */
@Injectable()
export class ListOwnTermsAcceptancesUseCase {
  constructor(private readonly acceptances: TermsAcceptanceRepository) {}

  async execute(ctx: RequestContext): Promise<OwnTermsAcceptanceDto[]> {
    const rows = await this.acceptances.listOwn(ctx.userId, ctx.organizationId);

    return rows.map(toOwnTermsAcceptanceResponse);
  }
}

import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { AlertRuleDto } from '../dtos/alertRule.dto';
import { toAlertRuleResponse } from '../parsers/alertRule.parser';
import { AlertRuleRepository } from '../repositories/alertRule.repository';
import type { ListAlertRulesQueryDto } from './listAlertRules.dto';

/** Regras da organizacao: ativas primeiro, mais recentes antes. */
@Injectable()
export class ListAlertRulesUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(
    query: ListAlertRulesQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<AlertRuleDto[]>> {
    const [rows, total] = await this.rules.list(ctx.organizationId, {
      formId: query.formId,
      patientId: query.patientId,
      status: query.status,
      skip: query.skip,
      take: query.limit,
    });

    return paginate(
      rows.map((row) => toAlertRuleResponse(row, ctx)),
      total,
      query,
    );
  }
}

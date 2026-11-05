import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AlertErrors } from '../alert.errors';
import type { AlertRuleDto } from '../dtos/alertRule.dto';
import { toAlertRuleResponse } from '../parsers/alertRule.parser';
import { AlertRuleRepository } from '../repositories/alertRule.repository';

@Injectable()
export class GetAlertRuleUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(ruleId: string, ctx: RequestContext): Promise<AlertRuleDto> {
    const rule = await this.rules.findById(ctx.organizationId, ruleId);

    if (!rule) {
      throw new DomainException({
        ...AlertErrors.RULE_NOT_FOUND,
        detail: 'Regra inexistente ou de outra organizacao.',
      });
    }

    return toAlertRuleResponse(rule, ctx);
  }
}

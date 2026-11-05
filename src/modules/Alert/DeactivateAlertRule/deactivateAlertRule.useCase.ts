import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AlertErrors } from '../alert.errors';
import type { AlertRuleDto } from '../dtos/alertRule.dto';
import { toAlertRuleResponse } from '../parsers/alertRule.parser';
import { AlertRuleRepository } from '../repositories/alertRule.repository';

/** Regra inativa deixa de avaliar; os alertas ja gerados ficam. */
@Injectable()
export class DeactivateAlertRuleUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(ruleId: string, ctx: RequestContext): Promise<AlertRuleDto> {
    const outcome = await this.rules.deactivate({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      ruleId,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...AlertErrors.RULE_NOT_FOUND,
          detail: 'Regra inexistente ou de outra organizacao.',
        });

      case 'already_inactive':
        throw new DomainException({
          ...AlertErrors.RULE_ALREADY_INACTIVE,
          detail: 'A regra ja estava inativa.',
        });

      default:
        return toAlertRuleResponse(outcome.rule, ctx);
    }
  }
}

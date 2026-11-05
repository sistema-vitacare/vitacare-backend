import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AlertErrors } from '../alert.errors';
import type { AlertRuleDto } from '../dtos/alertRule.dto';
import {
  toAlertRulePatch,
  toAlertRuleResponse,
} from '../parsers/alertRule.parser';
import { AlertRuleRepository } from '../repositories/alertRule.repository';
import type { UpdateAlertRuleOutcome } from '../types/alert.types';
import type { UpdateAlertRuleDto } from './updateAlertRule.dto';

const FAILURES: Record<
  Exclude<UpdateAlertRuleOutcome['kind'], 'updated'>,
  () => DomainException
> = {
  not_found: () =>
    new DomainException({
      ...AlertErrors.RULE_NOT_FOUND,
      detail: 'Regra inexistente ou de outra organizacao.',
    }),
  inactive: () =>
    new DomainException({
      ...AlertErrors.RULE_INACTIVE,
      detail: 'Regra inativa nao e editavel.',
    }),
  unchanged: () =>
    new DomainException({
      ...AlertErrors.RULE_NOTHING_TO_UPDATE,
      detail: 'Os valores enviados sao iguais aos gravados.',
    }),
};

/** Vale para os registros enviados depois; alertas gerados nao mudam. */
@Injectable()
export class UpdateAlertRuleUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(
    ruleId: string,
    dto: UpdateAlertRuleDto,
    ctx: RequestContext,
  ): Promise<AlertRuleDto> {
    const fields = toAlertRulePatch(dto);

    if (Object.keys(fields).length === 0) {
      throw new DomainException({
        ...AlertErrors.RULE_NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editavel.',
      });
    }

    const outcome = await this.rules.update({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      ruleId,
      fields,
    });

    if (outcome.kind !== 'updated') throw FAILURES[outcome.kind]();

    return toAlertRuleResponse(outcome.rule, ctx);
  }
}

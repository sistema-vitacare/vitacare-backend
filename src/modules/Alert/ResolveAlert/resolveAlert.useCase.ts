import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AlertErrors } from '../alert.errors';
import type { AlertDto } from '../dtos/alert.dto';
import { toAlertResponse } from '../parsers/alert.parser';
import { alertScope } from '../policies/alertScope.policy';
import { AlertRepository } from '../repositories/alert.repository';

/**
 * "Resolver" da Figura 42 (decisao de Mateus em 2026-11-06): admin,
 * profissional e cuidador, no proprio alcance de pacientes; vale para todos.
 */
@Injectable()
export class ResolveAlertUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(alertId: string, ctx: RequestContext): Promise<AlertDto> {
    const outcome = await this.alerts.resolve(
      alertScope(ctx),
      alertId,
      ctx.requestId,
    );

    if (outcome.kind === 'not_found') {
      throw new DomainException({
        ...AlertErrors.NOT_FOUND,
        detail:
          'Alerta inexistente, fora da organizacao ou de paciente sem vinculo com o usuario.',
      });
    }

    if (outcome.kind === 'already_resolved') {
      throw new DomainException({
        ...AlertErrors.ALREADY_RESOLVED,
        detail: 'O alerta ja tem resolved_at.',
      });
    }

    return toAlertResponse(outcome.alert, ctx);
  }
}

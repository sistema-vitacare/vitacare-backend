import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AlertErrors } from '../alert.errors';
import type { AlertDto } from '../dtos/alert.dto';
import { toAlertResponse } from '../parsers/alert.parser';
import { alertScope } from '../policies/alertScope.policy';
import { AlertRepository } from '../repositories/alert.repository';

@Injectable()
export class GetAlertUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(alertId: string, ctx: RequestContext): Promise<AlertDto> {
    const alert = await this.alerts.findById(alertScope(ctx), alertId);

    if (!alert) {
      throw new DomainException({
        ...AlertErrors.NOT_FOUND,
        detail:
          'Alerta inexistente, fora da organizacao ou de paciente sem vinculo com o usuario.',
      });
    }

    return toAlertResponse(alert, ctx);
  }
}

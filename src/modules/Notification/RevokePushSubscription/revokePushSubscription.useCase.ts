import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { NotificationErrors } from '../notification.errors';
import { notificationActor } from '../parsers/notification.parser';
import { NotificationRepository } from '../repositories/notification.repository';
import type { RevokePushSubscriptionDto } from './revokePushSubscription.dto';

/**
 * Para o push neste navegador. O frontend chama antes do logout: a sessao
 * expira sozinha e nao revoga a inscricao.
 */
@Injectable()
export class RevokePushSubscriptionUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    body: RevokePushSubscriptionDto,
    ctx: RequestContext,
  ): Promise<null> {
    if (
      !(await this.notifications.revokePushSubscription(
        notificationActor(ctx),
        body.endpoint,
      ))
    ) {
      throw new DomainException({
        ...NotificationErrors.PUSH_SUBSCRIPTION_NOT_FOUND,
        detail: 'Nenhuma inscricao ativa deste usuario com o endpoint.',
      });
    }

    return null;
  }
}

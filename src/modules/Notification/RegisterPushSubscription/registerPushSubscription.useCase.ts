import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { PUSH_SENDER, type PushSender } from '../channels/pushSender';
import type { PushSubscriptionCreatedDto } from '../dtos/notification.dto';
import { NotificationErrors } from '../notification.errors';
import { notificationActor } from '../parsers/notification.parser';
import { isAllowedPushEndpoint } from '../policies/pushEndpoint.policy';
import { NotificationRepository } from '../repositories/notification.repository';
import type { RegisterPushSubscriptionDto } from './registerPushSubscription.dto';

/** Inscreve o navegador do usuario no push (permissao dada no navegador). */
@Injectable()
export class RegisterPushSubscriptionUseCase {
  constructor(
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(
    body: RegisterPushSubscriptionDto,
    ctx: RequestContext,
  ): Promise<PushSubscriptionCreatedDto> {
    if (!this.push.enabled) {
      throw new DomainException({
        ...NotificationErrors.PUSH_DISABLED,
        detail: 'WEB_PUSH_ENABLED desligado ou sem chaves VAPID.',
      });
    }

    if (!isAllowedPushEndpoint(body.endpoint)) {
      throw new DomainException({
        ...NotificationErrors.PUSH_ENDPOINT_NOT_ALLOWED,
        detail: 'Host do endpoint fora da lista de servicos de push.',
        fields: [{ field: 'endpoint', code: 'NOT_ALLOWED' }],
      });
    }

    const created = await this.notifications.registerPushSubscription(
      notificationActor(ctx),
      {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    );

    return { id: created.id, createdAt: created.createdAt.toISOString() };
  }
}

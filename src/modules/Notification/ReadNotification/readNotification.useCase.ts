import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { NotificationDto } from '../dtos/notification.dto';
import { NotificationErrors } from '../notification.errors';
import {
  inboxScope,
  toNotificationResponse,
} from '../parsers/notification.parser';
import { NotificationRepository } from '../repositories/notification.repository';

/** Leitura individual; repetir mantem a primeira data. */
@Injectable()
export class ReadNotificationUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    notificationId: string,
    ctx: RequestContext,
  ): Promise<NotificationDto> {
    const row = await this.notifications.markRead(
      inboxScope(ctx),
      notificationId,
    );

    if (!row) {
      throw new DomainException({
        ...NotificationErrors.NOT_FOUND,
        detail:
          'Notificacao inexistente, de outro usuario ou de paciente fora do alcance.',
      });
    }

    return toNotificationResponse(row, ctx);
  }
}

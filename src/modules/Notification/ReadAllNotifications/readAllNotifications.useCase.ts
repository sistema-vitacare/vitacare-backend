import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { ReadAllResultDto } from '../dtos/notification.dto';
import { inboxScope } from '../parsers/notification.parser';
import { NotificationRepository } from '../repositories/notification.repository';
import type { ReadAllNotificationsDto } from './readAllNotifications.dto';

/** "Marcar todos como lidos" (Figura 42), so as do proprio usuario. */
@Injectable()
export class ReadAllNotificationsUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    body: ReadAllNotificationsDto,
    ctx: RequestContext,
  ): Promise<ReadAllResultDto> {
    return {
      updated: await this.notifications.markAllRead(
        inboxScope(ctx),
        body.patientId ?? null,
      ),
    };
  }
}

import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { UnreadCountDto } from '../dtos/notification.dto';
import { inboxScope } from '../parsers/notification.parser';
import { NotificationRepository } from '../repositories/notification.repository';

/** Contador da caixa interna. */
@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(ctx: RequestContext): Promise<UnreadCountDto> {
    return { unread: await this.notifications.countUnread(inboxScope(ctx)) };
  }
}

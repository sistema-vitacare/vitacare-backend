import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { NotificationDto } from '../dtos/notification.dto';
import {
  inboxScope,
  toNotificationResponse,
} from '../parsers/notification.parser';
import { NotificationRepository } from '../repositories/notification.repository';
import type { ListNotificationsQueryDto } from './listNotifications.dto';

/** Caixa interna do usuario, mais recentes primeiro (UC13 passo 5). */
@Injectable()
export class ListNotificationsUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    query: ListNotificationsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<NotificationDto[]>> {
    const { items, total } = await this.notifications.list(inboxScope(ctx), {
      unread: query.unread,
      patientId: query.patientId,
      skip: query.skip,
      take: query.limit,
    });

    return paginate(
      items.map((item) => toNotificationResponse(item, ctx)),
      total,
      query,
    );
  }
}

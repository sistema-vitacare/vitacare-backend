import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { NotificationPreferencesDto } from '../dtos/notificationPreferences.dto';
import { toPreferencesResponse } from '../parsers/notification.parser';
import { NotificationRepository } from '../repositories/notification.repository';

@Injectable()
export class GetNotificationPreferencesUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(ctx: RequestContext): Promise<NotificationPreferencesDto> {
    return toPreferencesResponse(
      await this.notifications.getPreferences(ctx.organizationId, ctx.userId),
      ctx,
    );
  }
}

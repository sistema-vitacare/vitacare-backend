import { Injectable } from '@nestjs/common';

import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from '../dtos/notificationPreferences.dto';
import { NotificationErrors } from '../notification.errors';
import {
  notificationActor,
  toPreferencesResponse,
} from '../parsers/notification.parser';
import { NotificationRepository } from '../repositories/notification.repository';

/**
 * Preferencias de recebimento (UC13): desligar preserva o alerta no
 * historico, so nao notifica. O opt-in da organizacao e so do admin
 * ("Administrador, quando configurado").
 */
@Injectable()
export class UpdateNotificationPreferencesUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    body: UpdateNotificationPreferencesDto,
    ctx: RequestContext,
  ): Promise<NotificationPreferencesDto> {
    if (body.organizationAlerts && ctx.profile !== ProfileCode.ADMIN) {
      throw new DomainException({
        ...NotificationErrors.ORGANIZATION_ALERTS_ADMIN_ONLY,
        detail: 'organizationAlerts = true exige o perfil admin.',
        fields: [{ field: 'organizationAlerts', code: 'ADMIN_ONLY' }],
      });
    }

    return toPreferencesResponse(
      await this.notifications.savePreferences(notificationActor(ctx), {
        organizationAlerts: body.organizationAlerts,
        reading: { ...body.reading },
        absence: { ...body.absence },
        medicationReminder: { ...body.medicationReminder },
      }),
    );
  }
}

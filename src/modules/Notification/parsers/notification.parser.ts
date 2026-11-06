import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { NotificationDto } from '../dtos/notification.dto';
import type { NotificationPreferencesDto } from '../dtos/notificationPreferences.dto';
import type {
  InboxScope,
  NotificationActor,
  NotificationPreferencesRow,
  NotificationRow,
} from '../types/notification.types';

/** Caixa da sessao: o proprio usuario no seu alcance de pacientes. */
export const inboxScope = (ctx: RequestContext): InboxScope => ({
  ...patientScope(ctx),
  userId: ctx.userId,
});

export const notificationActor = (ctx: RequestContext): NotificationActor => ({
  organizationId: ctx.organizationId,
  userId: ctx.userId,
  requestId: ctx.requestId,
});

/**
 * Notificacao -> resposta, igual para todos os perfis: o familiar le o alerta
 * completo (BE-19, decisao de 2026-11-06).
 */
export const toNotificationResponse = (
  row: NotificationRow,
  _ctx: RequestContext,
): NotificationDto => ({
  id: row.id,
  alert: {
    ...row.alert,
    generatedAt: row.alert.generatedAt.toISOString(),
  },
  reason: row.reason,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** O opt-in so vale para admin: rebaixado, aparece desligado. */
export const toPreferencesResponse = (
  row: NotificationPreferencesRow,
  ctx: RequestContext,
): NotificationPreferencesDto => ({
  organizationAlerts:
    row.organizationAlerts && ctx.profile === ProfileCode.ADMIN,
  reading: { ...row.reading },
  absence: { ...row.absence },
  medicationReminder: { ...row.medicationReminder },
  updatedAt: row.updatedAt?.toISOString() ?? null,
});

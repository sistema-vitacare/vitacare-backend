import type { AlertSource } from '@/modules/Alert/types/alert.types';

/** Canais decididos por Mateus em 2026-11-06. */
export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Canais com envio para fora do sistema; a caixa interna e a propria notificacao. */
export const DELIVERY_CHANNELS = ['push', 'email'] as const;

export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export const DELIVERY_STATUSES = [
  'pending',
  'sent',
  'failed',
  'skipped',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Vinculo autorizado com o paciente ou opt-in do admin. */
export const NOTIFICATION_REASONS = [
  'patient_link',
  'organization_admin',
] as const;

export type NotificationReason = (typeof NOTIFICATION_REASONS)[number];

export const PUSH_REVOKED_REASONS = ['user', 'replaced', 'expired'] as const;

export type PushRevokedReason = (typeof PUSH_REVOKED_REASONS)[number];

/** Coluna de `notification_preferences` de cada origem x canal. */
export const PREFERENCE_COLUMNS: Readonly<
  Record<AlertSource, Readonly<Record<NotificationChannel, string>>>
> = {
  reading: {
    in_app: 'reading_in_app',
    push: 'reading_push',
    email: 'reading_email',
  },
  absence: {
    in_app: 'absence_in_app',
    push: 'absence_push',
    email: 'absence_email',
  },
  medication_reminder: {
    in_app: 'medication_reminder_in_app',
    push: 'medication_reminder_push',
    email: 'medication_reminder_email',
  },
};

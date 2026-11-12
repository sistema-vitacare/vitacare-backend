import { BullModule } from '@nestjs/bullmq';
import { Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DisabledChannelSender } from './channels/disabledChannel.sender';
import { EMAIL_SENDER, type EmailSender } from './channels/emailSender';
import { PUSH_SENDER, type PushSender } from './channels/pushSender';
import { SmtpNotificationMailer } from './channels/smtpNotification.mailer';
import { WebPushSender } from './channels/webPush.sender';
import { DeliverNotificationsUseCase } from './DeliverNotifications/deliverNotifications.useCase';
import { AlertNotification } from './entities/alertNotification.entity';
import { NotificationDelivery } from './entities/notificationDelivery.entity';
import { NotificationPreference } from './entities/notificationPreference.entity';
import { PushSubscription } from './entities/pushSubscription.entity';
import {
  NOTIFICATIONS_QUEUE,
  NotificationProcessor,
} from './notification.processor';
import { NotificationDeliveryRepository } from './repositories/notificationDelivery.repository';
import { NotificationController } from './notification.controller';
import { CountUnreadNotificationsUseCase } from './CountUnreadNotifications/countUnreadNotifications.useCase';
import { GetNotificationPreferencesUseCase } from './GetNotificationPreferences/getNotificationPreferences.useCase';
import { GetPushConfigUseCase } from './GetPushConfig/getPushConfig.useCase';
import { ListNotificationsUseCase } from './ListNotifications/listNotifications.useCase';
import { ReadAllNotificationsUseCase } from './ReadAllNotifications/readAllNotifications.useCase';
import { ReadNotificationUseCase } from './ReadNotification/readNotification.useCase';
import { RegisterPushSubscriptionUseCase } from './RegisterPushSubscription/registerPushSubscription.useCase';
import { NotificationRepository } from './repositories/notification.repository';
import { RevokePushSubscriptionUseCase } from './RevokePushSubscription/revokePushSubscription.useCase';
import { UpdateNotificationPreferencesUseCase } from './UpdateNotificationPreferences/updateNotificationPreferences.useCase';

export const NOTIFICATION_USE_CASES = [
  ListNotificationsUseCase,
  CountUnreadNotificationsUseCase,
  ReadNotificationUseCase,
  ReadAllNotificationsUseCase,
  GetNotificationPreferencesUseCase,
  UpdateNotificationPreferencesUseCase,
  GetPushConfigUseCase,
  RegisterPushSubscriptionUseCase,
  RevokePushSubscriptionUseCase,
];

export const NOTIFICATION_REPOSITORIES = [NotificationRepository];

/**
 * E-mail pelo SMTP do projeto; desligado (`SMTP_ENABLED=false`), nada sai e a
 * entrega fica `skipped`. Tambem usado pelo aviso de vencimento (BE-28).
 */
export const emailSenderProvider: Provider = {
  provide: EMAIL_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): EmailSender =>
    config.get<boolean>('mail.enabled')
      ? new SmtpNotificationMailer(config)
      : new DisabledChannelSender(),
};

/** Canal sem configuracao vira o desligado, como o mailer da recuperacao. */
export const notificationChannelProviders: Provider[] = [
  {
    provide: PUSH_SENDER,
    inject: [ConfigService],
    useFactory: (config: ConfigService): PushSender =>
      config.get<boolean>('notification.pushEnabled')
        ? new WebPushSender(config)
        : new DisabledChannelSender(),
  },
  emailSenderProvider,
];

/**
 * Destinatarios, preferencias, entrega e leitura dos alertas (BE-17). Os
 * destinatarios nascem na transacao que grava o alerta
 * (`insertAlertNotifications`); a entrega por push e e-mail sai da fila
 * `notifications`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationPreference,
      AlertNotification,
      PushSubscription,
      NotificationDelivery,
    ]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  controllers: [NotificationController],
  providers: [
    ...notificationChannelProviders,
    ...NOTIFICATION_USE_CASES,
    ...NOTIFICATION_REPOSITORIES,
    NotificationDeliveryRepository,
    DeliverNotificationsUseCase,
    NotificationProcessor,
  ],
})
export class NotificationModule {}

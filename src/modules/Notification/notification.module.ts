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
  {
    provide: EMAIL_SENDER,
    inject: [ConfigService],
    useFactory: (config: ConfigService): EmailSender =>
      config.get<boolean>('mail.enabled')
        ? new SmtpNotificationMailer(config)
        : new DisabledChannelSender(),
  },
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
  providers: [
    ...notificationChannelProviders,
    NotificationDeliveryRepository,
    DeliverNotificationsUseCase,
    NotificationProcessor,
  ],
})
export class NotificationModule {}

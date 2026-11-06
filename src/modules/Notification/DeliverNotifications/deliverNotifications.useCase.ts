import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { DeliveryResult } from '../channels/deliveryResult.type';
import { EMAIL_SENDER, type EmailSender } from '../channels/emailSender';
import { PUSH_SENDER, type PushSender } from '../channels/pushSender';
import { notificationMessage } from '../policies/notificationMessage.policy';
import {
  type ClaimedDelivery,
  NotificationDeliveryRepository,
} from '../repositories/notificationDelivery.repository';

const BATCH = 50;

export interface DeliveryCount {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

/**
 * Envia por push e e-mail as entregas vencidas (UC13 passo 3). Nao promete
 * exatamente uma vez: uma queda entre o envio e a gravacao repete o envio
 * depois da reserva. O log leva so id, canal e codigo.
 */
@Injectable()
export class DeliverNotificationsUseCase {
  private readonly logger = new Logger(DeliverNotificationsUseCase.name);

  constructor(
    private readonly deliveries: NotificationDeliveryRepository,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly config: ConfigService,
  ) {}

  async execute(): Promise<DeliveryCount> {
    const { claimed, skipped } = await this.deliveries.claimDue(BATCH);
    const count: DeliveryCount = { sent: 0, retried: 0, failed: 0, skipped };

    await Promise.all(
      claimed.map(async (delivery) => {
        const result = await this.send(delivery);

        try {
          await this.deliveries.complete(delivery, result);
        } catch (error) {
          this.logger.error(
            `Resultado da entrega ${delivery.id} (${delivery.channel}) nao gravado; ela volta depois da reserva.`,
            error instanceof Error ? error.stack : String(error),
          );
        }

        this.tally(count, delivery, result);
      }),
    );

    return count;
  }

  private async send(delivery: ClaimedDelivery): Promise<DeliveryResult> {
    const message = notificationMessage({
      source: delivery.source,
      severity: delivery.severity,
      patientName: delivery.patientName,
      appUrl: this.config.get<string>('notification.appUrl'),
    });

    try {
      if (delivery.channel === 'email') {
        return await this.email.send({
          to: delivery.email,
          subject: message.subject,
          text: message.text,
        });
      }

      const { endpoint, p256dh, auth } = delivery.subscription!;

      return await this.push.send(
        { endpoint, p256dh, auth },
        JSON.stringify({
          title: message.title,
          body: message.body,
          notificationId: delivery.notificationId,
          alertId: delivery.alertId,
          url: message.url,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Erro inesperado na entrega ${delivery.id} (${delivery.channel}).`,
        error instanceof Error ? error.stack : String(error),
      );

      return { kind: 'retry', code: 'UNEXPECTED' };
    }
  }

  private tally(
    count: DeliveryCount,
    delivery: ClaimedDelivery,
    result: DeliveryResult,
  ): void {
    if (result.kind === 'sent') {
      count.sent += 1;
      return;
    }
    if (result.kind === 'disabled') {
      count.skipped += 1;
      return;
    }

    this.logger.warn(
      `Entrega ${delivery.id} (${delivery.channel}) sem sucesso: ${result.code}.`,
    );
    if (result.kind === 'retry') count.retried += 1;
    else count.failed += 1;
  }
}

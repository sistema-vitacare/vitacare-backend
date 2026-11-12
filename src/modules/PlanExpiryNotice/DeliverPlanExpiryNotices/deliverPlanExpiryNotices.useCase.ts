import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '@/modules/Notification/channels/emailSender';

import { planExpiryEmail } from '../policies/planExpiryEmail.policy';
import {
  type ClaimedNoticeDelivery,
  PlanExpiryNoticeDeliveryRepository,
} from '../repositories/planExpiryNoticeDelivery.repository';
import type { NoticeDeliveryCount } from '../types/planExpiryNotice.types';

const BATCH = 50;

/**
 * Envia pelo SMTP do projeto os e-mails de aviso vencidos (BE-28), com a
 * politica de tentativas do BE-17. SMTP desligado: cada e-mail fica `skipped`
 * com `CHANNEL_DISABLED`, sem erro. Nao promete exatamente uma vez: uma queda
 * entre o envio e a gravacao repete o envio depois da reserva. O log leva so
 * id e codigo, nunca o endereco.
 */
@Injectable()
export class DeliverPlanExpiryNoticesUseCase {
  private readonly logger = new Logger(DeliverPlanExpiryNoticesUseCase.name);

  constructor(
    private readonly deliveries: PlanExpiryNoticeDeliveryRepository,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly config: ConfigService,
  ) {}

  async execute(): Promise<NoticeDeliveryCount> {
    const count: NoticeDeliveryCount = {
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      nextAttemptAt: null,
    };

    for (;;) {
      const { claimed, skipped } = await this.deliveries.claimDue(BATCH);

      count.skipped += skipped;
      await Promise.all(
        claimed.map(async (delivery) => {
          const result = await this.send(delivery);

          try {
            await this.deliveries.complete(delivery, result);
          } catch (error) {
            this.logger.error(
              `Resultado do aviso de vencimento ${delivery.id} nao gravado; ele volta depois da reserva.`,
              error instanceof Error ? error.stack : String(error),
            );
          }

          this.tally(count, delivery, result);
        }),
      );

      if (claimed.length + skipped < BATCH) break;
    }

    count.nextAttemptAt = await this.deliveries.nextAttemptAt();

    return count;
  }

  private async send(delivery: ClaimedNoticeDelivery): Promise<DeliveryResult> {
    const message = planExpiryEmail({
      milestone: delivery.milestone,
      termEndsAt: new Date(delivery.termEndsAt),
      organizationName: delivery.organizationName,
      planName: delivery.planName,
      now: new Date(),
      appUrl: this.config.get<string>('notification.appUrl'),
    });

    try {
      return await this.email.send({
        to: delivery.email,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      this.logger.error(
        `Erro inesperado no aviso de vencimento ${delivery.id}.`,
        error instanceof Error ? error.stack : String(error),
      );

      return { kind: 'retry', code: 'UNEXPECTED' };
    }
  }

  private tally(
    count: NoticeDeliveryCount,
    delivery: ClaimedNoticeDelivery,
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
      `Aviso de vencimento ${delivery.id} sem sucesso: ${result.code}.`,
    );
    if (result.kind === 'retry') count.retried += 1;
    else count.failed += 1;
  }
}

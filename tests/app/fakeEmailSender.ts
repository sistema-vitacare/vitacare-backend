import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import type {
  EmailMessage,
  EmailSender,
} from '@/modules/Notification/channels/emailSender';

export const INVITATION_SUBJECT = 'Convite para acessar o VitaCare';

/**
 * Porta SMTP falsa (BE-31): guarda as mensagens aceitas e devolve o resultado
 * da fila `results` (padrao `sent`). Desligada, responde como o canal
 * desligado do projeto, sem guardar nada.
 */
export class FakeEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  readonly results: DeliveryResult[] = [];

  constructor(public enabled = true) {}

  send(message: EmailMessage): Promise<DeliveryResult> {
    if (!this.enabled) return Promise.resolve({ kind: 'disabled' });

    const result = this.results.shift() ?? { kind: 'sent' };

    if (result.kind === 'sent') this.messages.push(message);

    return Promise.resolve(result);
  }

  invitations(): EmailMessage[] {
    return this.messages.filter((m) => m.subject === INVITATION_SUBJECT);
  }

  /** Token do link do convite mais recente enviado a `email`. */
  tokenFor(email: string): string {
    const message = this.invitations()
      .filter((m) => m.to === email)
      .at(-1);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];

    if (!link) throw new Error(`Nenhum convite capturado para ${email}.`);

    return new URL(link).searchParams.get('token')!;
  }
}

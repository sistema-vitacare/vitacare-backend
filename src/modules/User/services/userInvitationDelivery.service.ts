import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DomainException } from '@/common/errors/domain.exception';
import { UserInvitationRepository } from '@/modules/Auth/repositories/userInvitation.repository';
import { TokenService } from '@/modules/Auth/security/token.service';
import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '@/modules/Notification/channels/emailSender';

import { invitationEmail } from '../policies/invitationEmail.policy';
import type {
  InvitationChannel,
  InvitationMailContext,
  UserActor,
} from '../types/user.types';
import { UserErrors } from '../user.errors';

export type InvitationDeliveryStatus = 'sent' | 'failed';

export interface InvitationDispatch {
  actor: UserActor;
  mail: InvitationMailContext;
  rawToken: string;
  expiresAt: Date;
}

/**
 * Canal e envio do convite por e-mail (BE-31), comum ao cadastro e a
 * reemissao. O envio acontece depois do commit; "enviado" quer dizer aceito
 * pelo servidor SMTP. Qualquer resultado diferente disso revoga o link na
 * hora, para nunca sobrar link valido que ninguem recebeu. O log leva so ids e
 * o codigo do SMTP, nunca endereco nem token.
 */
@Injectable()
export class UserInvitationDeliveryService {
  private readonly logger = new Logger(UserInvitationDeliveryService.name);

  constructor(
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly invitations: UserInvitationRepository,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  /** Sem pedido explicito, o canal segue o SMTP configurado. */
  resolveChannel(requested?: InvitationChannel): InvitationChannel {
    if (requested === 'email' && !this.email.enabled) {
      throw new DomainException({
        ...UserErrors.INVITATION_EMAIL_UNAVAILABLE,
        detail: 'Canal email pedido com o SMTP desligado.',
        fields: [{ field: 'channel', code: 'UNAVAILABLE' }],
      });
    }

    return requested ?? (this.email.enabled ? 'email' : 'temporary_password');
  }

  issueToken(): { raw: string; hash: string; expiresAt: Date } {
    const seconds = this.config.getOrThrow<number>('auth.invitationSeconds');

    return {
      ...this.tokens.issue(),
      expiresAt: new Date(Date.now() + seconds * 1000),
    };
  }

  async deliver(
    dispatch: InvitationDispatch,
  ): Promise<InvitationDeliveryStatus> {
    const record = {
      invitationId: dispatch.mail.invitationId,
      organizationId: dispatch.actor.organizationId,
      userId: dispatch.mail.userId,
      actorUserId: dispatch.actor.actorUserId,
      requestId: dispatch.actor.requestId,
      expiresAt: dispatch.expiresAt,
    };

    const result = await this.send(dispatch);
    const status: InvitationDeliveryStatus =
      result.kind === 'sent' ? 'sent' : 'failed';

    try {
      if (status === 'sent') {
        await this.invitations.recordSent(record);
      } else {
        this.logger.warn(
          `Convite ${record.invitationId} nao enviado: ${'code' in result ? result.code : result.kind}`,
        );
        await this.invitations.recordSendFailure(record);
      }
    } catch (error) {
      // O token nunca saiu da API sem o envio aceito: ninguem o tem.
      this.logger.error(
        `Falha ao registrar o resultado do convite ${record.invitationId}: ${(error as Error).name}`,
      );
    }

    return status;
  }

  private async send(dispatch: InvitationDispatch): Promise<DeliveryResult> {
    try {
      const acceptUrl = new URL(
        this.config.getOrThrow<string>('mail.invitationAcceptUrl'),
      );

      acceptUrl.searchParams.set('token', dispatch.rawToken);

      return await this.email.send(
        invitationEmail({
          to: dispatch.mail.email,
          userName: dispatch.mail.userName,
          organizationName: dispatch.mail.organizationName,
          organizationCode: dispatch.mail.organizationCode,
          inviterName: dispatch.mail.inviterName,
          profileName: dispatch.mail.profileName,
          acceptUrl: acceptUrl.toString(),
          expiresAt: dispatch.expiresAt,
        }),
      );
    } catch {
      return { kind: 'failed', code: 'SMTP_UNEXPECTED' };
    }
  }
}

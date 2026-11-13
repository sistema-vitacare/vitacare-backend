import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { generateTemporaryPassword } from '@/modules/Auth/security/temporaryPassword';
import { formatBrazilDateTime } from '@/modules/Plan/policies/planExpiry.policy';

import type { UserInvitationResponseDto } from '../dtos/user.dto';
import type {
  InvitationChannel,
  InvitationIssue,
  InvitationMailContext,
  UserActor,
} from '../types/user.types';
import { UserInvitationDeliveryService } from './userInvitationDelivery.service';

/** Segredo cru de um convite: so sai na resposta (senha) ou no e-mail (token). */
export interface IssuedInvitation {
  invitation: InvitationIssue;
  secret: string;
}

export const INVITATION_SENT_MESSAGE = (expiresAt: Date): string =>
  `Convite enviado ao e-mail do usuário. O link vale até ${formatBrazilDateTime(expiresAt)} (horário de Brasília).`;

export const INVITATION_FAILED_MESSAGE =
  'Não foi possível enviar o convite por e-mail. Reemita o convite ou gere uma senha provisória.';

/**
 * Passos comuns ao cadastro e a reemissao (BE-31): antes da transacao, gera o
 * segredo do canal; depois do commit, envia o e-mail e monta a resposta. A
 * resposta do canal `email` nunca leva senha.
 */
@Injectable()
export class InvitationIssuer {
  constructor(
    private readonly delivery: UserInvitationDeliveryService,
    private readonly passwords: PasswordHasher,
    private readonly config: ConfigService,
  ) {}

  async issue(requested?: InvitationChannel): Promise<IssuedInvitation> {
    const channel = this.delivery.resolveChannel(requested);

    if (channel === 'email') {
      const token = this.delivery.issueToken();

      return {
        invitation: {
          channel,
          tokenHash: token.hash,
          expiresAt: token.expiresAt,
        },
        secret: token.raw,
      };
    }

    const temporaryPassword = generateTemporaryPassword();

    return {
      invitation: {
        channel,
        passwordHash: await this.passwords.hash(temporaryPassword),
        expiresAt: new Date(
          Date.now() +
            this.config.getOrThrow<number>('auth.temporaryPasswordSeconds') *
              1000,
        ),
      },
      secret: temporaryPassword,
    };
  }

  async complete(
    issued: IssuedInvitation,
    mail: InvitationMailContext | null,
    actor: UserActor,
  ): Promise<{ response: UserInvitationResponseDto; message: string | null }> {
    const { invitation } = issued;
    const expiresAt = invitation.expiresAt.toISOString();

    if (invitation.channel === 'temporary_password') {
      return {
        response: {
          channel: 'temporary_password',
          temporaryPassword: issued.secret,
          expiresAt,
        },
        message: null,
      };
    }

    // O token cru nunca vira senha na resposta, nem neste caso impossivel.
    if (mail === null) {
      throw new Error('Convite por link gravado sem os dados do e-mail.');
    }

    const status = await this.delivery.deliver({
      actor,
      mail,
      rawToken: issued.secret,
      expiresAt: invitation.expiresAt,
    });

    return {
      response: { channel: 'email', expiresAt, delivery: { status } },
      message:
        status === 'sent'
          ? INVITATION_SENT_MESSAGE(invitation.expiresAt)
          : INVITATION_FAILED_MESSAGE,
    };
  }
}

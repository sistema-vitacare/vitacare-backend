import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { generateTemporaryPassword } from '@/modules/Auth/security/temporaryPassword';

import type { UserInvitationResponseDto } from '../dtos/user.dto';
import { UserRepository } from '../repositories/user.repository';
import { UserErrors } from '../user.errors';

/**
 * Reenvio do convite: so para quem ainda esta `pending`, vencido ou nao. Cada
 * emissao troca a senha provisoria e o prazo, entao a anterior para de valer.
 */
@Injectable()
export class ReissueUserInvitationUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly config: ConfigService,
  ) {}

  async execute(
    userId: string,
    ctx: RequestContext,
  ): Promise<UserInvitationResponseDto> {
    const temporaryPassword = generateTemporaryPassword();
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('auth.temporaryPasswordSeconds') * 1000,
    );

    const outcome = await this.users.reissueInvitation({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      targetUserId: userId,
      passwordHash: await this.passwords.hash(temporaryPassword),
      expiresAt,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...UserErrors.NOT_FOUND,
          detail: 'Usuário inexistente ou fora da organização.',
        });

      case 'already_accepted':
        throw new DomainException({
          ...UserErrors.INVITATION_ALREADY_ACCEPTED,
          detail: 'O convite já foi aceito no primeiro acesso.',
        });

      case 'inactive':
        throw new DomainException({
          ...UserErrors.INACTIVE,
          detail: 'Convite não é reemitido para usuário inativo.',
        });

      case 'actor_forbidden':
        throw new DomainException({
          ...AuthErrors.FORBIDDEN,
          detail: 'O ator deixou de ser administrador ativo antes do reenvio.',
        });

      default:
        return { temporaryPassword, expiresAt: expiresAt.toISOString() };
    }
  }
}

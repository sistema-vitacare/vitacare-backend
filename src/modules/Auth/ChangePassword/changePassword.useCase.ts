import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { AuthIdentityRepository } from '../repositories/authIdentity.repository';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { PasswordHasher } from '../security/passwordHasher';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly identities: AuthIdentityRepository,
    private readonly passwords: PasswordHasher,
    private readonly transactions: AuthTransactionRepository,
  ) {}

  /**
   * Troca voluntaria da propria senha. O usuario efetivo vem da sessao, nunca
   * do corpo, e a gravacao revoga todas as sessoes da conta: trocar a senha
   * derruba os outros dispositivos.
   */
  async execute(
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<null> {
    const currentHash = await this.identities.findPasswordHash(
      ctx.userId,
      ctx.organizationId,
    );

    const currentMatches =
      currentHash !== null &&
      (await this.passwords.verify(currentHash, input.currentPassword));

    if (!currentMatches) {
      throw new DomainException({
        ...AuthErrors.CURRENT_PASSWORD_INVALID,
        detail: 'A senha atual não confere.',
      });
    }

    if (await this.passwords.verify(currentHash, input.newPassword)) {
      throw new DomainException({
        ...AuthErrors.PASSWORD_REUSE,
        detail: 'A nova senha coincide com a senha vigente.',
      });
    }

    const changed = await this.transactions.changePassword({
      ...ctx,
      passwordHash: await this.passwords.hash(input.newPassword),
      action: 'auth.password_changed',
    });

    if (!changed) {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'A conta não está mais ativa.',
      });
    }

    return null;
  }
}

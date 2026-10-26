import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { AuthIdentityRepository } from '../repositories/authIdentity.repository';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { PasswordHasher } from '../security/passwordHasher';

export interface CompleteFirstAccessInput {
  newPassword: string;
  sessionId: string;
}

@Injectable()
export class CompleteFirstAccessUseCase {
  constructor(
    private readonly identities: AuthIdentityRepository,
    private readonly passwords: PasswordHasher,
    private readonly transactions: AuthTransactionRepository,
  ) {}

  /**
   * Troca obrigatoria da primeira senha. A sessao restrita e consumida junto
   * com a gravacao, na mesma transacao: ou a senha muda e o desafio morre, ou
   * nada acontece.
   */
  async execute(
    input: CompleteFirstAccessInput,
    ctx: RequestContext,
  ): Promise<null> {
    const currentHash = await this.identities.findPasswordHash(
      ctx.userId,
      ctx.organizationId,
    );

    if (
      currentHash &&
      (await this.passwords.verify(currentHash, input.newPassword))
    ) {
      throw new DomainException({
        ...AuthErrors.PASSWORD_REUSE,
        detail: 'A nova senha coincide com a senha provisória.',
      });
    }

    const completed = await this.transactions.completeFirstAccess({
      ...ctx,
      sessionId: input.sessionId,
      passwordHash: await this.passwords.hash(input.newPassword),
    });

    if (!completed) {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Desafio de primeiro acesso inválido.',
      });
    }

    return null;
  }
}

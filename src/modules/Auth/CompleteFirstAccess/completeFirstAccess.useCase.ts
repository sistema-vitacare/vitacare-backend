import { Injectable } from '@nestjs/common';
import { DomainException } from '@/common/errors/domain.exception';
import type { RequestContext } from '@/common/context/requestContext.type';
import { AuthErrors } from '../auth.errors';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { PasswordHasher } from '../security/passwordHasher';

@Injectable()
export class CompleteFirstAccessUseCase {
  constructor(
    private readonly passwords: PasswordHasher,
    private readonly transactions: AuthTransactionRepository,
  ) {}

  async execute(
    input: { newPassword: string; sessionId: string },
    ctx: RequestContext,
  ): Promise<null> {
    const passwordHash = await this.passwords.hash(input.newPassword);
    const completed = await this.transactions.completeFirstAccess({
      ...ctx,
      sessionId: input.sessionId,
      passwordHash,
    });
    if (!completed)
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Desafio de primeiro acesso inválido.',
      });
    return null;
  }
}

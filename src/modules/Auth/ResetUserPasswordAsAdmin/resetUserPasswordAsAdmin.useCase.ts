import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '../auth.errors';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { PasswordHasher } from '../security/passwordHasher';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const generateTemporaryPassword = (): string =>
  Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join(
    '',
  );

@Injectable()
export class ResetUserPasswordAsAdminUseCase {
  constructor(
    private readonly passwords: PasswordHasher,
    private readonly transactions: AuthTransactionRepository,
    private readonly generatePassword: () => string = generateTemporaryPassword,
  ) {}
  async execute(
    input: { userId: string },
    ctx: RequestContext,
  ): Promise<{ temporaryPassword: string }> {
    if (input.userId === ctx.userId)
      throw new DomainException({
        ...AuthErrors.INVALID_STATE,
        detail:
          'A redefinição administrativa não pode atingir a própria conta.',
      });
    const temporaryPassword = this.generatePassword();
    const result = await this.transactions.resetUserPasswordAsAdmin({
      targetUserId: input.userId,
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      passwordHash: await this.passwords.hash(temporaryPassword),
      requestId: ctx.requestId,
    });
    if (result !== 'updated')
      throw new DomainException({
        ...AuthErrors.USER_NOT_FOUND,
        detail: 'Usuário inexistente ou fora da organização.',
      });
    return { temporaryPassword };
  }
}

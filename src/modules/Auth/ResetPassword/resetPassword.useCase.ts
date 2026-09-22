import { Injectable } from '@nestjs/common';

import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { PasswordResetRepository } from '../repositories/passwordReset.repository';
import { PasswordHasher } from '../security/passwordHasher';
import { TokenService } from '../security/token.service';

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly resets: PasswordResetRepository,
  ) {}

  /**
   * Consome o token de recuperacao. Token inexistente, expirado, ja consumido
   * ou revogado respondem igual: quem tenta adivinhar nao aprende nada sobre a
   * conta. Duas submissoes simultaneas do mesmo token: so uma vence.
   */
  async execute(input: ResetPasswordInput): Promise<null> {
    const reset = await this.resets.consumeAndReset(
      this.tokens.hash(input.token),
      await this.passwords.hash(input.newPassword),
    );

    if (!reset) {
      throw new DomainException({
        ...AuthErrors.RESET_TOKEN_INVALID_OR_EXPIRED,
        detail: 'Token inexistente, expirado, consumido ou revogado.',
      });
    }

    return null;
  }
}

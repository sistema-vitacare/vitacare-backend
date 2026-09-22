import { Injectable } from '@nestjs/common';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '../auth.errors';
import { PasswordResetRepository } from '../repositories/passwordReset.repository';
import { PasswordHasher } from '../security/passwordHasher';
import { TokenService } from '../security/token.service';
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly resets: PasswordResetRepository,
  ) {}
  async execute(input: { token: string; newPassword: string }): Promise<null> {
    const reset = await this.resets.consumeAndReset(
      this.tokens.hash(input.token),
      await this.passwords.hash(input.newPassword),
    );
    if (!reset)
      throw new DomainException({
        ...AuthErrors.RESET_TOKEN_INVALID_OR_EXPIRED,
        detail: 'Token inexistente, expirado, consumido ou revogado.',
      });
    return null;
  }
}

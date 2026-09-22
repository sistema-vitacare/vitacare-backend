import { Test } from '@nestjs/testing';
import { AuthTransactionRepository } from '@/modules/Auth/repositories/authTransaction.repository';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { ResetUserPasswordAsAdminUseCase } from '@/modules/Auth/ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';

describe('ResetUserPasswordAsAdminUseCase DI', () => {
  it('é resolvido pelo container Nest sem token Function', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ResetUserPasswordAsAdminUseCase,
        { provide: PasswordHasher, useValue: {} },
        { provide: AuthTransactionRepository, useValue: {} },
      ],
    }).compile();
    expect(module.get(ResetUserPasswordAsAdminUseCase)).toBeInstanceOf(
      ResetUserPasswordAsAdminUseCase,
    );
  });
});

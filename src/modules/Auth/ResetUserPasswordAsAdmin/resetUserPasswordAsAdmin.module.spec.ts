import { Test } from '@nestjs/testing';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { PasswordHasher } from '../security/passwordHasher';
import { ResetUserPasswordAsAdminUseCase } from './resetUserPasswordAsAdmin.useCase';

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

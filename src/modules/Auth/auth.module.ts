import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthIdentityRepository } from './repositories/authIdentity.repository';
import { AuthSessionRepository } from './repositories/authSession.repository';
import { AuthRateLimiter } from './security/authRateLimiter';
import { PasswordHasher } from './security/passwordHasher';
import { TokenService } from './security/token.service';
import { LoginUseCase } from './Login/login.useCase';

@Global()
@Module({
  providers: [
    LoginUseCase,
    AuthIdentityRepository,
    AuthSessionRepository,
    AuthRateLimiter,
    PasswordHasher,
    TokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [
    AuthIdentityRepository,
    AuthSessionRepository,
    PasswordHasher,
    TokenService,
  ],
})
export class AuthModule {}

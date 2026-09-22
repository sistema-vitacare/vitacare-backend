import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthIdentityRepository } from './repositories/authIdentity.repository';
import { AuthSessionRepository } from './repositories/authSession.repository';
import { AuthTransactionRepository } from './repositories/authTransaction.repository';
import { AuthRateLimiter } from './security/authRateLimiter';
import { PasswordHasher } from './security/passwordHasher';
import { TokenService } from './security/token.service';
import { LoginUseCase } from './Login/login.useCase';
import { AuthController } from './auth.controller';
import { CompleteFirstAccessUseCase } from './CompleteFirstAccess/completeFirstAccess.useCase';
import { LogoutUseCase } from './Logout/logout.useCase';
import { ChangePasswordUseCase } from './ChangePassword/changePassword.useCase';
import { RequestPasswordRecoveryUseCase } from './RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordUseCase } from './ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminUseCase } from './ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';
import { PasswordResetRepository } from './repositories/passwordReset.repository';
import { DisabledPasswordRecoveryMailer } from './mail/disabledPasswordRecovery.mailer';
import { SmtpPasswordRecoveryMailer } from './mail/smtpPasswordRecovery.mailer';
import { PASSWORD_RECOVERY_MAILER } from './mail/passwordRecoveryMailer';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    CompleteFirstAccessUseCase,
    LogoutUseCase,
    ChangePasswordUseCase,
    RequestPasswordRecoveryUseCase,
    ResetPasswordUseCase,
    ResetUserPasswordAsAdminUseCase,
    AuthIdentityRepository,
    AuthSessionRepository,
    AuthTransactionRepository,
    PasswordResetRepository,
    DisabledPasswordRecoveryMailer,
    SmtpPasswordRecoveryMailer,
    {
      provide: PASSWORD_RECOVERY_MAILER,
      inject: [
        ConfigService,
        DisabledPasswordRecoveryMailer,
        SmtpPasswordRecoveryMailer,
      ],
      useFactory: (
        config: ConfigService,
        disabled: DisabledPasswordRecoveryMailer,
        smtp: SmtpPasswordRecoveryMailer,
      ) => (config.get<boolean>('mail.enabled') ? smtp : disabled),
    },
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

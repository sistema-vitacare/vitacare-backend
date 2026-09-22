import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';
import { ChangePasswordUseCase } from './ChangePassword/changePassword.useCase';
import { CompleteFirstAccessUseCase } from './CompleteFirstAccess/completeFirstAccess.useCase';
import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { LoginUseCase } from './Login/login.useCase';
import { LogoutUseCase } from './Logout/logout.useCase';
import { DisabledPasswordRecoveryMailer } from './mail/disabledPasswordRecovery.mailer';
import { PASSWORD_RECOVERY_MAILER } from './mail/passwordRecoveryMailer';
import { SmtpPasswordRecoveryMailer } from './mail/smtpPasswordRecovery.mailer';
import { AuthIdentityRepository } from './repositories/authIdentity.repository';
import { AuthSessionRepository } from './repositories/authSession.repository';
import { AuthTransactionRepository } from './repositories/authTransaction.repository';
import { PasswordResetRepository } from './repositories/passwordReset.repository';
import { RequestPasswordRecoveryUseCase } from './RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordUseCase } from './ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminUseCase } from './ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';
import { AuthRateLimiter } from './security/authRateLimiter';
import { PasswordHasher } from './security/passwordHasher';
import { TokenService } from './security/token.service';

/**
 * Sem SMTP configurado a aplicacao sobe com o mailer desabilitado: deploy nao
 * pode depender de e-mail, e a recuperacao responde igual nos dois casos.
 */
const passwordRecoveryMailerProvider = {
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
};

/**
 * Modulo global: os guards de autenticacao e permissao valem para toda rota
 * que nao se declarar `@Public()`.
 */
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
    passwordRecoveryMailerProvider,

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

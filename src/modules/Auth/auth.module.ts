import { Global, Module, type Provider } from '@nestjs/common';
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
import {
  PASSWORD_RECOVERY_MAILER,
  type PasswordRecoveryMailer,
} from './mail/passwordRecoveryMailer';
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
 *
 * O transporte SMTP e construido **dentro** da factory, e nao registrado como
 * provider proprio: registrado, o Nest o instanciaria sempre, e o construtor
 * dele exige `mail.host`/`mail.from`. Era isso que derrubava o boot em
 * ambiente sem e-mail.
 */
export const passwordRecoveryMailerProviders: Provider[] = [
  {
    provide: PASSWORD_RECOVERY_MAILER,
    inject: [ConfigService],
    useFactory: (config: ConfigService): PasswordRecoveryMailer =>
      config.get<boolean>('mail.enabled')
        ? new SmtpPasswordRecoveryMailer(config)
        : new DisabledPasswordRecoveryMailer(),
  },
];

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

    ...passwordRecoveryMailerProviders,

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

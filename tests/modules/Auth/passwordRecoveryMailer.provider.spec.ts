import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { passwordRecoveryMailerProviders } from '@/modules/Auth/auth.module';
import { DisabledPasswordRecoveryMailer } from '@/modules/Auth/mail/disabledPasswordRecovery.mailer';
import {
  PASSWORD_RECOVERY_MAILER,
  type PasswordRecoveryMailer,
} from '@/modules/Auth/mail/passwordRecoveryMailer';
import { SmtpPasswordRecoveryMailer } from '@/modules/Auth/mail/smtpPasswordRecovery.mailer';

/** ConfigService real: chave ausente lanca em `getOrThrow`, como em producao. */
const configWith = (settings: Record<string, unknown>) => ({
  get: (key: string) => settings[key],
  getOrThrow: (key: string) => {
    if (!(key in settings)) {
      throw new TypeError(`Configuration key "${key}" does not exist`);
    }

    return settings[key];
  },
});

const resolveMailer = async (
  settings: Record<string, unknown>,
): Promise<PasswordRecoveryMailer> => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: ConfigService, useValue: configWith(settings) },
      ...passwordRecoveryMailerProviders,
    ],
  }).compile();

  return moduleRef.get<PasswordRecoveryMailer>(PASSWORD_RECOVERY_MAILER);
};

describe('provider do mailer de recuperacao', () => {
  it('sobe sem nenhuma variavel de SMTP configurada', async () => {
    const mailer = await resolveMailer({ 'mail.enabled': false });

    expect(mailer).toBeInstanceOf(DisabledPasswordRecoveryMailer);
    expect(mailer.enabled).toBe(false);
  });

  it('constroi o transporte SMTP apenas quando habilitado', async () => {
    const mailer = await resolveMailer({
      'mail.enabled': true,
      'mail.host': 'smtp.example.test',
      'mail.port': 587,
      'mail.secure': false,
      'mail.from': 'no-reply@example.test',
      'mail.connectionTimeoutMs': 10000,
      'mail.greetingTimeoutMs': 10000,
      'mail.socketTimeoutMs': 10000,
    });

    expect(mailer).toBeInstanceOf(SmtpPasswordRecoveryMailer);
    expect(mailer.enabled).toBe(true);
  });
});

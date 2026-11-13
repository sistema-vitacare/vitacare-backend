import authConfig from '@/config/auth.config';
import { environmentValidationSchema } from '@/config/env.validation';
import mailConfig from '@/config/mail.config';

const base = {
  DB_HOST: 'postgresql',
  DB_USERNAME: 'vitacare',
  DB_PASSWORD: 'x',
  DB_DATABASE: 'vitacare',
  REDIS_HOST: 'redis',
};

const smtp = {
  SMTP_ENABLED: 'true',
  SMTP_HOST: 'smtp.example.com',
  SMTP_FROM: 'no-reply@example.com',
  PASSWORD_RESET_URL: 'https://app.example.com/redefinir-senha',
};

const validate = (env: Record<string, string>) =>
  environmentValidationSchema.validate({ ...base, ...env });

describe('variaveis do convite por e-mail (BE-31)', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('SMTP desligado nao exige a pagina de aceite; validade padrao 72 h', () => {
    const result = validate({});

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({ INVITATION_TTL_HOURS: 72 });
  });

  it('SMTP ligado exige INVITATION_ACCEPT_URL http ou https', () => {
    expect(validate(smtp).error?.message).toContain('INVITATION_ACCEPT_URL');
    expect(
      validate({ ...smtp, INVITATION_ACCEPT_URL: 'ftp://app.example.com/x' })
        .error?.message,
    ).toContain('INVITATION_ACCEPT_URL');
    expect(
      validate({
        ...smtp,
        INVITATION_ACCEPT_URL: 'http://203.0.113.10:1040/aceitar-convite',
      }).error,
    ).toBeUndefined();
  });

  it.each(['0', '169', '1.5', 'abc'])(
    'recusa INVITATION_TTL_HOURS = %s',
    (value) => {
      expect(
        validate({ INVITATION_TTL_HOURS: value }).error?.message,
      ).toContain('INVITATION_TTL_HOURS');
    },
  );

  it('le a validade em segundos e a URL da pagina', () => {
    process.env.INVITATION_TTL_HOURS = '48';
    process.env.INVITATION_ACCEPT_URL = 'https://app.example.com/aceitar';

    expect(authConfig().invitationSeconds).toBe(48 * 3600);
    expect(mailConfig().invitationAcceptUrl).toBe(
      'https://app.example.com/aceitar',
    );

    delete process.env.INVITATION_TTL_HOURS;
    expect(authConfig().invitationSeconds).toBe(72 * 3600);
  });
});

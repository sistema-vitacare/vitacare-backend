import { environmentValidationSchema } from '@/config/env.validation';
import notificationConfig from '@/config/notification.config';

const base = {
  DB_HOST: 'postgresql',
  DB_USERNAME: 'vitacare',
  DB_PASSWORD: 'x',
  DB_DATABASE: 'vitacare',
  REDIS_HOST: 'redis',
};

const push = {
  WEB_PUSH_ENABLED: 'true',
  WEB_PUSH_PUBLIC_KEY: 'chave-publica-sintetica',
  WEB_PUSH_PRIVATE_KEY: 'chave-privada-sintetica',
  WEB_PUSH_SUBJECT: 'mailto:suporte@example.com',
};

const validate = (env: Record<string, string>) =>
  environmentValidationSchema.validate({ ...base, ...env }).error?.message;

describe('validacao das variaveis de notificacao', () => {
  it('push desligado nao exige chaves', () => {
    expect(validate({})).toBeUndefined();
    expect(validate({ WEB_PUSH_ENABLED: 'false' })).toBeUndefined();
  });

  it.each([
    'WEB_PUSH_PUBLIC_KEY',
    'WEB_PUSH_PRIVATE_KEY',
    'WEB_PUSH_SUBJECT',
  ] as const)('push ligado exige %s', (key) => {
    const env: Record<string, string> = { ...push };

    delete env[key];

    expect(validate(env)).toContain(key);
  });

  it('assunto VAPID so aceita mailto: ou https:', () => {
    expect(validate(push)).toBeUndefined();
    expect(
      validate({ ...push, WEB_PUSH_SUBJECT: 'https://vitacare.example.com' }),
    ).toBeUndefined();
    expect(
      validate({ ...push, WEB_PUSH_SUBJECT: 'http://vitacare.example.com' }),
    ).toContain('WEB_PUSH_SUBJECT');
    expect(validate({ ...push, WEB_PUSH_SUBJECT: 'suporte' })).toContain(
      'WEB_PUSH_SUBJECT',
    );
  });

  it('link do app e opcional e precisa ser http ou https', () => {
    expect(
      validate({ NOTIFICATION_APP_URL: 'https://app.example.com' }),
    ).toBeUndefined();
    expect(validate({ NOTIFICATION_APP_URL: '' })).toBeUndefined();
    expect(
      validate({ NOTIFICATION_APP_URL: 'ftp://app.example.com' }),
    ).toContain('NOTIFICATION_APP_URL');
  });
});

describe('notificationConfig', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  it('le push e link do ambiente', () => {
    process.env = {
      ...original,
      ...push,
      NOTIFICATION_APP_URL: 'https://app.example.com',
    };

    expect(notificationConfig()).toEqual({
      pushEnabled: true,
      pushPublicKey: 'chave-publica-sintetica',
      pushPrivateKey: 'chave-privada-sintetica',
      pushSubject: 'mailto:suporte@example.com',
      appUrl: 'https://app.example.com',
    });
  });

  it('vazio vira desligado e sem link', () => {
    process.env = {
      ...original,
      WEB_PUSH_ENABLED: '',
      WEB_PUSH_PUBLIC_KEY: '',
      NOTIFICATION_APP_URL: '',
    };

    expect(notificationConfig()).toEqual({
      pushEnabled: false,
      pushPublicKey: undefined,
      pushPrivateKey: undefined,
      pushSubject: undefined,
      appUrl: undefined,
    });
  });
});

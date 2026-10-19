import { toTrustProxy } from '@/config/config.utils';
import { environmentValidationSchema } from '@/config/env.validation';

describe('toTrustProxy', () => {
  it.each([undefined, '', '  ', 'false', 'FALSE'])(
    'desliga com %p',
    (value) => {
      expect(toTrustProxy(value)).toBe(false);
    },
  );

  it('converte numero de saltos', () => {
    expect(toTrustProxy('1')).toBe(1);
  });

  it('normaliza a lista de faixas', () => {
    expect(toTrustProxy(' loopback , uniquelocal ')).toBe(
      'loopback,uniquelocal',
    );
  });
});

describe('validacao de TRUST_PROXY', () => {
  const base = {
    DB_HOST: 'postgresql',
    DB_USERNAME: 'vitacare',
    DB_PASSWORD: 'x',
    DB_DATABASE: 'vitacare',
    REDIS_HOST: 'redis',
  };

  it('recusa true, que aceitaria X-Forwarded-For forjado', () => {
    const { error } = environmentValidationSchema.validate({
      ...base,
      TRUST_PROXY: 'true',
    });

    expect(error?.message).toContain('TRUST_PROXY');
  });

  it('aceita faixas privadas', () => {
    const { error } = environmentValidationSchema.validate({
      ...base,
      TRUST_PROXY: 'loopback,uniquelocal',
    });

    expect(error).toBeUndefined();
  });
});

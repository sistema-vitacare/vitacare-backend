import { normalizeUserAgent } from '@/modules/Terms/policies/userAgent.policy';

describe('normalizeUserAgent (BE-32)', () => {
  it.each([undefined, '', '   ', '\r\n'])(
    'sem navegador informado (%p) grava null',
    (raw) => {
      expect(normalizeUserAgent(raw)).toBeNull();
    },
  );

  it('mantem o texto comum', () => {
    expect(normalizeUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe(
      'Mozilla/5.0 (X11; Linux x86_64)',
    );
  });

  it('tira caracteres de controle, inclusive quebras de linha e NUL', () => {
    expect(normalizeUserAgent('a\r\nb\u0000c\td')).toBe('abcd');
  });

  it('trunca em 512 caracteres', () => {
    const value = normalizeUserAgent('x'.repeat(2000));

    expect(value).toHaveLength(512);
  });

  it('header repetido vira lista; fica o primeiro valor', () => {
    expect(normalizeUserAgent(['primeiro', 'segundo'])).toBe('primeiro');
  });
});

import {
  currentRequestIp,
  normalizeIp,
  runWithRequestMetadata,
} from '@/common/context/requestMetadata';

describe('metadados da requisicao para a auditoria', () => {
  it('aceita IPv4 e IPv6 e recusa o que nao e IP', () => {
    expect(normalizeIp('192.0.2.1')).toBe('192.0.2.1');
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('::ffff:127.0.0.1');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeIp('unknown')).toBeNull();
    expect(normalizeIp('')).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });

  it('fora de uma requisicao nao ha IP', () => {
    expect(currentRequestIp()).toBeNull();
  });

  it('o IP acompanha o fluxo assincrono da requisicao', async () => {
    const seen = await runWithRequestMetadata(
      { ip: '198.51.100.7' },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        await Promise.resolve();

        return currentRequestIp();
      },
    );

    expect(seen).toBe('198.51.100.7');
    expect(currentRequestIp()).toBeNull();
  });

  it('requisicoes concorrentes nao trocam de IP', async () => {
    const read = (ip: string, delay: number) =>
      runWithRequestMetadata({ ip }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));

        return currentRequestIp();
      });

    await expect(
      Promise.all([read('192.0.2.1', 5), read('192.0.2.2', 1)]),
    ).resolves.toEqual(['192.0.2.1', '192.0.2.2']);
  });
});

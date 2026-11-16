import { stdSerializers } from 'pino-http';

import { REDACTED, redactRequestLog } from '@/common/http/logRedaction';

describe('redactRequestLog', () => {
  it('mascara o termo de busca na URL e na query', () => {
    expect(
      redactRequestLog({
        method: 'GET',
        url: '/api/v1/users?status=pending&search=ana%40example.test&page=2',
        query: { status: 'pending', search: 'ana@example.test', page: '2' },
      }),
    ).toEqual({
      method: 'GET',
      url: `/api/v1/users?status=pending&search=${encodeURIComponent(REDACTED)}&page=2`,
      query: { status: 'pending', search: REDACTED, page: '2' },
    });
  });

  it('mantem intacta a requisicao sem termo de busca', () => {
    const req = { url: '/api/v1/users?page=1', query: { page: '1' } };

    expect(redactRequestLog(req)).toEqual(req);
  });

  it('aceita requisicao sem URL nem query', () => {
    expect(redactRequestLog({ method: 'GET' })).toEqual({ method: 'GET' });
  });

  describe('IP do cliente', () => {
    // O pino-http entrega ao serializador o objeto padrao, com a requisicao
    // original em `raw`; atras do Nginx Proxy Manager o socket e o do proxy.
    const serialize = (req: Parameters<typeof stdSerializers.req>[0]) =>
      redactRequestLog(stdSerializers.req(req));
    const request = (ip?: string) =>
      ({
        method: 'GET',
        url: '/api/v1/patients',
        headers: {},
        socket: { remoteAddress: '172.18.0.5', remotePort: 41234 },
        ...(ip === undefined ? {} : { ip }),
      }) as unknown as Parameters<typeof serialize>[0];

    it('grava o req.ip do Express (regra TRUST_PROXY) no lugar do socket', () => {
      expect(serialize(request('203.0.113.10'))).toMatchObject({
        remoteAddress: '203.0.113.10',
        remotePort: 41234,
      });
    });

    it('mantem o endereco do socket quando nao ha req.ip', () => {
      expect(serialize(request())).toMatchObject({
        remoteAddress: '172.18.0.5',
      });
    });
  });
});

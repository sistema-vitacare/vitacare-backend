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
});

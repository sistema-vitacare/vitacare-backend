import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from '@/common/http/responseEnvelope.interceptor';

const contextFor = (path: string, type = 'http'): ExecutionContext =>
  ({
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => ({ path, id: 'req-1' }) }),
  }) as unknown as ExecutionContext;

const handlerOf = (value: unknown): CallHandler => ({
  handle: () => of(value),
});

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor(['/health', '/api/docs']);

  it('envelopa a resposta de uma rota da API', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        contextFor('/api/v1'),
        handlerOf({ name: 'vitacare-backend' }),
      ),
    );

    expect(result).toMatchObject({
      data: { name: 'vitacare-backend' },
      meta: { requestId: 'req-1' },
    });
  });

  it('nao envelopa rota de health', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        contextFor('/health/live'),
        handlerOf({ status: 'ok' }),
      ),
    );

    expect(result).toEqual({ status: 'ok' });
  });

  it('nao envelopa o documento OpenAPI', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        contextFor('/api/docs-json'),
        handlerOf({ openapi: '3.0.0' }),
      ),
    );

    expect(result).toEqual({ openapi: '3.0.0' });
  });

  it('ignora contextos que nao sao HTTP', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(contextFor('/api/v1', 'rpc'), handlerOf('cru')),
    );

    expect(result).toBe('cru');
  });
});

import {
  buildEnvelope,
  isEnvelopePayload,
  paginate,
  withMeta,
} from './envelope';
import { isExcludedPath } from './excludedPaths';
import { resolveRequestId } from './requestId';

describe('resolveRequestId', () => {
  it('usa o id que o pino anexou a requisicao', () => {
    expect(resolveRequestId({ id: 42 })).toBe('42');
  });

  it('gera um id quando a requisicao nao tem um', () => {
    expect(resolveRequestId({})).toEqual(expect.any(String));
  });

  it('devolve o mesmo id em chamadas repetidas para a mesma requisicao', () => {
    const request = {};
    expect(resolveRequestId(request)).toBe(resolveRequestId(request));
  });
});

describe('isExcludedPath', () => {
  const prefixes = ['/health', '/api/docs'];

  it.each(['/health/live', '/health/ready', '/api/docs', '/api/docs-json'])(
    'exclui %s',
    (path) => expect(isExcludedPath(path, prefixes)).toBe(true),
  );

  it.each(['/api/v1', '/api/v1/patients'])('nao exclui %s', (path) =>
    expect(isExcludedPath(path, prefixes)).toBe(false),
  );
});

describe('buildEnvelope', () => {
  it('envelopa um objeto simples', () => {
    const result = buildEnvelope({ id: '7f3a' }, 'req-1');

    expect(result.data).toEqual({ id: '7f3a' });
    expect(result.meta).toMatchObject({ requestId: 'req-1' });
    expect(result.meta.timestamp).toEqual(expect.any(String));
    expect(result.meta.pagination).toBeUndefined();
  });

  it('converte undefined em data null', () => {
    expect(buildEnvelope(undefined, 'req-1').data).toBeNull();
  });

  it('propaga a mensagem de sucesso declarada pelo caso de uso', () => {
    const payload = withMeta(
      { id: 'c40e' },
      { message: 'Paciente cadastrado com sucesso.' },
    );

    expect(buildEnvelope(payload, 'req-1')).toMatchObject({
      data: { id: 'c40e' },
      meta: {
        requestId: 'req-1',
        message: 'Paciente cadastrado com sucesso.',
      },
    });
  });

  it('nao vaza o marcador interno do payload', () => {
    const envelope = buildEnvelope(withMeta({ id: 'x' }, {}), 'req-1');
    expect(Object.getOwnPropertySymbols(envelope.data as object)).toHaveLength(
      0,
    );
  });
});

describe('paginate', () => {
  it('calcula o total de paginas', () => {
    const payload = paginate(['a', 'b'], 45, { page: 2, limit: 20 });

    expect(isEnvelopePayload(payload)).toBe(true);
    expect(buildEnvelope(payload, 'req-1')).toMatchObject({
      data: ['a', 'b'],
      meta: { pagination: { page: 2, limit: 20, total: 45, totalPages: 3 } },
    });
  });

  it('devolve zero paginas quando nao ha resultados', () => {
    const envelope = buildEnvelope(
      paginate([], 0, { page: 1, limit: 20 }),
      'req-1',
    );
    expect(envelope.meta.pagination?.totalPages).toBe(0);
  });

  it('nao divide por zero quando o limite e zero', () => {
    const envelope = buildEnvelope(
      paginate([], 10, { page: 1, limit: 0 }),
      'req-1',
    );
    expect(envelope.meta.pagination?.totalPages).toBe(0);
  });
});

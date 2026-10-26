import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DomainException } from '@/common/errors/domain.exception';
import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';

describe('AllExceptionsFilter', () => {
  const json = jest.fn((_body: Record<string, unknown>) => undefined);
  const status = jest.fn(() => ({ json }));

  const hostFor = (url: string): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ url, path: url, method: 'GET', id: 'req-1' }),
        getResponse: () => ({ status }),
      }),
    }) as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter(['/health', '/api/docs']);
  const body = (): Record<string, unknown> => json.mock.calls[0][0];
  const anyString: unknown = expect.any(String);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('serializa DomainException no contrato { error, meta }', () => {
    filter.catch(
      new DomainException({
        code: 'PATIENT_DUPLICATE_DOCUMENT',
        status: HttpStatus.CONFLICT,
        message: 'Ja existe um paciente com este documento.',
        detail: 'Documento duplicado na organizacao atual.',
        fields: [{ field: 'document', code: 'DUPLICATE' }],
      }),
      hostFor('/api/v1/patients'),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(body()).toEqual({
      error: {
        code: 'PATIENT_DUPLICATE_DOCUMENT',
        message: 'Ja existe um paciente com este documento.',
        detail: 'Documento duplicado na organizacao atual.',
        fields: [{ field: 'document', code: 'DUPLICATE' }],
      },
      meta: {
        requestId: 'req-1',
        timestamp: anyString,
        path: '/api/v1/patients',
        method: 'GET',
        status: HttpStatus.CONFLICT,
      },
    });
  });

  it('mapeia excecao padrao do Nest para o codigo transversal', () => {
    filter.catch(
      new NotFoundException('Paciente nao encontrado'),
      hostFor('/api/v1/patients/1'),
    );

    expect(body().error).toEqual({
      code: 'NOT_FOUND',
      message: 'Paciente nao encontrado',
      detail: null,
      fields: null,
    });
  });

  it('converte excecao desconhecida em 500 sem detail e sem vazar a causa', () => {
    filter.catch(
      new Error('senha do banco: hunter2'),
      hostFor('/api/v1/patients'),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body().error).toMatchObject({
      code: 'INTERNAL_ERROR',
      detail: null,
      fields: null,
    });
    expect(JSON.stringify(body())).not.toContain('hunter2');
  });

  it('preserva o relatorio do Terminus nas rotas excluidas', () => {
    filter.catch(
      new ServiceUnavailableException({
        status: 'error',
        info: {},
        error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
        details: { redis: { status: 'down', message: 'ECONNREFUSED' } },
      }),
      hostFor('/health/ready'),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body()).toMatchObject({
      status: 'error',
      error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
      path: '/health/ready',
    });
    expect(body().meta).toBeUndefined();
  });

  it('registra erro de servidor com stack e erro de cliente apenas como aviso', () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error');
    const warnLog = jest.spyOn(Logger.prototype, 'warn');

    filter.catch(new NotFoundException(), hostFor('/api/v1/patients/1'));
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledTimes(1);

    filter.catch(new Error('boom'), hostFor('/api/v1/patients'));
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});

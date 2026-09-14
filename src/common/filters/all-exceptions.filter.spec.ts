import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const json = jest.fn((_body: Record<string, unknown>) => undefined);
  const status = jest.fn(() => ({ json }));
  const request = { url: '/api/v1/pacientes', method: 'GET', id: 'req-1' };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  const captureBody = (): Record<string, unknown> => json.mock.calls[0][0];

  it('normaliza erros HTTP padrao do Nest', () => {
    filter.catch(new NotFoundException('Paciente nao encontrado'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(captureBody()).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      error: 'Not Found',
      message: 'Paciente nao encontrado',
      path: '/api/v1/pacientes',
      method: 'GET',
      requestId: 'req-1',
    });
  });

  it('preserva a lista de mensagens do ValidationPipe', () => {
    filter.catch(
      new BadRequestException(['nome nao pode ser vazio', 'idade invalida']),
      host,
    );

    expect(captureBody().message).toEqual([
      'nome nao pode ser vazio',
      'idade invalida',
    ]);
  });

  it('preserva payloads customizados como o relatorio do Terminus', () => {
    filter.catch(
      new ServiceUnavailableException({
        status: 'error',
        info: {},
        error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
        details: { redis: { status: 'down', message: 'ECONNREFUSED' } },
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(captureBody()).toMatchObject({
      status: 'error',
      error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
    });
  });

  it('converte excecoes desconhecidas em 500 sem vazar detalhes internos', () => {
    filter.catch(new Error('senha do banco: hunter2'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = captureBody();
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Unexpected internal error',
    });
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('registra em log apenas os erros de servidor', () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error');

    filter.catch(new NotFoundException(), host);
    expect(errorLog).not.toHaveBeenCalled();

    filter.catch(new Error('boom'), host);
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});

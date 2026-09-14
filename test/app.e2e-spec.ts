import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { setupApp } from '../src/app.setup';
import { HealthModule } from '../src/health/health.module';
import { RedisHealthIndicator } from '../src/health/indicators/redis.health';

class CreatePacienteDto {
  @IsString()
  nome!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  idade!: number;
}

interface ErrorBody {
  statusCode: number;
  error: unknown;
  message: unknown;
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
}

interface HealthBody {
  status: string;
  info: Record<string, unknown>;
  error: Record<string, unknown>;
  details: Record<string, unknown>;
  path?: string;
}

interface OpenApiBody {
  info: { title: string };
  paths: Record<string, unknown>;
}

/** Controller sintetico: exercita ValidationPipe e filtro global de excecoes. */
@Controller('pacientes')
class PacientesProbeController {
  @Post()
  create(@Body() dto: CreatePacienteDto): CreatePacienteDto {
    return dto;
  }

  @Get('boom')
  boom(): never {
    throw new Error('falha interna com segredo hunter2');
  }
}

describe('Pipeline HTTP (e2e)', () => {
  let app: INestApplication;
  const redisHealth = { isHealthy: jest.fn() };
  const databaseHealth = { pingCheck: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
      controllers: [AppController, PacientesProbeController],
    })
      .overrideProvider(RedisHealthIndicator)
      .useValue(redisHealth)
      .overrideProvider(TypeOrmHealthIndicator)
      .useValue(databaseHealth)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    setupApp(app as NestExpressApplication, {
      apiPrefix: 'api',
      apiVersion: '1',
      isProduction: false,
      corsOrigins: ['http://localhost:5173'],
      corsCredentials: true,
      swaggerEnabled: true,
      swaggerPath: 'docs',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): App => app.getHttpServer() as App;

  beforeEach(() => {
    jest.clearAllMocks();
    databaseHealth.pingCheck.mockResolvedValue({ postgres: { status: 'up' } });
    redisHealth.isHealthy.mockResolvedValue({ redis: { status: 'up' } });
  });

  describe('roteamento', () => {
    it('serve a raiz sob o prefixo e a versao', async () => {
      const response = await request(server()).get('/api/v1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        name: 'vitacare-backend',
        status: 'running',
      });
    });

    it('nao expoe a raiz sem a versao', async () => {
      await request(server()).get('/api').expect(404);
    });
  });

  describe('health', () => {
    it('expoe liveness fora do prefixo e sem versao', async () => {
      const response = await request(server()).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('retorna 200 quando PostgreSQL e Redis respondem', async () => {
      const response = await request(server()).get('/health/ready');

      const body = response.body as HealthBody;

      expect(response.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.details).toEqual({
        postgres: { status: 'up' },
        redis: { status: 'up' },
      });
    });

    it('retorna 503 detalhando a dependencia indisponivel', async () => {
      redisHealth.isHealthy.mockResolvedValue({
        redis: { status: 'down', message: 'ECONNREFUSED' },
      });

      const response = await request(server()).get('/health/ready');

      const body = response.body as HealthBody;

      expect(response.status).toBe(503);
      expect(body.error).toEqual({
        redis: { status: 'down', message: 'ECONNREFUSED' },
      });
      expect(body.path).toBe('/health/ready');
    });
  });

  describe('validacao', () => {
    it('aceita e converte um payload valido', async () => {
      const response = await request(server())
        .post('/api/v1/pacientes')
        .send({ nome: 'Ana', idade: '42' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ nome: 'Ana', idade: 42 });
    });

    it('rejeita payload invalido no formato de erro normalizado', async () => {
      const response = await request(server())
        .post('/api/v1/pacientes')
        .send({ idade: -1 });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        path: '/api/v1/pacientes',
        method: 'POST',
      });
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.timestamp).toEqual(expect.any(String));
    });

    it('rejeita propriedades nao declaradas no DTO', async () => {
      const response = await request(server())
        .post('/api/v1/pacientes')
        .send({ nome: 'Ana', idade: 42, isAdmin: true });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(400);
      expect(String(body.message)).toContain('isAdmin');
    });
  });

  describe('erros internos', () => {
    it('converte excecao nao tratada em 500 sem vazar detalhes', async () => {
      const response = await request(server()).get('/api/v1/pacientes/boom');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Unexpected internal error',
      });
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
    });
  });

  describe('seguranca', () => {
    it('aplica os headers do helmet', async () => {
      const response = await request(server()).get('/health/live');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('libera a origem configurada no CORS', async () => {
      const response = await request(server())
        .get('/api/v1')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('nao libera origem desconhecida', async () => {
      const response = await request(server())
        .get('/api/v1')
        .set('Origin', 'http://evil.example');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('documentacao', () => {
    it('publica o contrato OpenAPI', async () => {
      const response = await request(server()).get('/api/docs-json');

      const body = response.body as OpenApiBody;

      expect(response.status).toBe(200);
      expect(body.info.title).toBe('VitaCare API');
      expect(Object.keys(body.paths)).toContain('/api/v1');
    });
  });
});

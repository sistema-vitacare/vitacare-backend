import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { setupApp } from '@/app.setup';
import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthController } from '@/modules/Auth/auth.controller';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { ChangePasswordUseCase } from '@/modules/Auth/ChangePassword/changePassword.useCase';
import { CompleteFirstAccessUseCase } from '@/modules/Auth/CompleteFirstAccess/completeFirstAccess.useCase';
import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import { LogoutUseCase } from '@/modules/Auth/Logout/logout.useCase';
import { RequestPasswordRecoveryUseCase } from '@/modules/Auth/RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordUseCase } from '@/modules/Auth/ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminUseCase } from '@/modules/Auth/ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';

interface EnvelopeBody<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    detail: string | null;
    fields: unknown;
  };
  meta: { status: number; path: string; method: string };
}

interface OpenApiOperation {
  security?: Array<Record<string, string[]>>;
  responses: Record<
    string,
    {
      description?: string;
      content?: Record<
        string,
        { schema?: { properties?: Record<string, unknown> } }
      >;
    }
  >;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { securitySchemes?: Record<string, unknown> };
}

/**
 * Guard sintetico: substitui `AuthGuard` para exercitar apenas o contrato HTTP
 * do controller. A resolucao real de sessao tem cobertura propria em
 * `authSchema.e2e-spec.ts` e nos testes de unidade do guard.
 */
class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = request.path;

    if (path.endsWith('/auth/login') || path.includes('/password-recovery/')) {
      return true;
    }

    if (request.headers.authorization !== 'Bearer sessao-valida') {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Bearer ausente ou malformado.',
      });
    }

    request.authSessionId = 'sessao-1';
    request.context = {
      requestId: 'req-1',
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      profile: ProfileCode.ADMIN,
      permissions: new Set(['users:reset_password']),
    };

    return true;
  }
}

describe('Auth HTTP (e2e)', () => {
  let app: INestApplication;

  const login = { execute: jest.fn() };
  const firstAccess = { execute: jest.fn().mockResolvedValue(null) };
  const logout = { execute: jest.fn().mockResolvedValue(null) };
  const changePassword = { execute: jest.fn().mockResolvedValue(null) };
  const requestRecovery = { execute: jest.fn().mockResolvedValue(null) };
  const resetPassword = { execute: jest.fn().mockResolvedValue(null) };
  const adminReset = { execute: jest.fn() };

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: LoginUseCase, useValue: login },
        { provide: CompleteFirstAccessUseCase, useValue: firstAccess },
        { provide: LogoutUseCase, useValue: logout },
        { provide: ChangePasswordUseCase, useValue: changePassword },
        { provide: RequestPasswordRecoveryUseCase, useValue: requestRecovery },
        { provide: ResetPasswordUseCase, useValue: resetPassword },
        { provide: ResetUserPasswordAsAdminUseCase, useValue: adminReset },
        { provide: APP_GUARD, useClass: StubAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    setupApp(app as NestExpressApplication, {
      apiPrefix: 'api',
      apiVersion: '1',
      isProduction: false,
      corsOrigins: [],
      corsCredentials: false,
      swaggerEnabled: true,
      swaggerPath: 'docs',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    firstAccess.execute.mockResolvedValue(null);
    logout.execute.mockResolvedValue(null);
    changePassword.execute.mockResolvedValue(null);
    requestRecovery.execute.mockResolvedValue(null);
    resetPassword.execute.mockResolvedValue(null);
  });

  describe('POST auth/login', () => {
    it('entrega login no envelope e impede cache do token', async () => {
      login.execute.mockResolvedValue({
        state: 'authenticated',
        accessToken: 'token-opaco',
        tokenType: 'Bearer',
        expiresAt: new Date('2026-09-22T12:00:00.000Z'),
        idleTimeoutSeconds: 1800,
      });

      const response = await request(server()).post('/api/v1/auth/login').send({
        organizationCode: 'clinica-a',
        email: 'user@example.test',
        password: 'senha válida',
      });

      const body = response.body as EnvelopeBody<Record<string, unknown>>;

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body.data).toEqual({
        state: 'authenticated',
        accessToken: 'token-opaco',
        tokenType: 'Bearer',
        expiresAt: '2026-09-22T12:00:00.000Z',
        idleTimeoutSeconds: 1800,
      });
      expect(body.meta.requestId).toEqual(expect.any(String));
    });

    it('rejeita payload inválido com 422 antes de consultar credenciais', async () => {
      const response = await request(server()).post('/api/v1/auth/login').send({
        organizationCode: 'INVALIDO',
        email: 'not-an-email',
        password: 'curta',
      });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(422);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(login.execute).not.toHaveBeenCalled();
    });

    it('propaga credencial inválida como 401 uniforme, sem campos', async () => {
      login.execute.mockRejectedValue(
        new DomainException({
          ...AuthErrors.INVALID_CREDENTIALS,
          detail: 'Organização, conta, estado ou senha inválidos.',
        }),
      );

      const response = await request(server()).post('/api/v1/auth/login').send({
        organizationCode: 'clinica-a',
        email: 'user@example.test',
        password: 'senha inválida',
      });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(body.error.fields).toBeNull();
    });

    it('ignora X-Forwarded-For forjado ao identificar o cliente', async () => {
      login.execute.mockResolvedValue({
        state: 'authenticated',
        accessToken: 'token-opaco',
        tokenType: 'Bearer',
        expiresAt: new Date('2026-09-22T12:00:00.000Z'),
        idleTimeoutSeconds: 1800,
      });

      await request(server())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '203.0.113.9')
        .send({
          organizationCode: 'clinica-a',
          email: 'user@example.test',
          password: 'senha válida',
        });

      const [, meta] = login.execute.mock.calls[0] as [unknown, { ip: string }];

      // Sem `trust proxy`, o IP vem do socket; o header nao pode furar limite.
      expect(meta.ip).not.toBe('203.0.113.9');
      expect(meta.ip).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
    });
  });

  describe('rotas de sessão', () => {
    it('conclui o primeiro acesso com 200 e corpo nulo', async () => {
      const response = await request(server())
        .post('/api/v1/auth/password/first-access')
        .set('Authorization', 'Bearer sessao-valida')
        .send({ newPassword: 'nova senha forte' });

      const body = response.body as EnvelopeBody<null>;

      expect(response.status).toBe(200);
      expect(body.data).toBeNull();
      expect(firstAccess.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          newPassword: 'nova senha forte',
          sessionId: 'sessao-1',
        }),
        expect.objectContaining({ userId: expect.any(String) as string }),
      );
    });

    it('encerra a sessão apresentada com 200 e corpo nulo', async () => {
      const response = await request(server())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer sessao-valida');

      const body = response.body as EnvelopeBody<null>;

      expect(response.status).toBe(200);
      expect(body.data).toBeNull();
      expect(logout.execute).toHaveBeenCalledWith('sessao-1');
    });

    it('troca a própria senha com 200 e corpo nulo', async () => {
      const response = await request(server())
        .put('/api/v1/auth/password')
        .set('Authorization', 'Bearer sessao-valida')
        .send({
          currentPassword: 'senha atual',
          newPassword: 'senha nova longa',
        });

      const body = response.body as EnvelopeBody<null>;

      expect(response.status).toBe(200);
      expect(body.data).toBeNull();
    });

    it('recusa rota protegida sem Bearer com 401 uniforme', async () => {
      const response = await request(server()).post('/api/v1/auth/logout');

      const body = response.body as ErrorBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('AUTH_UNAUTHENTICATED');
      expect(body.error.fields).toBeNull();
      expect(logout.execute).not.toHaveBeenCalled();
    });
  });

  describe('recuperação de senha', () => {
    it('aceita a solicitação com 202 sem revelar a conta', async () => {
      const response = await request(server())
        .post('/api/v1/auth/password-recovery/request')
        .send({ organizationCode: 'clinica-a', email: 'user@example.test' });

      const body = response.body as EnvelopeBody<null>;

      expect(response.status).toBe(202);
      expect(body.data).toBeNull();
    });

    it('redefine a senha por token com 201 e corpo nulo', async () => {
      const response = await request(server())
        .post('/api/v1/auth/password-recovery/reset')
        .send({
          token: 'token-de-recuperacao',
          newPassword: 'senha nova aqui',
        });

      const body = response.body as EnvelopeBody<null>;

      expect(response.status).toBe(201);
      expect(body.data).toBeNull();
    });
  });

  describe('POST auth/users/:userId/temporary-password', () => {
    it('devolve a senha temporária uma única vez e sem cache', async () => {
      adminReset.execute.mockResolvedValue({
        temporaryPassword: 'Senha-Temporaria-1',
      });

      const response = await request(server())
        .post(
          '/api/v1/auth/users/33333333-3333-4333-8333-333333333333/temporary-password',
        )
        .set('Authorization', 'Bearer sessao-valida');

      const body = response.body as EnvelopeBody<{ temporaryPassword: string }>;

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body.data).toEqual({ temporaryPassword: 'Senha-Temporaria-1' });
    });

    it('rejeita identificador que não é UUID com 422', async () => {
      const response = await request(server())
        .post('/api/v1/auth/users/nao-e-uuid/temporary-password')
        .set('Authorization', 'Bearer sessao-valida');

      expect(response.status).toBe(422);
      expect(adminReset.execute).not.toHaveBeenCalled();
    });
  });

  describe('contrato OpenAPI', () => {
    const publicPaths = [
      '/api/v1/auth/login',
      '/api/v1/auth/password-recovery/request',
      '/api/v1/auth/password-recovery/reset',
    ];

    const protectedPaths = [
      '/api/v1/auth/password/first-access',
      '/api/v1/auth/logout',
      '/api/v1/auth/password',
      '/api/v1/auth/users/{userId}/temporary-password',
    ];

    const loadDocument = async (): Promise<OpenApiDocument> => {
      const response = await request(server()).get('/api/docs-json');
      return response.body as OpenApiDocument;
    };

    it('publica as sete rotas de autenticação', async () => {
      const document = await loadDocument();

      for (const path of [...publicPaths, ...protectedPaths]) {
        expect(document.paths[path]).toBeDefined();
      }
    });

    /** Status realmente devolvido por cada rota, conforme os testes acima. */
    const successStatus: Record<string, string> = {
      '/api/v1/auth/login': '200',
      '/api/v1/auth/password-recovery/request': '202',
      '/api/v1/auth/password-recovery/reset': '201',
      '/api/v1/auth/password/first-access': '200',
      '/api/v1/auth/logout': '200',
      '/api/v1/auth/password': '200',
      '/api/v1/auth/users/{userId}/temporary-password': '201',
    };

    it('envelopa toda resposta de sucesso documentada no status real', async () => {
      const document = await loadDocument();

      for (const path of [...publicPaths, ...protectedPaths]) {
        for (const operation of Object.values(document.paths[path])) {
          const success = Object.entries(operation.responses).find(([status]) =>
            status.startsWith('2'),
          );

          expect(success?.[0]).toBe(successStatus[path]);

          const schema =
            success?.[1].content?.['application/json']?.schema?.properties;

          expect(Object.keys(schema ?? {})).toEqual(
            expect.arrayContaining(['data', 'meta']),
          );
        }
      }
    });

    it('exige Bearer somente nas rotas protegidas', async () => {
      const document = await loadDocument();

      expect(document.components.securitySchemes?.bearer).toBeDefined();

      for (const path of protectedPaths) {
        for (const operation of Object.values(document.paths[path])) {
          expect(operation.security).toEqual([{ bearer: [] }]);
        }
      }

      for (const path of publicPaths) {
        for (const operation of Object.values(document.paths[path])) {
          expect(operation.security).toBeUndefined();
        }
      }
    });

    it('documenta erros apenas com códigos do catálogo AuthErrors', async () => {
      const document = await loadDocument();
      const catalog = Object.values(AuthErrors).map((error) => error.code);

      for (const path of [...publicPaths, ...protectedPaths]) {
        for (const operation of Object.values(document.paths[path])) {
          const errorDescriptions = Object.entries(operation.responses)
            .filter(([status]) => !status.startsWith('2'))
            .map(([, response]) => response.description ?? '');

          for (const description of errorDescriptions) {
            for (const code of description
              .replace('Codigos possiveis: ', '')
              .split(', ')
              .filter((value) => value.startsWith('AUTH_'))) {
              expect(catalog).toContain(code);
            }
          }
        }
      }
    });
  });
});

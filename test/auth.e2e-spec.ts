import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { setupApp } from '../src/app.setup';
import { AuthController } from '../src/modules/Auth/auth.controller';
import { ChangePasswordUseCase } from '../src/modules/Auth/ChangePassword/changePassword.useCase';
import { CompleteFirstAccessUseCase } from '../src/modules/Auth/CompleteFirstAccess/completeFirstAccess.useCase';
import { LoginUseCase } from '../src/modules/Auth/Login/login.useCase';
import { LogoutUseCase } from '../src/modules/Auth/Logout/logout.useCase';
import { RequestPasswordRecoveryUseCase } from '../src/modules/Auth/RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordUseCase } from '../src/modules/Auth/ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminUseCase } from '../src/modules/Auth/ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';

describe('Auth HTTP (e2e)', () => {
  let app: INestApplication;
  const login = { execute: jest.fn() };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        LoginUseCase,
        CompleteFirstAccessUseCase,
        LogoutUseCase,
        ChangePasswordUseCase,
        RequestPasswordRecoveryUseCase,
        ResetPasswordUseCase,
        ResetUserPasswordAsAdminUseCase,
      ],
    })
      .overrideProvider(LoginUseCase)
      .useValue(login)
      .overrideProvider(CompleteFirstAccessUseCase)
      .useValue({ execute: jest.fn() })
      .overrideProvider(LogoutUseCase)
      .useValue({ execute: jest.fn() })
      .overrideProvider(ChangePasswordUseCase)
      .useValue({ execute: jest.fn() })
      .overrideProvider(RequestPasswordRecoveryUseCase)
      .useValue({ execute: jest.fn() })
      .overrideProvider(ResetPasswordUseCase)
      .useValue({ execute: jest.fn() })
      .overrideProvider(ResetUserPasswordAsAdminUseCase)
      .useValue({ execute: jest.fn() })
      .compile();
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
  const server = (): App => app.getHttpServer() as App;
  beforeEach(() => jest.clearAllMocks());

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
    const body = response.body as {
      data: {
        state: string;
        accessToken: string;
        tokenType: string;
        expiresAt: string;
        idleTimeoutSeconds: number;
      };
      meta: { requestId: string };
    };
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
    const body = response.body as { error: { code: string } };
    expect(response.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(login.execute).not.toHaveBeenCalled();
  });
});

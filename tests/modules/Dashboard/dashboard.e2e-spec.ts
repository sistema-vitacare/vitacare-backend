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
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { DashboardController } from '@/modules/Dashboard/dashboard.controller';
import { DASHBOARD_USE_CASES } from '@/modules/Dashboard/dashboard.module';
import { DashboardRepository } from '@/modules/Dashboard/repositories/dashboard.repository';

import { ORGANIZATION_ID, sessionOf } from '../Patient/patient.fixtures';
import {
  dashboardRepositoryMock,
  type DashboardRepositoryMock,
} from './dashboard.fixtures';

interface SchemaObject {
  $ref?: string;
  required?: string[];
  nullable?: boolean;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
}

interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        security?: unknown[];
        responses: Record<
          string,
          { content?: Record<string, { schema?: SchemaObject }> }
        >;
      }
    >
  >;
  components: { schemas: Record<string, SchemaObject> };
}

const SESSIONS = {
  'Bearer admin': sessionOf(ProfileCode.ADMIN),
  'Bearer professional': sessionOf(ProfileCode.PROFESSIONAL),
  'Bearer caregiver': sessionOf(ProfileCode.CAREGIVER),
  'Bearer family': sessionOf(ProfileCode.FAMILY),
} as const;

class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session =
      SESSIONS[(request.headers.authorization ?? '') as keyof typeof SESSIONS];

    if (!session) {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Bearer ausente ou malformado.',
      });
    }

    request.context = session;

    return true;
  }
}

const ROUTES = [
  ['/dashboard', 'DashboardDto'],
  ['/dashboard/patients', 'DashboardPatientsDto'],
  ['/dashboard/users', 'DashboardUsersDto'],
  ['/dashboard/follow-ups', 'DashboardFollowUpsDto'],
  ['/dashboard/alerts', 'DashboardAlertsDto'],
] as const;

describe('Dashboard HTTP (e2e)', () => {
  let app: INestApplication;
  let repo: DashboardRepositoryMock;

  const server = (): App => app.getHttpServer() as App;

  const call = (path: string, who?: string) => {
    const call = request(server()).get(`/api/v1${path}`);

    return who ? call.set('Authorization', `Bearer ${who}`) : call;
  };

  beforeAll(async () => {
    repo = dashboardRepositoryMock();

    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        ...DASHBOARD_USE_CASES,
        { provide: DashboardRepository, useValue: repo },
        { provide: APP_GUARD, useClass: StubAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
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
    Object.assign(repo, dashboardRepositoryMock());
  });

  it.each(ROUTES)('%s responde envelopado ao admin', async (path) => {
    const response = await call(`${path}`, 'admin');

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: expect.any(Object) as unknown,
      meta: { requestId: expect.any(String) as unknown },
    });
    expect(repo.hasDashboard).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('periodo sem registro: zeros e meta.message', async () => {
    const response = await call(
      '/dashboard?from=2026-10-01&to=2026-10-31',
      'admin',
    );

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: {
        period: {
          from: '2026-10-01',
          to: '2026-10-31',
          timeZone: 'America/Sao_Paulo',
        },
        previousPeriod: { from: '2026-08-31', to: '2026-09-30' },
        followUps: { inPeriod: 0, change: 0 },
      },
      meta: {
        message: 'Nenhum registro de acompanhamento no período selecionado.',
      },
    });
  });

  it.each(ROUTES)(
    '%s: outros perfis 403, sem token 401, plano sem recurso 403',
    async (path) => {
      expect((await call(path)).status).toBe(401);

      for (const who of ['professional', 'caregiver', 'family']) {
        const response = await call(path, who);

        expect(response.status).toBe(403);
        expect(response.body as object).toMatchObject({
          error: { code: 'AUTH_FORBIDDEN' },
        });
      }

      expect(repo.hasDashboard).not.toHaveBeenCalled();

      repo.hasDashboard.mockResolvedValue(false);

      const plan = await call(path, 'admin');

      expect(plan.status).toBe(403);
      expect(plan.body as object).toMatchObject({
        error: {
          code: 'DASHBOARD_PLAN_FEATURE_UNAVAILABLE',
          message:
            'O painel operacional faz parte do plano Enterprise. Solicite a mudança de plano para acessá-lo.',
        },
      });
      expect(plan.body).not.toHaveProperty('data');
    },
  );

  it('periodo invalido ou query desconhecida e 422', async () => {
    for (const query of [
      '?from=2026-02-30',
      '?from=2026-10-02&to=2026-10-01',
      '?from=2025-01-01&to=2026-01-02',
      '?foo=1',
    ]) {
      for (const path of ['/dashboard', '/dashboard/alerts']) {
        expect((await call(`${path}${query}`, 'admin')).status).toBe(422);
      }
    }

    expect(repo.hasDashboard).not.toHaveBeenCalled();
  });

  it('falha ao carregar e 500 sem detalhe; a nova tentativa responde 200', async () => {
    repo.pendingAlerts.mockRejectedValueOnce(new Error('connection lost'));

    const failed = await call('/dashboard', 'admin');

    expect(failed.status).toBe(500);
    expect(failed.body as object).toMatchObject({
      error: { code: 'INTERNAL_ERROR', detail: null },
    });
    expect(JSON.stringify(failed.body)).not.toContain('connection lost');

    expect((await call('/dashboard', 'admin')).status).toBe(200);
  });

  it('publica as cinco rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    for (const [path, dto] of ROUTES) {
      const operation = document.paths[`/api/v1${path}`]?.get;

      expect(operation).toBeDefined();
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(
        path === '/dashboard/users'
          ? ['200', '401', '403', '500']
          : ['200', '401', '403', '422', '500'],
      );

      const schema = operation.responses['200'].content?.['application/json']
        .schema as SchemaObject;

      expect(schema.required).toEqual(['data', 'meta']);
      expect(schema.properties?.data?.$ref).toBe(`#/components/schemas/${dto}`);
    }

    const schemas = document.components.schemas;

    expect(schemas.DashboardDto.required?.sort()).toEqual([
      'alerts',
      'followUps',
      'latestFollowUps',
      'patients',
      'period',
      'previousPeriod',
      'priorityAlerts',
      'users',
    ]);
    expect(schemas.DashboardPriorityAlertDto.properties?.reading).toMatchObject(
      { nullable: true },
    );
    expect(schemas.DashboardAlertsDto.required?.sort()).toEqual([
      'byDay',
      'bySeverity',
      'bySource',
      'change',
      'issuedInPeriod',
      'issuedStillOpen',
      'pending',
      'period',
      'previousPeriod',
      'previousPeriodTotal',
    ]);
  });
});

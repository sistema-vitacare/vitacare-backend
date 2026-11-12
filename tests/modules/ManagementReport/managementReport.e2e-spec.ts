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
import { ManagementReportController } from '@/modules/ManagementReport/managementReport.controller';
import {
  MANAGEMENT_REPORT_SERVICES,
  MANAGEMENT_REPORT_USE_CASES,
} from '@/modules/ManagementReport/managementReport.module';
import { ManagementReportRepository } from '@/modules/ManagementReport/repositories/managementReport.repository';

import { ORGANIZATION_ID, sessionOf } from '../Patient/patient.fixtures';
import {
  managementReportRepositoryMock,
  type ManagementReportRepositoryMock,
} from './managementReport.fixtures';

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
  ['/management-reports', 'ManagementReportTypeDto', true],
  ['/management-reports/recent', 'RecentReportDto', true],
  ['/management-reports/alerts', 'AlertsReportDto', false],
  ['/management-reports/caregivers', 'CaregiverActivityReportDto', false],
] as const;

describe('ManagementReport HTTP (e2e)', () => {
  let app: INestApplication;
  let repo: ManagementReportRepositoryMock;

  const server = (): App => app.getHttpServer() as App;

  const call = (path: string, who?: string) => {
    const call = request(server()).get(`/api/v1${path}`);

    return who ? call.set('Authorization', `Bearer ${who}`) : call;
  };

  beforeAll(async () => {
    repo = managementReportRepositoryMock();

    const moduleRef = await Test.createTestingModule({
      controllers: [ManagementReportController],
      providers: [
        ...MANAGEMENT_REPORT_USE_CASES,
        ...MANAGEMENT_REPORT_SERVICES,
        { provide: ManagementReportRepository, useValue: repo },
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
    Object.assign(repo, managementReportRepositoryMock());
  });

  it.each(ROUTES)('%s responde envelopado ao admin', async (path) => {
    const response = await call(path, 'admin');

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: expect.anything() as unknown,
      meta: { requestId: expect.any(String) as unknown },
    });
    expect(repo.hasManagementReports).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('condicao chega aparada ao repositorio', async () => {
    const response = await call(
      '/management-reports/alerts?from=2026-10-01&to=2026-10-31&condition=%20diab%20',
      'admin',
    );

    expect(response.status).toBe(200);
    expect(repo.alertSummary).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      { from: '2026-10-01', to: '2026-10-31' },
      'diab',
    );
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

      expect(repo.hasManagementReports).not.toHaveBeenCalled();

      repo.hasManagementReports.mockResolvedValue(false);

      const plan = await call(path, 'admin');

      expect(plan.status).toBe(403);
      expect(plan.body as object).toMatchObject({
        error: {
          code: 'MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE',
          message:
            'Os relatórios gerenciais fazem parte do plano Enterprise. Solicite a mudança de plano para acessá-los.',
        },
      });
      expect(plan.body).not.toHaveProperty('data');
    },
  );

  it('periodo invalido, longo demais, condicao vazia ou query desconhecida e 422', async () => {
    for (const query of [
      '?from=2026-02-30',
      '?from=2026-10-02&to=2026-10-01',
      '?from=2025-01-01&to=2026-01-02',
      '?condition=',
      `?condition=${'x'.repeat(101)}`,
      '?foo=1',
    ]) {
      for (const path of [
        '/management-reports/alerts',
        '/management-reports/caregivers',
      ]) {
        expect((await call(`${path}${query}`, 'admin')).status).toBe(422);
      }
    }

    const long = await call(
      '/management-reports/alerts?from=2025-01-01&to=2026-01-02',
      'admin',
    );

    expect(long.body as object).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: [{ field: 'to', code: 'PERIOD_TOO_LONG' }],
      },
    });
    expect(
      (
        await call(
          '/management-reports/alerts?from=2025-01-01&to=2026-01-01',
          'admin',
        )
      ).status,
    ).toBe(200);
    expect(
      (await call('/management-reports/recent?limit=101', 'admin')).status,
    ).toBe(422);
  });

  it('mais de 10.000 alertas e 422 com codigo proprio', async () => {
    repo.alertSummary.mockResolvedValue({
      ...(await managementReportRepositoryMock().alertSummary()),
      totals: { total: 10_001, open: 0, resolved: 0, intercurrences: 0 },
    });

    const response = await call('/management-reports/alerts', 'admin');

    expect(response.status).toBe(422);
    expect(response.body as object).toMatchObject({
      error: { code: 'MANAGEMENT_REPORT_TOO_MANY_ALERTS' },
    });
  });

  it('publica as rotas JSON no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    for (const [path, dto, isList] of ROUTES) {
      const operation = document.paths[`/api/v1${path}`]?.get;

      expect(operation).toBeDefined();
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(
        path === '/management-reports'
          ? ['200', '401', '403', '500']
          : ['200', '401', '403', '422', '500'],
      );

      const schema = operation.responses['200'].content?.['application/json']
        .schema as SchemaObject;

      expect(schema.required).toEqual(['data', 'meta']);
      expect(
        isList
          ? schema.properties?.data?.items?.$ref
          : schema.properties?.data?.$ref,
      ).toBe(`#/components/schemas/${dto}`);
    }

    const schemas = document.components.schemas;

    expect(schemas.AlertsReportDto.required?.sort()).toEqual([
      'byDay',
      'bySeverity',
      'bySource',
      'condition',
      'generatedAt',
      'intercurrences',
      'intercurrencesTruncated',
      'organization',
      'period',
      'resolution',
      'topPatients',
      'totals',
    ]);
    expect(schemas.IntercurrenceDto.properties).not.toHaveProperty('value');
    expect(schemas.CaregiverActivityReportDto.required?.sort()).toEqual([
      'caregivers',
      'condition',
      'generatedAt',
      'organization',
      'period',
      'summary',
    ]);
  });
});

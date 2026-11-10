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
import { AuditController } from '@/modules/Audit/audit.controller';
import { AUDIT_USE_CASES } from '@/modules/Audit/audit.module';
import { AuditEventQueryRepository } from '@/modules/Audit/repositories/auditEventQuery.repository';
import { AuditCsvService } from '@/modules/Audit/services/auditCsv.service';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';

import { sessionOf } from '../Patient/patient.fixtures';

interface SchemaObject {
  $ref?: string;
  required?: string[];
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
}

interface Operation {
  summary?: string;
  security?: unknown[];
  responses: Record<
    string,
    { content?: Record<string, { schema?: SchemaObject }> }
  >;
}

const SESSIONS = {
  'Bearer admin': sessionOf(ProfileCode.ADMIN),
  'Bearer caregiver': sessionOf(ProfileCode.CAREGIVER),
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

describe('Audit HTTP (e2e)', () => {
  let app: INestApplication;
  const repo = {
    list: jest.fn(),
    count: jest.fn(),
    listAll: jest.fn(),
    findById: jest.fn(),
    recordExport: jest.fn(),
  };
  const csv = new AuditCsvService();

  const server = (): App => app.getHttpServer() as App;
  const call = (path: string, who?: string) => {
    const pending = request(server()).get(`/api/v1${path}`);

    return who ? pending.set('Authorization', `Bearer ${who}`) : pending;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        ...AUDIT_USE_CASES,
        { provide: AuditEventQueryRepository, useValue: repo },
        { provide: AuditCsvService, useValue: csv },
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
    jest.restoreAllMocks();
    repo.list.mockResolvedValue([[], 0]);
    repo.count.mockResolvedValue(0);
    repo.listAll.mockResolvedValue([]);
    repo.findById.mockResolvedValue(null);
    repo.recordExport.mockResolvedValue(undefined);
  });

  it('sem token responde 401', async () => {
    expect((await call('/audit-events')).status).toBe(401);
  });

  it('falha ao gerar o CSV responde 500 em JSON, sem detalhe, e a nova tentativa funciona', async () => {
    jest.spyOn(csv, 'render').mockImplementationOnce(() => {
      throw new Error('falha interna do gerador');
    });

    const failed = await call('/audit-events/export', 'admin');

    expect(failed.status).toBe(500);
    expect(failed.body as object).toMatchObject({
      error: { code: 'AUDIT_EXPORT_FAILED', detail: null },
    });
    expect(JSON.stringify(failed.body)).not.toContain('gerador');
    expect(repo.recordExport).not.toHaveBeenCalled();

    const retried = await call('/audit-events/export', 'admin');

    expect(retried.status).toBe(200);
    expect(retried.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(repo.recordExport).toHaveBeenCalledTimes(1);
  });

  it('id invalido no detalhe responde 422', async () => {
    expect((await call('/audit-events/nao-e-uuid', 'admin')).status).toBe(422);
  });

  it('cuidador recebe 403 nas quatro rotas', async () => {
    for (const path of [
      '/audit-events',
      '/audit-events/actions',
      '/audit-events/export',
      '/audit-events/00000000-0000-4000-8000-000000000001',
    ]) {
      expect((await call(path, 'caregiver')).status).toBe(403);
    }
  });

  it('publica as quatro rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json')).body as {
      paths: Record<string, { get: Operation }>;
      components: { schemas: Record<string, SchemaObject> };
    };
    const routes: Array<[string, string[], string | null]> = [
      ['/api/v1/audit-events', ['200', '401', '403', '422'], 'AuditEventDto'],
      ['/api/v1/audit-events/actions', ['200', '401', '403'], 'AuditActionDto'],
      [
        '/api/v1/audit-events/{eventId}',
        ['200', '401', '403', '404', '422'],
        'AuditEventDetailDto',
      ],
      [
        '/api/v1/audit-events/export',
        ['200', '401', '403', '422', '500'],
        null,
      ],
    ];

    for (const [path, statuses, dto] of routes) {
      const operation = document.paths[path]?.get;

      expect(operation).toBeDefined();
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(statuses);

      if (dto) {
        const schema = operation.responses['200'].content?.['application/json']
          .schema as SchemaObject;
        const data = schema.properties?.data;

        expect(schema.required).toEqual(['data', 'meta']);
        expect(data?.$ref ?? data?.items?.$ref).toBe(
          `#/components/schemas/${dto}`,
        );
      } else {
        expect(operation.responses['200'].content?.['text/csv']).toBeDefined();
      }
    }

    expect(document.components.schemas.AuditEventDto.required?.sort()).toEqual([
      'action',
      'actionLabel',
      'actor',
      'entity',
      'id',
      'ipAddress',
      'occurredAt',
      'organization',
      'requestId',
      'severity',
    ]);
  });
});

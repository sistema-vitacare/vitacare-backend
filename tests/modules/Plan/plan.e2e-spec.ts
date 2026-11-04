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
import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import {
  PLATFORM_ADMIN_PERMISSIONS,
  TENANT_PROFILES,
  type TenantProfileCode,
} from '@/modules/Access/access.permissions';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { PlanController } from '@/modules/Plan/plan.controller';
import { PLAN_USE_CASES } from '@/modules/Plan/plan.module';
import { PlanRepository } from '@/modules/Plan/repositories/plan.repository';

const TENANT_ID = '0000000a-0000-4000-8000-00000000000a';
const PLATFORM_ID = '00000000-0000-4000-8000-000000000001';
const REQUEST_ID = '3333333a-0000-4000-8000-00000000000a';

interface SchemaObject {
  $ref?: string;
  type?: string;
  enum?: string[];
  required?: string[];
  nullable?: boolean;
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
}

interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        security?: unknown[];
        requestBody?: { content: Record<string, { schema: SchemaObject }> };
        responses: Record<
          string,
          { content?: Record<string, { schema?: SchemaObject }> }
        >;
      }
    >
  >;
  components: { schemas: Record<string, SchemaObject> };
}

interface ErrorBody {
  error: { code: string; fields: Array<{ field: string }> | null };
}

const tenantSession = (profile: TenantProfileCode): RequestContext => ({
  requestId: `req-${profile}`,
  userId: `user-${profile}`,
  organizationId: TENANT_ID,
  organizationKind: 'tenant',
  profile,
  permissions: new Set(TENANT_PROFILES[profile].permissions),
});

const SESSIONS: Record<string, RequestContext> = {
  'Bearer admin': tenantSession(ProfileCode.ADMIN),
  'Bearer professional': tenantSession(ProfileCode.PROFESSIONAL),
  'Bearer family': tenantSession(ProfileCode.FAMILY),
  'Bearer master': {
    requestId: 'req-master',
    userId: 'master-1',
    organizationId: PLATFORM_ID,
    organizationKind: 'platform',
    profile: ProfileCode.PLATFORM_ADMIN,
    permissions: new Set(PLATFORM_ADMIN_PERMISSIONS),
  },
};

class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = SESSIONS[request.headers.authorization ?? ''];

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

describe('Plan HTTP (e2e)', () => {
  let app: INestApplication;
  const plans = {
    listCatalog: jest.fn(),
    findOrganizationPlan: jest.fn(),
    assign: jest.fn(),
    listRequests: jest.fn(),
    createRequest: jest.fn(),
    cancelRequest: jest.fn(),
    approveRequest: jest.fn(),
    rejectRequest: jest.fn(),
  };

  const server = (): App => app.getHttpServer() as App;

  const call = (
    method: 'get' | 'post' | 'put',
    path: string,
    session: string | null,
    body?: object,
  ) => {
    const pending = request(server())[method](path);

    if (session) {
      pending.set('Authorization', `Bearer ${session}`);
    }

    return body ? pending.send(body) : pending;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PlanController],
      providers: [
        ...PLAN_USE_CASES,
        { provide: PlanRepository, useValue: plans },
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
    jest.resetAllMocks();
  });

  it('libera o catalogo ao admin e ao master, e nega ao familiar e sem bearer', async () => {
    plans.listCatalog.mockResolvedValue([]);

    expect((await call('get', '/api/v1/plans', 'admin')).status).toBe(200);
    expect((await call('get', '/api/v1/plans', 'master')).status).toBe(200);
    expect((await call('get', '/api/v1/plans', 'family')).status).toBe(403);
    expect((await call('get', '/api/v1/plans', null)).status).toBe(401);
  });

  it('nega ao admin as rotas de decisao e atribuicao da plataforma', async () => {
    const approve = await call(
      'post',
      `/api/v1/plan-change-requests/${REQUEST_ID}/approve`,
      'admin',
      {},
    );
    const assign = await call(
      'put',
      `/api/v1/organizations/${TENANT_ID}/plan`,
      'admin',
      { planId: REQUEST_ID },
    );

    expect([approve.status, assign.status]).toEqual([403, 403]);
    expect(plans.approveRequest).not.toHaveBeenCalled();
    expect(plans.assign).not.toHaveBeenCalled();
  });

  it('nega ao master criar pedido em nome de um tenant', async () => {
    const response = await call(
      'post',
      '/api/v1/plan-change-requests',
      'master',
      {
        requestedPlanId: REQUEST_ID,
      },
    );

    expect(response.status).toBe(403);
  });

  it('valida o corpo com 422 e fields sem chamar o banco', async () => {
    const create = await call('post', '/api/v1/plan-change-requests', 'admin', {
      requestedPlanId: 'nao-e-uuid',
    });
    const assign = await call(
      'put',
      `/api/v1/organizations/${TENANT_ID}/plan`,
      'master',
      { planId: REQUEST_ID, userLimit: -1, endsAt: 'amanha' },
    );
    const reject = await call(
      'post',
      `/api/v1/plan-change-requests/${REQUEST_ID}/reject`,
      'master',
      {},
    );

    expect((create.body as ErrorBody).error.fields?.[0].field).toBe(
      'requestedPlanId',
    );
    expect(
      (assign.body as ErrorBody).error.fields?.map((field) => field.field),
    ).toEqual(expect.arrayContaining(['userLimit', 'endsAt']));
    expect([create.status, assign.status, reject.status]).toEqual([
      422, 422, 422,
    ]);
    expect(plans.createRequest).not.toHaveBeenCalled();
    expect(plans.assign).not.toHaveBeenCalled();
    expect(plans.rejectRequest).not.toHaveBeenCalled();
  });

  it('cancela no escopo da organizacao da sessao', async () => {
    plans.cancelRequest.mockResolvedValue({ kind: 'not_found' });

    const response = await call(
      'post',
      `/api/v1/plan-change-requests/${REQUEST_ID}/cancel`,
      'admin',
    );

    expect(response.status).toBe(404);
    expect(plans.cancelRequest).toHaveBeenCalledWith(
      TENANT_ID,
      REQUEST_ID,
      expect.objectContaining({ userId: 'user-admin' }),
    );
  });

  it('publica as nove rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const expected: Array<[string, string, string, string[], string]> = [
      ['/api/v1/plans', 'get', '200', ['401', '403'], 'PlanDto'],
      [
        '/api/v1/organizations/me/plan',
        'get',
        '200',
        ['401', '403', '404'],
        'OrganizationPlanDto',
      ],
      [
        '/api/v1/organizations/{organizationId}/plan',
        'get',
        '200',
        ['401', '403', '404', '422'],
        'OrganizationPlanDto',
      ],
      [
        '/api/v1/organizations/{organizationId}/plan',
        'put',
        '200',
        ['401', '403', '404', '422'],
        'OrganizationPlanDto',
      ],
      [
        '/api/v1/plan-change-requests',
        'post',
        '201',
        ['401', '403', '409', '422'],
        'PlanChangeRequestDto',
      ],
      [
        '/api/v1/plan-change-requests',
        'get',
        '200',
        ['401', '403', '422'],
        'PlanChangeRequestDto',
      ],
      ...(['cancel', 'approve', 'reject'] as const).map(
        (action): [string, string, string, string[], string] => [
          `/api/v1/plan-change-requests/{requestId}/${action}`,
          'post',
          '200',
          ['401', '403', '404', '409', '422'],
          'PlanChangeRequestDto',
        ],
      ),
    ];

    for (const [path, method, success, errors, dto] of expected) {
      const operation = document.paths[path]?.[method];

      expect(operation).toBeDefined();
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(
        [success, ...errors].sort(),
      );

      const schema = operation.responses[success].content?.['application/json']
        .schema as SchemaObject;
      const data = schema.properties?.data as SchemaObject;

      expect(schema.required).toEqual(['data', 'meta']);
      expect(data.$ref ?? data.items?.$ref).toBe(`#/components/schemas/${dto}`);
    }

    const { schemas } = document.components;

    expect(schemas.PlanTermDto.properties?.status.enum).toEqual([
      'active',
      'expired',
    ]);
    expect(schemas.PlanChangeRequestDto.properties?.status.enum).toEqual([
      'pending',
      'approved',
      'rejected',
      'cancelled',
    ]);
    expect(schemas.PlanDto.properties?.features.items?.enum).toContain(
      'management_reports',
    );
    expect(schemas.RejectPlanChangeRequestDto.required).toEqual([
      'decisionNote',
    ]);
    expect(schemas.AssignOrganizationPlanDto.required).toEqual(['planId']);
    expect(schemas.PlanDto.required).toContain('expandable');
    expect(schemas.PlanDto.properties?.expandable.type).toBe('boolean');

    for (const [path, method] of [
      ['/api/v1/organizations/{organizationId}/plan', 'put'],
      ['/api/v1/plan-change-requests/{requestId}/approve', 'post'],
    ]) {
      const description = (
        document.paths[path][method].responses['422'] as {
          description: string;
        }
      ).description;

      expect(description).toContain('PLAN_LIMIT_NOT_EXPANDABLE');
      expect(description).toContain('PLAN_LIMIT_BELOW_CATALOG');
    }
  });
});

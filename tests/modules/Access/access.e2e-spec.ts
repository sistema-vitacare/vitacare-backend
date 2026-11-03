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
import { AccessController } from '@/modules/Access/access.controller';
import {
  PLATFORM_ADMIN_PERMISSIONS,
  TENANT_PROFILES,
  type TenantProfileCode,
} from '@/modules/Access/access.permissions';
import { ListAccessProfilesUseCase } from '@/modules/Access/ListAccessProfiles/listAccessProfiles.useCase';
import { AccessProfileRepository } from '@/modules/Access/repositories/accessProfile.repository';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';

const TENANT_A_ID = '0000000a-0000-4000-8000-00000000000a';
const PLATFORM_ORG_ID = '00000000-0000-4000-8000-000000000001';

interface EnvelopeBody<T> {
  data: T;
  meta: { requestId: string; pagination?: unknown };
}

interface ErrorBody {
  error: { code: string };
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
          { content?: Record<string, { schema?: { required?: string[] } }> }
        >;
      }
    >
  >;
}

const tenantSession = (profile: TenantProfileCode): RequestContext => ({
  requestId: `req-${profile}`,
  userId: `user-${profile}`,
  organizationId: TENANT_A_ID,
  organizationKind: 'tenant',
  profile,
  permissions: new Set(TENANT_PROFILES[profile].permissions),
});

const SESSIONS: Record<string, RequestContext> = {
  'Bearer admin': tenantSession(ProfileCode.ADMIN),
  'Bearer professional': tenantSession(ProfileCode.PROFESSIONAL),
  'Bearer caregiver': tenantSession(ProfileCode.CAREGIVER),
  'Bearer family': tenantSession(ProfileCode.FAMILY),
  'Bearer master': {
    requestId: 'req-master',
    userId: 'master-1',
    organizationId: PLATFORM_ORG_ID,
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

describe('Access HTTP (e2e)', () => {
  let app: INestApplication;
  const profiles = { listLiveWithPermissions: jest.fn() };

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AccessController],
      providers: [
        ListAccessProfilesUseCase,
        { provide: AccessProfileRepository, useValue: profiles },
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

  it('lista os perfis da organizacao da sessao para o admin', async () => {
    profiles.listLiveWithPermissions.mockResolvedValue([
      {
        code: 'family',
        name: 'Familiar',
        description: 'Familiar com acesso somente leitura',
        permissions: [{ code: 'patients:read', name: 'Consultar pacientes' }],
      },
      {
        code: 'admin',
        name: 'Administrador',
        description: null,
        permissions: [],
      },
    ]);

    const response = await request(server())
      .get('/api/v1/access-profiles')
      .set('Authorization', 'Bearer admin');

    const body = response.body as EnvelopeBody<Array<Record<string, unknown>>>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      {
        code: 'admin',
        name: 'Administrador',
        description: null,
        permissions: [],
      },
      {
        code: 'family',
        name: 'Familiar',
        description: 'Familiar com acesso somente leitura',
        permissions: [{ code: 'patients:read', name: 'Consultar pacientes' }],
      },
    ]);
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(body.meta).not.toHaveProperty('pagination');
    expect(profiles.listLiveWithPermissions).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: TENANT_A_ID }),
    );
  });

  it.each(['professional', 'caregiver', 'family', 'master'])(
    'responde 403 para a sessao %s',
    async (session) => {
      const response = await request(server())
        .get('/api/v1/access-profiles')
        .set('Authorization', `Bearer ${session}`);

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('AUTH_FORBIDDEN');
      expect(profiles.listLiveWithPermissions).not.toHaveBeenCalled();
    },
  );

  it('responde 401 sem bearer', async () => {
    const response = await request(server()).get('/api/v1/access-profiles');

    expect(response.status).toBe(401);
    expect((response.body as ErrorBody).error.code).toBe(
      'AUTH_UNAUTHENTICATED',
    );
  });

  it('publica a rota no OpenAPI com bearer, envelope e erros', async () => {
    const response = await request(server()).get('/api/docs-json');
    const operation = (response.body as OpenApiDocument).paths[
      '/api/v1/access-profiles'
    ]?.get;

    expect(operation).toBeDefined();
    expect(operation.summary).toEqual(expect.any(String));
    expect(operation.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(operation.responses)).toEqual(
      expect.arrayContaining(['200', '401', '403']),
    );
    expect(
      operation.responses['200'].content?.['application/json'].schema?.required,
    ).toEqual(['data', 'meta']);
  });
});

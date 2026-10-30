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
import { ChangeUserProfileUseCase } from '@/modules/User/ChangeUserProfile/changeUserProfile.useCase';
import { UserRepository } from '@/modules/User/repositories/user.repository';
import { UserController } from '@/modules/User/user.controller';

const TENANT_A_ID = '0000000a-0000-4000-8000-00000000000a';
const PLATFORM_ORG_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_ID = '1111111a-0000-4000-8000-00000000000a';
const TARGET_ID = '2222222a-0000-4000-8000-00000000000a';
const ROUTE = `/api/v1/users/${TARGET_ID}/profile`;

interface EnvelopeBody<T> {
  data: T;
  meta: { requestId: string; pagination?: unknown };
}

interface ErrorBody {
  error: {
    code: string;
    fields: Array<{ field: string; code: string }> | null;
  };
}

interface SchemaObject {
  $ref?: string;
  enum?: string[];
  required?: string[];
  properties?: Record<string, SchemaObject>;
}

interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        security?: unknown[];
        parameters?: Array<{ name: string; in: string }>;
        requestBody?: {
          content: Record<string, { schema: SchemaObject }>;
        };
        responses: Record<
          string,
          { content?: Record<string, { schema?: SchemaObject }> }
        >;
      }
    >
  >;
  components: { schemas: Record<string, SchemaObject> };
}

const tenantSession = (
  profile: TenantProfileCode,
  userId: string = `user-${profile}`,
): RequestContext => ({
  requestId: `req-${profile}`,
  userId,
  organizationId: TENANT_A_ID,
  organizationKind: 'tenant',
  profile,
  permissions: new Set(TENANT_PROFILES[profile].permissions),
});

const SESSIONS: Record<string, RequestContext> = {
  'Bearer admin': tenantSession(ProfileCode.ADMIN, ADMIN_ID),
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

describe('User HTTP (e2e)', () => {
  let app: INestApplication;
  let useCase: ChangeUserProfileUseCase;
  let execute: jest.SpyInstance;
  const users = { changeProfile: jest.fn() };

  const server = (): App => app.getHttpServer() as App;

  const patch = (path: string, session: string | null, body: unknown) => {
    const call = request(server())
      .patch(path)
      .send(body as object);

    return session ? call.set('Authorization', `Bearer ${session}`) : call;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        ChangeUserProfileUseCase,
        { provide: UserRepository, useValue: users },
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

    useCase = moduleRef.get(ChangeUserProfileUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    execute?.mockRestore();
    execute = jest.spyOn(useCase, 'execute');
  });

  it('troca o perfil e responde 200 envelopado para o admin', async () => {
    users.changeProfile.mockResolvedValue({
      kind: 'changed',
      user: {
        id: TARGET_ID,
        name: 'Usuaria Sintetica',
        profileCode: 'family',
        profileName: 'Familiar',
      },
    });

    const response = await patch(ROUTE, 'admin', { profileCode: 'family' });
    const body = response.body as EnvelopeBody<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      id: TARGET_ID,
      name: 'Usuaria Sintetica',
      profile: { code: 'family', name: 'Familiar' },
    });
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(body.meta).not.toHaveProperty('pagination');
    expect(users.changeProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: TENANT_A_ID,
        actorUserId: ADMIN_ID,
        targetUserId: TARGET_ID,
        profileCode: 'family',
      }),
    );
  });

  it('responde 404 USER_NOT_FOUND para alvo fora da organizacao', async () => {
    users.changeProfile.mockResolvedValue({ kind: 'not_found' });

    const response = await patch(ROUTE, 'admin', { profileCode: 'family' });

    expect(response.status).toBe(404);
    expect((response.body as ErrorBody).error.code).toBe('USER_NOT_FOUND');
  });

  it('responde 409 USER_SELF_PROFILE_CHANGE quando o alvo e a propria conta', async () => {
    const response = await patch(`/api/v1/users/${ADMIN_ID}/profile`, 'admin', {
      profileCode: 'family',
    });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe(
      'USER_SELF_PROFILE_CHANGE',
    );
    expect(users.changeProfile).not.toHaveBeenCalled();
  });

  it.each(['professional', 'caregiver', 'family', 'master'])(
    'responde 403 para a sessao %s',
    async (session) => {
      const response = await patch(ROUTE, session, { profileCode: 'family' });

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('AUTH_FORBIDDEN');
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('responde 401 sem bearer', async () => {
    const response = await patch(ROUTE, null, { profileCode: 'family' });

    expect(response.status).toBe(401);
    expect((response.body as ErrorBody).error.code).toBe(
      'AUTH_UNAUTHENTICATED',
    );
  });

  it('responde 422 com fields userId quando o id nao e UUID', async () => {
    const response = await patch('/api/v1/users/nao-e-uuid/profile', 'admin', {
      profileCode: 'family',
    });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.fields?.[0].field).toBe('userId');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['platform_admin', { profileCode: 'platform_admin' }, 'profileCode'],
    ['codigo desconhecido', { profileCode: 'chefe' }, 'profileCode'],
    ['corpo vazio', {}, 'profileCode'],
    ['propriedade extra', { profileCode: 'family', extra: 1 }, 'extra'],
  ])(
    'responde 422 para %s sem chamar o caso de uso',
    async (_, body, field) => {
      const response = await patch(ROUTE, 'admin', body);
      const error = (response.body as ErrorBody).error;

      expect(response.status).toBe(422);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.fields?.map((item) => item.field)).toContain(field);
      expect(execute).not.toHaveBeenCalled();
      expect(users.changeProfile).not.toHaveBeenCalled();
    },
  );

  it('publica a rota no OpenAPI com bearer, envelope, erros e enum dos perfis', async () => {
    const response = await request(server()).get('/api/docs-json');
    const document = response.body as OpenApiDocument;
    const operation = document.paths['/api/v1/users/{userId}/profile']?.patch;

    expect(operation).toBeDefined();
    expect(operation.summary).toEqual(expect.any(String));
    expect(operation.security).toEqual([{ bearer: [] }]);
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'userId', in: 'path' }),
      ]),
    );
    expect(Object.keys(operation.responses)).toEqual(
      expect.arrayContaining(['200', '401', '403', '404', '409', '422']),
    );

    const success = operation.responses['200'].content?.['application/json']
      .schema as SchemaObject;

    expect(success.required).toEqual(['data', 'meta']);
    expect(success.properties?.data.$ref).toBe(
      '#/components/schemas/ChangeUserProfileResponseDto',
    );

    const bodyRef =
      operation.requestBody?.content['application/json'].schema.$ref ?? '';
    const bodySchema =
      document.components.schemas[bodyRef.replace('#/components/schemas/', '')];

    expect(bodySchema.required).toEqual(['profileCode']);
    expect(bodySchema.properties?.profileCode.enum).toEqual([
      'admin',
      'professional',
      'caregiver',
      'family',
    ]);
  });
});

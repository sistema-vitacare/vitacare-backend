import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { ChangeUserProfileUseCase } from '@/modules/User/ChangeUserProfile/changeUserProfile.useCase';
import { UserRepository } from '@/modules/User/repositories/user.repository';
import { UserController } from '@/modules/User/user.controller';
import { USER_USE_CASES } from '@/modules/User/user.module';

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
  const users = {
    changeProfile: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
    reissueInvitation: jest.fn(),
  };
  const passwords = { hash: jest.fn() };
  const config = { getOrThrow: jest.fn() };

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
        ...USER_USE_CASES,
        { provide: UserRepository, useValue: users },
        { provide: PasswordHasher, useValue: passwords },
        { provide: ConfigService, useValue: config },
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
    expect(
      document.components.schemas.UserProfileRefDto.properties?.code.enum,
    ).toEqual(['admin', 'professional', 'caregiver', 'family']);
    expect(bodySchema.properties?.profileCode.enum).toEqual([
      'admin',
      'professional',
      'caregiver',
      'family',
    ]);
  });

  describe('CRUD de usuarios (HTTP)', () => {
    const userRow = {
      id: TARGET_ID,
      name: 'Usuaria Sintetica',
      email: 'usuaria@example.test',
      cpf: '52998224725',
      phone: null,
      status: 'pending',
      profileCode: 'caregiver',
      profileName: 'Cuidador',
      temporaryPasswordExpiresAt: new Date(Date.now() + 86_400_000),
      lastAccessAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const send = (
      method: 'get' | 'post' | 'patch',
      path: string,
      session: string | null,
      body?: object,
    ) => {
      const call = request(server())[method](path);

      if (session) {
        call.set('Authorization', `Bearer ${session}`);
      }

      return body ? call.send(body) : call;
    };

    const validBody = {
      name: 'Usuaria Sintetica',
      email: 'usuaria@example.test',
      cpf: '529.982.247-25',
      profileCode: 'caregiver',
    };

    beforeEach(() => {
      passwords.hash.mockResolvedValue('hash');
      config.getOrThrow.mockReturnValue(86400);
    });

    it('cadastra com 201, no-store, senha provisoria e convite pendente', async () => {
      users.create.mockResolvedValue({ kind: 'created', user: userRow });

      const response = await send('post', '/api/v1/users', 'admin', validBody);
      const body = response.body as EnvelopeBody<Record<string, unknown>>;

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(typeof body.data.temporaryPassword).toBe('string');
      expect(typeof body.data.expiresAt).toBe('string');
      expect(body.data).toMatchObject({
        user: {
          id: TARGET_ID,
          status: 'pending',
          invitation: { status: 'pending' },
        },
      });
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: TENANT_A_ID,
          actorUserId: ADMIN_ID,
          cpf: '52998224725',
        }),
      );
    });

    it('responde 422 com fields para CPF invalido sem chamar o banco', async () => {
      const response = await send('post', '/api/v1/users', 'admin', {
        ...validBody,
        cpf: '11111111111',
      });

      expect(response.status).toBe(422);
      expect(
        (response.body as ErrorBody).error.fields?.map((item) => item.field),
      ).toEqual(['cpf']);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('lista com meta.pagination e CPF mascarado', async () => {
      users.list.mockResolvedValue([[userRow], 1]);

      const response = await send(
        'get',
        '/api/v1/users?page=1&limit=10',
        'admin',
      );
      const body = response.body as EnvelopeBody<Array<{ cpf: string }>>;

      expect(response.status).toBe(200);
      expect(body.data[0].cpf).toBe('***.982.247-**');
      expect(body.meta.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('responde 422 USER_NOTHING_TO_UPDATE para PATCH vazio', async () => {
      const response = await send(
        'patch',
        `/api/v1/users/${TARGET_ID}`,
        'admin',
        {},
      );

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe(
        'USER_NOTHING_TO_UPDATE',
      );
    });

    it('reemite o convite com 201 e no-store', async () => {
      users.reissueInvitation.mockResolvedValue({ kind: 'reissued' });

      const response = await send(
        'post',
        `/api/v1/users/${TARGET_ID}/invitation`,
        'admin',
      );

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each([
      ['post', '/api/v1/users', validBody],
      ['get', '/api/v1/users', undefined],
      ['get', `/api/v1/users/${TARGET_ID}`, undefined],
      ['patch', `/api/v1/users/${TARGET_ID}`, { name: 'Outro' }],
      ['post', `/api/v1/users/${TARGET_ID}/deactivate`, undefined],
      ['post', `/api/v1/users/${TARGET_ID}/reactivate`, undefined],
      ['post', `/api/v1/users/${TARGET_ID}/invitation`, undefined],
    ] as const)(
      'responde 403 em %s %s para todo perfil nao admin e para o master',
      async (method, path, body) => {
        for (const session of [
          'professional',
          'caregiver',
          'family',
          'master',
        ]) {
          const response = await send(method, path, session, body);

          expect(response.status).toBe(403);
        }

        expect(Object.values(users).some((fn) => fn.mock.calls.length)).toBe(
          false,
        );
      },
    );

    it('publica as sete rotas no OpenAPI com bearer, envelope e erros', async () => {
      const document = (await request(server()).get('/api/docs-json'))
        .body as OpenApiDocument;

      const expected: Array<[string, string, string, string[], string]> = [
        [
          '/api/v1/users',
          'post',
          '201',
          ['401', '403', '409', '422'],
          'CreateUserResponseDto',
        ],
        ['/api/v1/users', 'get', '200', ['401', '403', '422'], 'UserDto'],
        [
          '/api/v1/users/{userId}',
          'get',
          '200',
          ['401', '403', '404', '422'],
          'UserDto',
        ],
        [
          '/api/v1/users/{userId}',
          'patch',
          '200',
          ['401', '403', '404', '409', '422'],
          'UserDto',
        ],
        [
          '/api/v1/users/{userId}/deactivate',
          'post',
          '200',
          ['401', '403', '404', '409', '422'],
          'UserDto',
        ],
        [
          '/api/v1/users/{userId}/reactivate',
          'post',
          '200',
          ['401', '403', '404', '409', '422'],
          'UserDto',
        ],
        [
          '/api/v1/users/{userId}/invitation',
          'post',
          '201',
          ['401', '403', '404', '409', '422'],
          'UserInvitationResponseDto',
        ],
      ];

      for (const [path, method, success, errors, dto] of expected) {
        const operation = document.paths[path]?.[method];

        expect(operation).toBeDefined();
        expect(operation.security).toEqual([{ bearer: [] }]);
        expect(Object.keys(operation.responses).sort()).toEqual(
          [success, ...errors].sort(),
        );

        const schema = operation.responses[success].content?.[
          'application/json'
        ].schema as SchemaObject & {
          properties?: Record<string, SchemaObject & { items?: SchemaObject }>;
        };
        const data = schema.properties?.data as SchemaObject & {
          items?: SchemaObject;
        };

        expect(data.$ref ?? data.items?.$ref).toBe(
          `#/components/schemas/${dto}`,
        );
      }

      const user = document.components.schemas.UserDto;

      expect(user.properties?.status.enum).toEqual([
        'pending',
        'active',
        'inactive',
      ]);
      expect(user.properties).toHaveProperty('invitation');
      expect(user.properties).not.toHaveProperty('passwordHash');
    });
  });
});

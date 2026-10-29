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
import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import {
  PLATFORM_ADMIN_PERMISSIONS,
  TENANT_ADMIN_PERMISSIONS,
} from '@/modules/Access/access.permissions';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { DeactivateOrganizationUseCase } from '@/modules/Organization/DeactivateOrganization/deactivateOrganization.useCase';
import { GetOrganizationUseCase } from '@/modules/Organization/GetOrganization/getOrganization.useCase';
import { ListOrganizationsUseCase } from '@/modules/Organization/ListOrganizations/listOrganizations.useCase';
import { OrganizationController } from '@/modules/Organization/organization.controller';
import { OrganizationErrors } from '@/modules/Organization/organization.errors';
import { ReactivateOrganizationUseCase } from '@/modules/Organization/ReactivateOrganization/reactivateOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';
import { UpdateOrganizationUseCase } from '@/modules/Organization/UpdateOrganization/updateOrganization.useCase';

import {
  organizationOf,
  platformContext,
  repositoryMock,
  TENANT_A_ID,
  TENANT_B_ID,
  tenantContext,
} from './organization.fixtures';

interface EnvelopeBody<T> {
  data: T;
  meta: {
    requestId: string;
    pagination?: Record<string, number>;
  };
}

interface ErrorBody {
  error: { code: string; fields: Array<{ field: string }> | null };
}

interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        security?: unknown[];
        responses: Record<
          string,
          { content?: Record<string, { schema?: { required?: string[] } }> }
        >;
      }
    >
  >;
}

const SESSIONS: Record<string, RequestContext> = {
  'Bearer master': {
    ...platformContext,
    permissions: new Set(PLATFORM_ADMIN_PERMISSIONS),
  },
  'Bearer admin-a': {
    ...tenantContext,
    permissions: new Set(TENANT_ADMIN_PERMISSIONS),
  },
  'Bearer admin-a-com-permissao-de-plataforma': {
    ...tenantContext,
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

const validCreateBody = {
  code: 'clinica-nova',
  tradeName: 'Clinica Nova',
  document: '11.222.333/0001-81',
  usagePlanId: '0000000c-0000-4000-8000-00000000000c',
  administrator: {
    name: 'Admin Nova',
    email: ' Admin@Nova.TEST ',
    cpf: '529.982.247-25',
  },
};

describe('Organization HTTP (e2e)', () => {
  let app: INestApplication;
  const organizations = repositoryMock();

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationController],
      providers: [
        CreateOrganizationUseCase,
        ListOrganizationsUseCase,
        GetOrganizationUseCase,
        UpdateOrganizationUseCase,
        DeactivateOrganizationUseCase,
        ReactivateOrganizationUseCase,
        { provide: OrganizationRepository, useValue: organizations },
        {
          provide: PasswordHasher,
          useValue: { hash: jest.fn().mockResolvedValue('hash') },
        },
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

  describe('organizacao da sessao', () => {
    it('consulta a propria organizacao pelo contexto, sem expor o tipo', async () => {
      organizations.findReachable.mockResolvedValue(organizationOf());

      const response = await request(server())
        .get('/api/v1/organizations/me')
        .set('Authorization', 'Bearer admin-a');

      const body = response.body as EnvelopeBody<Record<string, unknown>>;

      expect(response.status).toBe(200);
      expect(body.data.id).toBe(TENANT_A_ID);
      expect(body.data).not.toHaveProperty('kind');
      expect(organizations.findReachable).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: TENANT_A_ID }),
        TENANT_A_ID,
      );
    });

    it('edita a propria organizacao e rejeita campo fora do contrato', async () => {
      organizations.findReachable.mockResolvedValue(organizationOf());
      organizations.update.mockResolvedValue(
        organizationOf({ tradeName: 'Clinica A Renomeada' }),
      );

      const ok = await request(server())
        .patch('/api/v1/organizations/me')
        .set('Authorization', 'Bearer admin-a')
        .send({ tradeName: '  Clinica A Renomeada ', legalName: null });

      expect(ok.status).toBe(200);
      expect(organizations.update).toHaveBeenCalledWith(
        TENANT_A_ID,
        { tradeName: 'Clinica A Renomeada', legalName: null },
        expect.anything(),
      );

      const invalid = await request(server())
        .patch('/api/v1/organizations/me')
        .set('Authorization', 'Bearer admin-a')
        .send({ code: 'outro-codigo', tradeName: null });

      const body = invalid.body as ErrorBody;

      expect(invalid.status).toBe(422);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.fields?.map((field) => field.field)).toEqual(
        expect.arrayContaining(['code', 'tradeName']),
      );
    });

    it('responde 422 para corpo vazio', async () => {
      const response = await request(server())
        .patch('/api/v1/organizations/me')
        .set('Authorization', 'Bearer admin-a')
        .send({});

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe(
        'ORGANIZATION_NOTHING_TO_UPDATE',
      );
    });
  });

  describe('administracao da plataforma', () => {
    it('cria organizacao, normaliza o administrador e impede cache da senha', async () => {
      organizations.create.mockResolvedValue({
        organization: organizationOf({ code: 'clinica-nova' }),
        administratorId: 'admin-novo',
      });

      const response = await request(server())
        .post('/api/v1/organizations')
        .set('Authorization', 'Bearer master')
        .send(validCreateBody);

      const body = response.body as EnvelopeBody<Record<string, unknown>>;

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body.data.temporaryPassword).toEqual(expect.any(String));
      expect(organizations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          administrator: expect.objectContaining({
            email: 'admin@nova.test',
            cpf: '52998224725',
          }) as unknown,
        }),
        expect.objectContaining({ userId: 'master-1' }),
      );
    });

    it('valida CPF, plano e codigo antes do caso de uso', async () => {
      const response = await request(server())
        .post('/api/v1/organizations')
        .set('Authorization', 'Bearer master')
        .send({
          ...validCreateBody,
          code: 'Codigo Invalido',
          usagePlanId: 'nao-e-uuid',
          administrator: {
            ...validCreateBody.administrator,
            cpf: '11111111111',
          },
        });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(422);
      expect(body.error.fields?.map((field) => field.field)).toEqual(
        expect.arrayContaining(['code', 'usagePlanId', 'administrator.cpf']),
      );
      expect(organizations.create).not.toHaveBeenCalled();
    });

    it('propaga codigo duplicado como 409', async () => {
      organizations.create.mockRejectedValue(
        new DomainException({
          ...OrganizationErrors.CODE_TAKEN,
          detail: 'Violação de unicidade.',
        }),
      );

      const response = await request(server())
        .post('/api/v1/organizations')
        .set('Authorization', 'Bearer master')
        .send(validCreateBody);

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe(
        'ORGANIZATION_CODE_TAKEN',
      );
    });

    it('lista com paginacao e filtros', async () => {
      organizations.list.mockResolvedValue([[organizationOf()], 1]);

      const response = await request(server())
        .get(
          '/api/v1/organizations?status=active&search=clinica&page=1&limit=5',
        )
        .set('Authorization', 'Bearer master');

      const body = response.body as EnvelopeBody<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.meta.pagination).toEqual({
        page: 1,
        limit: 5,
        total: 1,
        totalPages: 1,
      });
      expect(organizations.list).toHaveBeenCalledWith({
        status: 'active',
        search: 'clinica',
        skip: 0,
        take: 5,
      });
    });

    it('consulta, inativa e reativa outra organizacao', async () => {
      organizations.findReachable.mockResolvedValue(
        organizationOf({ id: TENANT_B_ID }),
      );
      organizations.changeStatus.mockResolvedValue(
        organizationOf({
          id: TENANT_B_ID,
          status: 'inactive',
          deletedAt: new Date('2026-09-22T11:00:00.000Z'),
        }),
      );

      const detail = await request(server())
        .get(`/api/v1/organizations/${TENANT_B_ID}`)
        .set('Authorization', 'Bearer master');

      expect(detail.status).toBe(200);
      expect((detail.body as EnvelopeBody<{ kind: string }>).data.kind).toBe(
        'tenant',
      );

      const deactivated = await request(server())
        .post(`/api/v1/organizations/${TENANT_B_ID}/deactivate`)
        .set('Authorization', 'Bearer master');

      expect(deactivated.status).toBe(200);
      expect(
        (deactivated.body as EnvelopeBody<{ status: string }>).data.status,
      ).toBe('inactive');

      organizations.findReachable.mockResolvedValue(
        organizationOf({ id: TENANT_B_ID, status: 'inactive' }),
      );
      organizations.changeStatus.mockResolvedValue(
        organizationOf({ id: TENANT_B_ID }),
      );

      const reactivated = await request(server())
        .post(`/api/v1/organizations/${TENANT_B_ID}/reactivate`)
        .set('Authorization', 'Bearer master');

      expect(reactivated.status).toBe(200);
    });

    it('responde 422 para identificador fora do formato UUID', async () => {
      const response = await request(server())
        .get('/api/v1/organizations/nao-e-uuid')
        .set('Authorization', 'Bearer master');

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.fields?.[0].field).toBe(
        'organizationId',
      );
    });
  });

  describe('negativas de acesso', () => {
    it.each([
      ['post', '/api/v1/organizations'],
      ['get', '/api/v1/organizations'],
      ['get', `/api/v1/organizations/${TENANT_A_ID}`],
      ['patch', `/api/v1/organizations/${TENANT_B_ID}`],
      ['post', `/api/v1/organizations/${TENANT_B_ID}/deactivate`],
      ['post', `/api/v1/organizations/${TENANT_B_ID}/reactivate`],
    ] as const)('admin de tenant recebe 403 em %s %s', async (method, path) => {
      const response = await request(server())
        [method](path)
        .set('Authorization', 'Bearer admin-a')
        .send(validCreateBody);

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('AUTH_FORBIDDEN');
    });

    it('permissao de plataforma em sessao de tenant nao alcanca outro tenant', async () => {
      organizations.findReachable.mockImplementation(
        (ctx: RequestContext, id: string) =>
          Promise.resolve(ctx.organizationId === id ? organizationOf() : null),
      );

      const token = 'Bearer admin-a-com-permissao-de-plataforma';

      const list = await request(server())
        .get('/api/v1/organizations')
        .set('Authorization', token);

      expect(list.status).toBe(403);

      const other = await request(server())
        .get(`/api/v1/organizations/${TENANT_B_ID}`)
        .set('Authorization', token);

      expect(other.status).toBe(404);
      expect(organizations.list).not.toHaveBeenCalled();
    });

    it('sem sessao responde 401', async () => {
      const response = await request(server()).get('/api/v1/organizations/me');

      expect(response.status).toBe(401);
    });
  });

  it('publica as oito rotas com envelope e Bearer no OpenAPI', async () => {
    const response = await request(server()).get('/api/docs-json');
    const document = response.body as OpenApiDocument;

    const operations: Array<[string, string, string]> = [
      ['/api/v1/organizations/me', 'get', '200'],
      ['/api/v1/organizations/me', 'patch', '200'],
      ['/api/v1/organizations', 'post', '201'],
      ['/api/v1/organizations', 'get', '200'],
      ['/api/v1/organizations/{organizationId}', 'get', '200'],
      ['/api/v1/organizations/{organizationId}', 'patch', '200'],
      ['/api/v1/organizations/{organizationId}/deactivate', 'post', '200'],
      ['/api/v1/organizations/{organizationId}/reactivate', 'post', '200'],
    ];

    for (const [path, method, status] of operations) {
      const operation = document.paths[path]?.[method];

      expect(operation).toBeDefined();
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(
        operation.responses[status].content?.['application/json'].schema
          ?.required,
      ).toEqual(['data', 'meta']);
    }
  });
});

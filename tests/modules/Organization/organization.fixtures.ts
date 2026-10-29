import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import type { Organization } from '@/modules/Organization/entities/organization.entity';

export const PLATFORM_ORG_ID = '00000000-0000-4000-8000-000000000001';
export const TENANT_A_ID = '0000000a-0000-4000-8000-00000000000a';
export const TENANT_B_ID = '0000000b-0000-4000-8000-00000000000b';

export const platformContext: RequestContext = {
  requestId: 'req-plataforma',
  userId: 'master-1',
  organizationId: PLATFORM_ORG_ID,
  organizationKind: 'platform',
  profile: ProfileCode.PLATFORM_ADMIN,
  permissions: new Set(),
};

export const tenantContext: RequestContext = {
  requestId: 'req-tenant',
  userId: 'admin-a',
  organizationId: TENANT_A_ID,
  organizationKind: 'tenant',
  profile: ProfileCode.ADMIN,
  permissions: new Set(),
};

export const organizationOf = (
  overrides: Partial<Organization> = {},
): Organization => ({
  id: TENANT_A_ID,
  code: 'clinica-a',
  kind: 'tenant',
  usagePlanId: '0000000c-0000-4000-8000-00000000000c',
  tradeName: 'Clinica A',
  legalName: null,
  document: null,
  phone: null,
  email: null,
  status: 'active',
  createdAt: new Date('2026-09-22T10:00:00.000Z'),
  updatedAt: new Date('2026-09-22T10:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});

export const repositoryMock = () => ({
  findReachable: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  changeStatus: jest.fn(),
});

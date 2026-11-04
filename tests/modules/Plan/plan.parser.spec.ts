import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import {
  toOrganizationPlanResponse,
  toPlanChangeRequestResponse,
} from '@/modules/Plan/parsers/plan.parser';
import type {
  OrganizationPlanRow,
  PlanChangeRequestRow,
} from '@/modules/Plan/types/plan.types';

const tenant: RequestContext = {
  requestId: 'req',
  userId: 'admin-1',
  organizationId: 'org-1',
  organizationKind: 'tenant',
  profile: ProfileCode.ADMIN,
  permissions: new Set(),
};

const platform: RequestContext = {
  ...tenant,
  organizationKind: 'platform',
  profile: ProfileCode.PLATFORM_ADMIN,
};

const request: PlanChangeRequestRow = {
  id: 'req-1',
  organizationId: 'org-1',
  currentPlan: { id: 'p1', code: 'basic', name: 'Basic' },
  requestedPlan: { id: 'p2', code: 'enterprise', name: 'Enterprise' },
  notes: null,
  status: 'approved',
  requestedByUserId: 'admin-1',
  decidedByUserId: 'master-1',
  decidedAt: new Date('2026-11-03T12:00:00.000Z'),
  decisionNote: 'ok',
  createdAt: new Date('2026-11-02T12:00:00.000Z'),
};

const row = (
  term: Partial<OrganizationPlanRow['term']>,
): OrganizationPlanRow => ({
  organizationId: 'org-1',
  plan: {
    id: 'p1',
    code: 'basic',
    name: 'Basic',
    description: null,
    userLimit: 10,
    patientLimit: 200,
    features: ['patient_management'],
    monthlyPrice: '499.00',
    expandable: false,
  },
  term: {
    id: 't1',
    startsAt: new Date('2026-11-01T00:00:00.000Z'),
    endsAt: null,
    userLimit: null,
    patientLimit: null,
    origin: 'initial',
    expired: false,
    ...term,
  },
  usage: { users: 3, patients: 7 },
});

describe('plan.parser', () => {
  it('esconde do tenant quem decidiu e mostra a plataforma', () => {
    expect(
      toPlanChangeRequestResponse(request, tenant).decidedByUserId,
    ).toBeNull();
    expect(toPlanChangeRequestResponse(request, platform).decidedByUserId).toBe(
      'master-1',
    );
  });

  it('usa o limite personalizado e cai no do catalogo quando ele e nulo', () => {
    expect(
      toOrganizationPlanResponse(row({ userLimit: 0 }), null, tenant).limits,
    ).toEqual({ users: 0, patients: 200 });
    expect(toOrganizationPlanResponse(row({}), null, tenant).limits).toEqual({
      users: 10,
      patients: 200,
    });
  });

  it('expoe preco e possibilidade de expansao do plano', () => {
    expect(
      toOrganizationPlanResponse(row({}), null, tenant).plan,
    ).toMatchObject({
      monthlyPrice: '499.00',
      expandable: false,
    });
  });

  it('marca o termo vencido e nao inventa uso de pacientes', () => {
    const response = toOrganizationPlanResponse(
      row({ expired: true, endsAt: new Date('2026-11-02T00:00:00.000Z') }),
      null,
      tenant,
    );

    expect(response.term).toMatchObject({
      status: 'expired',
      endsAt: '2026-11-02T00:00:00.000Z',
    });
    expect(response.usage).toEqual({ users: 3, patients: 7 });
  });
});

import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import {
  TENANT_PROFILES,
  type TenantProfileCode,
} from '@/modules/Access/access.permissions';
import type { PatientRow } from '@/modules/Patient/types/patient.types';

export const ORGANIZATION_ID = '0000000a-0000-4000-8000-00000000000a';
export const ACTOR_ID = '1111111a-0000-4000-8000-00000000000a';
export const PATIENT_ID = '3333333a-0000-4000-8000-00000000000a';
export const RESPONSIBLE_ID = '4444444a-0000-4000-8000-00000000000a';

export const sessionOf = (
  profile: TenantProfileCode,
  userId = ACTOR_ID,
): RequestContext => ({
  requestId: `req-${profile}`,
  userId,
  organizationId: ORGANIZATION_ID,
  organizationKind: 'tenant',
  profile,
  permissions: new Set(TENANT_PROFILES[profile].permissions),
});

export const professionalCtx = sessionOf(ProfileCode.PROFESSIONAL);

export const patientRow = (
  overrides: Partial<PatientRow> = {},
): PatientRow => ({
  id: PATIENT_ID,
  name: 'Paciente Sintetico',
  birthDate: '1948-03-12',
  sex: 'female',
  cpf: '52998224725',
  phone: null,
  email: null,
  zipCode: '01310100',
  street: 'Avenida Exemplo',
  addressNumber: '100',
  addressComplement: null,
  district: 'Centro',
  city: 'Sao Paulo',
  state: 'SP',
  mainCondition: 'Hipertensao arterial',
  secondaryConditions: ['Diabetes tipo 2'],
  healthPlan: null,
  notes: null,
  status: 'active',
  responsibleId: RESPONSIBLE_ID,
  responsibleName: 'Profissional Sintetico',
  responsibleStatus: 'active',
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  updatedAt: new Date('2026-11-02T10:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});

export const captureError = async (
  promise: Promise<unknown>,
): Promise<DomainException> => {
  try {
    await promise;
  } catch (error) {
    return error as DomainException;
  }

  throw new Error('O caso de uso deveria ter falhado.');
};

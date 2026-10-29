import type { OrganizationStatus } from '../entities/organization.entity';

export interface OrganizationActor {
  userId: string;
  organizationId: string;
  requestId: string;
}

export interface OrganizationPatch {
  tradeName?: string;
  legalName?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface NewOrganizationRecord {
  code: string;
  tradeName: string;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  usagePlanId: string;
  administrator: {
    name: string;
    email: string;
    cpf: string;
    phone: string | null;
    passwordHash: string;
  };
}

export interface OrganizationListFilters {
  status?: OrganizationStatus;
  search?: string;
  skip: number;
  take: number;
}

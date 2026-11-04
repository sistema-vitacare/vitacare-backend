/** Recursos do catalogo do TCC (secao 3.3); a checagem fica no modulo dono. */
export const PLAN_FEATURES = [
  'patient_management',
  'health_records',
  'patient_history',
  'automatic_alerts',
  'responsive_access',
  'extended_registration',
  'management_reports',
  'operational_dashboard',
  'custom_deployment',
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];

export const PLAN_TERM_ORIGINS = [
  'initial',
  'assignment',
  'change_request',
  'migration',
] as const;

export type PlanTermOrigin = (typeof PLAN_TERM_ORIGINS)[number];

export const PLAN_TERM_STATUSES = ['active', 'expired'] as const;

export type PlanTermStatus = (typeof PLAN_TERM_STATUSES)[number];

export const PLAN_CHANGE_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
] as const;

export type PlanChangeRequestStatus =
  (typeof PLAN_CHANGE_REQUEST_STATUSES)[number];

export interface PlanActor {
  userId: string;
  organizationId: string;
  requestId: string;
}

export interface PlanSummaryRow {
  id: string;
  code: string;
  name: string;
}

/** Plano corrente com o termo vigente e o limite efetivo ja resolvido. */
export interface OrganizationPlanRow {
  organizationId: string;
  plan: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    userLimit: number;
    patientLimit: number;
    features: PlanFeature[];
    monthlyPrice: string | null;
  };
  term: {
    id: string;
    startsAt: Date;
    endsAt: Date | null;
    userLimit: number | null;
    patientLimit: number | null;
    origin: PlanTermOrigin;
    expired: boolean;
  };
  usage: { users: number };
}

export interface PlanChangeRequestRow {
  id: string;
  organizationId: string;
  currentPlan: PlanSummaryRow;
  requestedPlan: PlanSummaryRow;
  notes: string | null;
  status: PlanChangeRequestStatus;
  requestedByUserId: string;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

/** Atribuicao e substituicao completa: limite omitido volta ao do catalogo. */
export interface PlanTermInput {
  endsAt: Date | null;
  userLimit: number | null;
  patientLimit: number | null;
}

export interface PlanChangeRequestFilters {
  organizationId?: string;
  status?: PlanChangeRequestStatus;
  skip: number;
  take: number;
}

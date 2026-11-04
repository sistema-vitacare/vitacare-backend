import type {
  PatientLinkRole,
  PatientStatus,
} from '@/modules/Patient/types/patient.types';

export type PatientLinkStatus = 'active' | 'revoked';

/** Vinculo com paciente e usuario, como sai das consultas. */
export interface PatientLinkRow {
  id: string;
  patientId: string;
  patientName: string;
  patientStatus: PatientStatus;
  userId: string;
  userName: string;
  userProfile: string;
  userStatus: string;
  role: PatientLinkRole;
  linkType: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface EligibleUserRow {
  id: string;
  name: string;
  profile: string;
  status: string;
}

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface PatientLinkActor {
  organizationId: string;
  actorUserId: string;
  requestId: string;
}

export interface CreatePatientLinkCommand extends PatientLinkActor {
  patientId: string;
  userId: string;
  linkType: string | null;
  note: string | null;
}

export interface PatientLinkPatch {
  linkType?: string | null;
  note?: string | null;
}

export interface UpdatePatientLinkCommand extends PatientLinkActor {
  linkId: string;
  patch: PatientLinkPatch;
}

export interface TargetPatientLinkCommand extends PatientLinkActor {
  linkId: string;
}

export interface ListPatientLinksFilter {
  patientId?: string;
  userId?: string;
  role?: PatientLinkRole;
  status: PatientLinkStatus;
  skip: number;
  take: number;
}

export interface ListEligibleUsersFilter {
  role: PatientLinkRole;
  search?: string;
  skip: number;
  take: number;
}

export type CreatePatientLinkOutcome =
  | { kind: 'created'; link: PatientLinkRow }
  | {
      kind:
        | 'patient_not_found'
        | 'patient_inactive'
        | 'invalid_user'
        | 'already_exists';
    };

export type UpdatePatientLinkOutcome =
  | { kind: 'updated' | 'unchanged'; link: PatientLinkRow }
  | { kind: 'not_found' | 'responsible' | 'revoked' | 'patient_inactive' };

export type RevokePatientLinkOutcome =
  | { kind: 'revoked'; link: PatientLinkRow }
  | { kind: 'not_found' | 'responsible' | 'already_revoked' };

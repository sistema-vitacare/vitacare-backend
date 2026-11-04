export type PatientStatus = 'active' | 'inactive';

export type PatientSex = 'female' | 'male' | 'other';

/** Papel do vinculo usuario-paciente; o BE-10 amplia o conjunto. */
export type PatientLinkRole = 'responsible_professional';

/** Dados cadastrais gravados no paciente (sem status nem responsavel). */
export interface PatientFields {
  name: string;
  birthDate: string;
  sex: PatientSex | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  zipCode: string | null;
  street: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  mainCondition: string | null;
  secondaryConditions: string[];
  healthPlan: string | null;
  notes: string | null;
}

export type PatientPatch = Partial<PatientFields>;

/** Paciente com o responsavel vigente, como sai das consultas. */
export interface PatientRow extends PatientFields {
  id: string;
  status: PatientStatus;
  responsibleId: string | null;
  responsibleName: string | null;
  responsibleStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Alcance de leitura. `viewerUserId` nulo = toda a organizacao; preenchido =
 * so pacientes com vinculo vigente desse usuario num dos `viewerLinkRoles`.
 */
export interface PatientScope {
  organizationId: string;
  viewerUserId: string | null;
  viewerLinkRoles: readonly PatientLinkRole[];
}

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface PatientActor extends PatientScope {
  actorUserId: string;
  requestId: string;
}

export interface ListPatientsFilter {
  status: PatientStatus;
  search?: string;
  condition?: string;
  skip: number;
  take: number;
}

export interface CreatePatientCommand extends PatientActor {
  fields: PatientFields;
  responsibleUserId: string;
}

export interface UpdatePatientCommand extends PatientActor {
  patientId: string;
  patch: PatientPatch;
  responsibleUserId?: string;
}

export interface TargetPatientCommand extends PatientActor {
  patientId: string;
}

export type CreatePatientOutcome =
  | { kind: 'created'; patient: PatientRow }
  | { kind: 'limit_reached' | 'plan_expired' | 'invalid_responsible' };

export type UpdatePatientOutcome =
  | { kind: 'updated' | 'unchanged'; patient: PatientRow }
  | { kind: 'not_found' | 'inactive' | 'invalid_responsible' };

export type DeactivatePatientOutcome =
  | { kind: 'deactivated'; patient: PatientRow }
  | { kind: 'not_found' | 'already_inactive' };

export type ReactivatePatientOutcome =
  | { kind: 'reactivated'; patient: PatientRow }
  | {
      kind: 'not_found' | 'already_active' | 'limit_reached' | 'plan_expired';
    };

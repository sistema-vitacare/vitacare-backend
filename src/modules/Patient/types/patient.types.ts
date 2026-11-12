export type PatientStatus = 'active' | 'inactive';

export type PatientSex = 'female' | 'male' | 'other';

/** Listagem vazia com vinculo ou para quem le a organizacao (BE-29, Mateus). */
export const PATIENTS_EMPTY_MESSAGE =
  'Nenhum paciente encontrado para os filtros informados.';

/** UC14 alternativo: familiar sem vinculo vigente (BE-29, Mateus). */
export const FAMILY_NO_LINK_MESSAGE =
  'Você ainda não tem paciente vinculado. Peça ao profissional responsável para liberar o seu acesso.';

/** Cuidador sem vinculo vigente (BE-29, Mateus). */
export const CAREGIVER_NO_LINK_MESSAGE =
  'Você ainda não tem paciente vinculado. Peça ao profissional responsável ou ao administrador para vincular você a um paciente.';

/** Papeis de vinculo de cuidado (BE-10), derivados do perfil do usuario. */
export const CARE_LINK_ROLES = ['caregiver', 'family'] as const;

export type CareLinkRole = (typeof CARE_LINK_ROLES)[number];

/** Papel do vinculo usuario-paciente (`papel` do MER). */
export type PatientLinkRole = 'responsible_professional' | CareLinkRole;

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

/**
 * Paciente com o responsavel vigente e o vinculo de cuidado vigente de quem le
 * (nulo para quem le a organizacao inteira), como sai das consultas.
 */
export interface PatientRow extends PatientFields {
  id: string;
  status: PatientStatus;
  responsibleId: string | null;
  responsibleName: string | null;
  responsibleStatus: string | null;
  viewerLinkRole: CareLinkRole | null;
  viewerLinkType: string | null;
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
  /** Falso para quem nao ve o CPF: a busca nao pode revela-lo por tentativa. */
  searchCpf: boolean;
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

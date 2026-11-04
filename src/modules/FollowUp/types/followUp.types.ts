import type { FieldError } from '@/common/errors/domainError.type';
import type { FieldType, FormFieldRow } from '@/modules/Form/types/form.types';
import type { PatientScope } from '@/modules/Patient/types/patient.types';

export const FOLLOW_UP_STATUSES = ['valid', 'annulled'] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/** Valor como chega do cliente, antes de `parseFieldAnswer`. */
export interface AnswerInput {
  fieldId: string;
  value: unknown;
}

/** Item pronto para gravar: texto canonico de um campo da versao. */
export interface AnswerItem {
  fieldId: string;
  value: string;
}

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface FollowUpActor extends PatientScope {
  actorUserId: string;
  requestId: string;
}

export interface CreateFollowUpCommand extends FollowUpActor {
  patientId: string;
  formId: string;
  formVersionId: string;
  visitedAt: Date;
  notes: string | null;
  answers: AnswerInput[];
}

export type CreateFollowUpOutcome =
  | {
      kind:
        | 'patient_not_found'
        | 'patient_inactive'
        | 'form_not_found'
        | 'form_inactive'
        | 'form_not_applicable'
        | 'version_outdated'
        | 'empty';
    }
  | { kind: 'invalid_answers'; errors: FieldError[] }
  | { kind: 'created'; followUp: FollowUpDetail };

export interface AnnulFollowUpCommand extends FollowUpActor {
  followUpId: string;
  reason: string;
  /** `follow_ups:annul`: anula qualquer registro da organizacao. */
  annulAny: boolean;
}

export type AnnulFollowUpOutcome =
  | { kind: 'not_found' | 'not_author' | 'already_annulled' }
  | { kind: 'annulled'; followUp: FollowUpDetail };

export interface ListFollowUpsFilter {
  patientId: string;
  status?: FollowUpStatus;
  skip: number;
  take: number;
}

export interface UserRef {
  id: string;
  name: string;
}

export interface FollowUpAnswerRow {
  fieldId: string;
  fieldKey: string;
  name: string;
  fieldType: FieldType;
  unit: string | null;
  section: string | null;
  position: number;
  value: string;
}

/** Registro como sai das consultas, com os metadados da versao respondida. */
export interface FollowUpDetail {
  id: string;
  patientId: string;
  formId: string;
  formName: string;
  formVersionId: string;
  formVersionNumber: number;
  author: UserRef;
  visitedAt: Date;
  submittedAt: Date;
  notes: string | null;
  status: FollowUpStatus;
  annulledAt: Date | null;
  annulledBy: UserRef | null;
  annulmentReason: string | null;
  answers: FollowUpAnswerRow[];
}

export type VersionField = Pick<
  FormFieldRow,
  | 'id'
  | 'name'
  | 'fieldType'
  | 'requirement'
  | 'decimalPlaces'
  | 'scaleMin'
  | 'scaleMax'
  | 'options'
>;

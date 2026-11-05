import type {
  FollowUpActor,
  UserRef,
} from '@/modules/FollowUp/types/followUp.types';

/** Tipos aceitos, sempre detectados pelo conteudo (decisao de Mateus, 2026-11-05). */
export const ATTACHMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

/** 10 MB = 10 MiB. */
export const ATTACHMENT_MAX_BYTES = 10_485_760;

/** Anexos ativos por registro; removidos nao contam. */
export const ATTACHMENT_MAX_PER_RECORD = 5;

/** Anexo como sai das consultas; a chave do arquivo nunca vai junto. */
export interface AttachmentRow {
  id: string;
  followUpId: string;
  fileName: string;
  contentType: AttachmentContentType;
  sizeBytes: number;
  uploadedBy: UserRef;
  uploadedAt: Date;
}

/** Upload ja gravado no diretorio de temporarios pelo interceptor. */
export interface UploadedTempFile {
  path: string;
  originalName: string;
  size: number;
}

export interface UploadAttachmentCommand extends FollowUpActor {
  followUpId: string;
  attachmentId: string;
  fileName: string;
  contentType: AttachmentContentType;
  sizeBytes: number;
  storageKey: string;
}

export type UploadAttachmentOutcome =
  | {
      kind:
        | 'follow_up_not_found'
        | 'not_author'
        | 'follow_up_annulled'
        | 'patient_inactive'
        | 'limit_reached';
    }
  | { kind: 'created'; attachment: AttachmentRow };

export interface RemoveAttachmentCommand extends FollowUpActor {
  followUpId: string;
  attachmentId: string;
  /** `follow_ups:annul`: remove qualquer anexo da organizacao. */
  removeAny: boolean;
}

export type RemoveAttachmentOutcome =
  | { kind: 'not_found' | 'not_author' }
  | { kind: 'removed'; storageKey: string };

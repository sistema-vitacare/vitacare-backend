import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { FollowUpRecord } from '@/modules/FollowUp/entities/followUpRecord.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

import type { AttachmentContentType } from '../types/attachment.types';

/**
 * Anexo de registro (MER `anexos_registro`). `storageKey` e o
 * `caminho_arquivo` do MER: chave no volume, nunca exposta pela API.
 * `sizeBytes` em bytes; `createdAt` e a `data_anexo`. Remover grava
 * `deletedAt` e apaga o arquivo; a linha fica para a auditoria.
 */
@Entity('follow_up_attachments')
@Index('follow_up_attachments_record_active_idx', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_attachments_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => FollowUpRecord,
  ['recordId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_attachments_record_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => User,
  ['uploadedByUserId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_attachments_uploaded_by_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('follow_up_attachments_storage_key_unique', ['storageKey'])
@Check('follow_up_attachments_file_name_check', "btrim(file_name) <> ''")
@Check(
  'follow_up_attachments_content_type_check',
  "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')",
)
@Check('follow_up_attachments_size_check', 'size_bytes > 0')
export class FollowUpAttachment {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  recordId!: string;

  @Column('uuid')
  uploadedByUserId!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'varchar', length: 64 })
  contentType!: AttachmentContentType;

  @Column({ type: 'varchar', length: 255 })
  storageKey!: string;

  @Column('integer')
  sizeBytes!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

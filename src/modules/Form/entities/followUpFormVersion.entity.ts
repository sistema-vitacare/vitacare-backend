import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

import type { VersionStatus } from '../types/form.types';
import { FollowUpForm } from './followUpForm.entity';

/**
 * Versao de um formulario. O rascunho (`draft`) e editavel e nao tem numero;
 * publicar atribui o proximo numero e congela a versao e seus campos.
 * `deletedAt` so marca rascunho descartado.
 */
@Entity('follow_up_form_versions')
@Index('follow_up_form_versions_number_unique', { synchronize: false })
@Index('follow_up_form_versions_single_draft_unique', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_form_versions_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => FollowUpForm,
  ['formId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_form_versions_form_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => User,
  ['publishedByUserId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_form_versions_publisher_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('follow_up_form_versions_id_org_unique', ['id', 'organizationId'])
@Unique('follow_up_form_versions_id_form_org_unique', [
  'id',
  'formId',
  'organizationId',
])
@Check('follow_up_form_versions_number_check', 'version_number >= 1')
@Check(
  'follow_up_form_versions_status_check',
  "(status = 'draft' AND version_number IS NULL AND published_at IS NULL AND published_by_user_id IS NULL) OR (status = 'published' AND version_number IS NOT NULL AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL AND deleted_at IS NULL)",
)
export class FollowUpFormVersion {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  formId!: string;

  @Column({ type: 'integer', nullable: true })
  versionNumber!: number | null;

  @Column({ type: 'varchar', length: 16 })
  status!: VersionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  publishedByUserId!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

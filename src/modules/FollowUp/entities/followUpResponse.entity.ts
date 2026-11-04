import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { FollowUpFormVersion } from '@/modules/Form/entities/followUpFormVersion.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';

import { FollowUpRecord } from './followUpRecord.entity';

/**
 * Formulario respondido no registro (MER `respostas_formulario`): um por
 * registro, preso a versao publicada que o cuidador preencheu.
 */
@Entity('follow_up_responses')
@Index('follow_up_responses_form_idx', ['organizationId', 'formId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_responses_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => FollowUpRecord,
  ['recordId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_responses_record_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => FollowUpFormVersion,
  ['formVersionId', 'formId', 'organizationId'],
  ['id', 'formId', 'organizationId'],
  { name: 'follow_up_responses_version_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('follow_up_responses_record_unique', ['recordId'])
@Unique('follow_up_responses_id_version_org_unique', [
  'id',
  'formVersionId',
  'organizationId',
])
export class FollowUpResponse {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  recordId!: string;

  @Column('uuid')
  formId!: string;

  @Column('uuid')
  formVersionId!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

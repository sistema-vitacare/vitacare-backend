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

import type {
  FormAudience,
  FormStatus,
  FrequencyUnit,
} from '../types/form.types';

/**
 * Formulario de acompanhamento (MER `formularios_acompanhamento`). Os campos
 * pertencem as versoes; aqui ficam so os dados que nao mudam o significado
 * das respostas (BE-11, decidido por Mateus em 2026-11-04).
 */
@Entity('follow_up_forms')
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_forms_organization_fk',
  onDelete: 'RESTRICT',
})
@Unique('follow_up_forms_id_org_unique', ['id', 'organizationId'])
@Index('follow_up_forms_org_status_name_idx', [
  'organizationId',
  'status',
  'name',
])
@Check('follow_up_forms_name_check', "btrim(name) <> ''")
@Check(
  'follow_up_forms_status_check',
  "status IN ('draft', 'active', 'inactive')",
)
@Check(
  'follow_up_forms_audience_check',
  "audience IN ('organization', 'patients')",
)
@Check(
  'follow_up_forms_frequency_check',
  "(frequency_interval IS NULL) = (frequency_unit IS NULL) AND (frequency_interval IS NULL OR frequency_interval BETWEEN 1 AND 365) AND (frequency_unit IS NULL OR frequency_unit IN ('hours', 'days', 'weeks'))",
)
@Check(
  'follow_up_forms_deactivation_check',
  "(status = 'inactive') = (deleted_at IS NOT NULL)",
)
export class FollowUpForm {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  trackingType!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: FormStatus;

  @Column({ type: 'varchar', length: 16, default: 'organization' })
  audience!: FormAudience;

  @Column({ type: 'smallint', nullable: true })
  frequencyInterval!: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  frequencyUnit!: FrequencyUnit | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

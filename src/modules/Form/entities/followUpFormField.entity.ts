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

import type { FieldType } from '../types/form.types';
import { FollowUpForm } from './followUpForm.entity';
import { FollowUpFormVersion } from './followUpFormVersion.entity';

/**
 * Campo de uma versao (MER `campos_formulario`). `required`/`active` sao
 * `obrigatorio`/`ativo` do MER: `active = false` e o Desabilitado da Figura
 * 39. `fieldKey` identifica o mesmo campo atraves das versoes.
 */
@Entity('follow_up_form_fields')
@Index('follow_up_form_fields_version_name_unique', { synchronize: false })
@Index('follow_up_form_fields_form_key_idx', ['formId', 'fieldKey'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_form_fields_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => FollowUpForm,
  ['formId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_form_fields_form_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => FollowUpFormVersion,
  ['versionId', 'formId', 'organizationId'],
  ['id', 'formId', 'organizationId'],
  { name: 'follow_up_form_fields_version_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('follow_up_form_fields_id_org_unique', ['id', 'organizationId'])
@Unique('follow_up_form_fields_version_key_unique', ['versionId', 'fieldKey'])
@Unique('follow_up_form_fields_version_position_unique', [
  'versionId',
  'position',
])
@Check('follow_up_form_fields_name_check', "btrim(name) <> ''")
@Check('follow_up_form_fields_position_check', 'position >= 0')
@Check(
  'follow_up_form_fields_field_type_check',
  "field_type IN ('number', 'scale', 'boolean', 'text', 'single_choice', 'multiple_choice')",
)
@Check(
  'follow_up_form_fields_requirement_check',
  'NOT (required AND NOT active)',
)
@Check(
  'follow_up_form_fields_decimal_places_check',
  'decimal_places BETWEEN 0 AND 3',
)
@Check(
  'follow_up_form_fields_type_config_check',
  "(field_type = 'number' AND decimal_places IS NOT NULL AND scale_min IS NULL AND scale_max IS NULL AND options IS NULL) OR (field_type = 'scale' AND scale_min IS NOT NULL AND scale_max IS NOT NULL AND scale_min BETWEEN -1000 AND 1000 AND scale_max BETWEEN -1000 AND 1000 AND scale_min < scale_max AND unit IS NULL AND decimal_places IS NULL AND options IS NULL) OR (field_type IN ('boolean', 'text') AND unit IS NULL AND decimal_places IS NULL AND scale_min IS NULL AND scale_max IS NULL AND options IS NULL) OR (field_type IN ('single_choice', 'multiple_choice') AND options IS NOT NULL AND jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 50 AND unit IS NULL AND decimal_places IS NULL AND scale_min IS NULL AND scale_max IS NULL)",
)
export class FollowUpFormField {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  formId!: string;

  @Column('uuid')
  versionId!: string;

  @Column('uuid')
  fieldKey!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 24 })
  fieldType!: FieldType;

  @Column({ type: 'boolean' })
  required!: boolean;

  @Column({ type: 'boolean' })
  active!: boolean;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ type: 'varchar', length: 60, nullable: true })
  section!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unit!: string | null;

  @Column({ type: 'smallint', nullable: true })
  decimalPlaces!: number | null;

  @Column({ type: 'integer', nullable: true })
  scaleMin!: number | null;

  @Column({ type: 'integer', nullable: true })
  scaleMax!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  options!: string[] | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

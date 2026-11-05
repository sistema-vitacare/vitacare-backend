import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { FollowUpFormField } from '@/modules/Form/entities/followUpFormField.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';

import { FollowUpResponse } from './followUpResponse.entity';

/**
 * Valor de um campo (MER `itens_resposta_formulario`), no texto canonico de
 * `parseFieldAnswer`. As duas FKs compostas pela versao garantem que o campo
 * pertence a versao respondida. Campo vazio nao gera item; `0` e `false` sim.
 */
@Entity('follow_up_response_items')
@Index('follow_up_response_items_field_idx', ['fieldId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_response_items_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => FollowUpResponse,
  ['responseId', 'formVersionId', 'organizationId'],
  ['id', 'formVersionId', 'organizationId'],
  { name: 'follow_up_response_items_response_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => FollowUpFormField,
  ['fieldId', 'formVersionId', 'organizationId'],
  ['id', 'versionId', 'organizationId'],
  { name: 'follow_up_response_items_field_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('follow_up_response_items_field_unique', ['responseId', 'fieldId'])
@Unique('follow_up_response_items_id_org_unique', ['id', 'organizationId'])
@Check('follow_up_response_items_value_check', "btrim(value) <> ''")
export class FollowUpResponseItem {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  responseId!: string;

  @Column('uuid')
  formVersionId!: string;

  @Column('uuid')
  fieldId!: string;

  @Column('text')
  value!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

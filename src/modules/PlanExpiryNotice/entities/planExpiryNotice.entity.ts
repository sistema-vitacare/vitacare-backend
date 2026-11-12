import {
  Check,
  Column,
  Entity,
  ForeignKey,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';
import { OrganizationPlanTerm } from '@/modules/Plan/entities/organizationPlanTerm.entity';
import type { PlanExpiryMilestone } from '@/modules/Plan/types/plan.types';

/**
 * Aviso de vencimento de um termo num marco (BE-28). Um por termo e marco;
 * `validUntil` e ate quando o e-mail ainda pode sair (`null` no vencido, que
 * vale ate o termo ser substituido). Guarda a data de fim e o instante do
 * marco para o texto e a auditoria.
 */
@Entity('plan_expiry_notices')
@Unique('plan_expiry_notices_id_org_unique', ['id', 'organizationId'])
@Unique('plan_expiry_notices_term_milestone_unique', [
  'planTermId',
  'milestone',
])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'plan_expiry_notices_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => OrganizationPlanTerm,
  ['planTermId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'plan_expiry_notices_term_tenant_fk', onDelete: 'RESTRICT' },
)
@Check(
  'plan_expiry_notices_milestone_check',
  "milestone IN ('seven_days', 'one_day', 'expired')",
)
@Check(
  'plan_expiry_notices_valid_until_check',
  "(milestone = 'expired') = (valid_until IS NULL)",
)
export class PlanExpiryNotice {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  planTermId!: string;

  @Column({ type: 'varchar', length: 16 })
  milestone!: PlanExpiryMilestone;

  @Column({ type: 'timestamptz' })
  termEndsAt!: Date;

  @Column({ type: 'timestamptz' })
  dueAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

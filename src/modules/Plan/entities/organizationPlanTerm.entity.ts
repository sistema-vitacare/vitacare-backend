import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

import type { PlanTermOrigin } from '../types/plan.types';
import { UsagePlan } from './usagePlan.entity';

/**
 * Vigencia do plano de uma organizacao. Trocar, renovar ou personalizar
 * encerra o termo corrente (`supersededAt`) e abre outro: a cadeia e a trilha.
 */
@Entity('organization_plan_terms')
@Index('organization_plan_terms_current_unique', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'organization_plan_terms_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(() => UsagePlan, ['usagePlanId'], ['id'], {
  name: 'organization_plan_terms_usage_plan_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(() => User, ['assignedByUserId'], ['id'], {
  name: 'organization_plan_terms_assigned_by_fk',
  onDelete: 'RESTRICT',
})
@Check(
  'organization_plan_terms_origin_check',
  "origin IN ('initial', 'assignment', 'change_request', 'migration')",
)
@Check(
  'organization_plan_terms_change_request_check',
  "(origin = 'change_request') = (change_request_id IS NOT NULL)",
)
@Check(
  'organization_plan_terms_period_check',
  'ends_at IS NULL OR ends_at > starts_at',
)
export class OrganizationPlanTerm {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'uuid' })
  usagePlanId!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startsAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  userLimit!: number | null;

  @Column({ type: 'integer', nullable: true })
  patientLimit!: number | null;

  @Column({ type: 'varchar', length: 24 })
  origin!: PlanTermOrigin;

  @Column({ type: 'uuid', nullable: true })
  changeRequestId!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'uuid', nullable: true })
  assignedByUserId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  supersededAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

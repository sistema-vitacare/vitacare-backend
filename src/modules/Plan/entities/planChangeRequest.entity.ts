import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';

import type { PlanChangeRequestStatus } from '../types/plan.types';
import { UsagePlan } from './usagePlan.entity';

/** Pedido de troca de plano (UC04 passo 5); so a aprovacao muda o plano. */
@Entity('plan_change_requests')
@Index('plan_change_requests_single_pending_unique', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'plan_change_requests_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(() => UsagePlan, ['currentPlanId'], ['id'], {
  name: 'plan_change_requests_current_plan_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(() => UsagePlan, ['requestedPlanId'], ['id'], {
  name: 'plan_change_requests_requested_plan_fk',
  onDelete: 'RESTRICT',
})
@Check(
  'plan_change_requests_status_check',
  "status IN ('pending', 'approved', 'rejected', 'cancelled')",
)
@Check(
  'plan_change_requests_rejection_note_check',
  "status <> 'rejected' OR decision_note IS NOT NULL",
)
export class PlanChangeRequest {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'uuid' })
  currentPlanId!: string;

  @Column({ type: 'uuid' })
  requestedPlanId!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: PlanChangeRequestStatus;

  @Column({ type: 'uuid' })
  requestedByUserId!: string;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  decisionNote!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

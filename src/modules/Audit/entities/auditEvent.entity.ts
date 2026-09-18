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

@Entity('audit_events')
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'audit_events_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => User,
  ['actorUserId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'audit_events_actor_tenant_fk', onDelete: 'RESTRICT' },
)
@Index('audit_events_org_occurred_idx', ['organizationId', 'occurredAt'])
@Index('audit_events_org_actor_occurred_idx', [
  'organizationId',
  'actorUserId',
  'occurredAt',
])
@Index('audit_events_org_action_occurred_idx', [
  'organizationId',
  'action',
  'occurredAt',
])
@Check(
  'audit_events_actor_check',
  "(actor_type = 'user' AND actor_user_id IS NOT NULL) OR (actor_type = 'system' AND actor_user_id IS NULL)",
)
@Check(
  'audit_events_before_object_check',
  "before_values IS NULL OR jsonb_typeof(before_values) = 'object'",
)
@Check(
  'audit_events_after_object_check',
  "after_values IS NULL OR jsonb_typeof(after_values) = 'object'",
)
export class AuditEvent {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column({ type: 'varchar', length: 16 })
  actorType!: 'user' | 'system';

  @Column({ type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ type: 'uuid', nullable: true })
  entityId!: string | null;

  /** Somente campos autorizados e mascarados podem ser escritos aqui. */
  @Column({ type: 'jsonb', nullable: true })
  beforeValues!: Record<string, unknown> | null;

  /** Somente campos autorizados e mascarados podem ser escritos aqui. */
  @Column({ type: 'jsonb', nullable: true })
  afterValues!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  requestId!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

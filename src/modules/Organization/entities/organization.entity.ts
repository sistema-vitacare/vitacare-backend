import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { UsagePlan } from '@/modules/Plan/entities/usagePlan.entity';

@Entity('organizations')
@Index('organizations_document_normalized_unique', { synchronize: false })
@ForeignKey(() => UsagePlan, ['usagePlanId'], ['id'], {
  name: 'organizations_usage_plan_fk',
  onDelete: 'RESTRICT',
})
@Check('organizations_status_check', "status IN ('active', 'inactive')")
@Check(
  'organizations_deactivation_check',
  "(status = 'inactive') = (deleted_at IS NOT NULL)",
)
export class Organization {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column('uuid')
  usagePlanId!: string;

  @Column({ type: 'varchar', length: 180 })
  tradeName!: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  legalName!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  document!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'inactive';

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('usage_plans')
@Check('usage_plans_user_limit_check', 'user_limit >= 0')
@Check('usage_plans_patient_limit_check', 'patient_limit >= 0')
@Check(
  'usage_plans_monthly_price_check',
  'monthly_price IS NULL OR monthly_price >= 0',
)
export class UsagePlan {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'integer' })
  userLimit!: number;

  @Column({ type: 'integer' })
  patientLimit!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  monthlyPrice!: string | null;

  @Column({ type: 'boolean', default: true })
  status!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

import {
  Check,
  Column,
  Entity,
  ForeignKey,
  PrimaryColumn,
  Unique,
  Index,
} from 'typeorm';
import { Organization } from '@/modules/Organization/entities/organization.entity';

@Entity('access_profiles')
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'access_profiles_organization_fk',
  onDelete: 'RESTRICT',
})
@Unique('access_profiles_org_code_unique', ['organizationId', 'code'])
@Unique('access_profiles_id_org_unique', ['id', 'organizationId'])
@Index('access_profiles_org_idx', ['organizationId'])
@Check('access_profiles_code_check', "code ~ '^[a-z][a-z0-9_]*$'")
export class AccessProfile {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

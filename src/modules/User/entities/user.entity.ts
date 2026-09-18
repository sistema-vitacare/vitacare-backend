import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { AccessProfile } from '@/modules/Access/entities/accessProfile.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';

@Entity('users')
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'users_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => AccessProfile,
  ['profileId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'users_profile_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('users_org_email_unique', ['organizationId', 'email'])
@Unique('users_org_cpf_unique', ['organizationId', 'cpf'])
@Unique('users_id_org_unique', ['id', 'organizationId'])
@Index('users_org_status_idx', ['organizationId', 'status'])
@Index('users_org_profile_idx', ['organizationId', 'profileId'])
@Check('users_status_check', "status IN ('pending', 'active', 'inactive')")
@Check('users_cpf_format_check', "cpf ~ '^[0-9]{11}$'")
@Check(
  'users_deactivation_check',
  "(status = 'inactive') = (deleted_at IS NOT NULL)",
)
export class User {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  profileId!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'citext' })
  email!: string;

  @Column({ type: 'varchar', length: 11 })
  cpf!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: 'pending' | 'active' | 'inactive';

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

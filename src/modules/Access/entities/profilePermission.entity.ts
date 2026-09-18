import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { Organization } from '@/modules/Organization/entities/organization.entity';
import { AccessProfile } from './accessProfile.entity';
import { Permission } from './permission.entity';

@Entity('profile_permissions')
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'profile_permissions_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => AccessProfile,
  ['profileId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'profile_permissions_profile_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(() => Permission, ['permissionId'], ['id'], {
  name: 'profile_permissions_permission_fk',
  onDelete: 'RESTRICT',
})
@Unique('profile_permissions_pair_unique', ['profileId', 'permissionId'])
@Index('profile_permissions_org_idx', ['organizationId'])
@Index('profile_permissions_permission_idx', ['permissionId'])
export class ProfilePermission {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  profileId!: string;

  @Column('uuid')
  permissionId!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

import { Check, Column, Entity, PrimaryColumn, Unique } from 'typeorm';

@Entity('permissions')
@Unique('permissions_code_unique', ['code'])
@Check('permissions_code_check', "code ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$'")
export class Permission {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

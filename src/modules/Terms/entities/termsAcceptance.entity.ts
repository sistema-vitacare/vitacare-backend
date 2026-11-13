import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

import type { TenantOwned } from '@/common/database/tenantScoped.repository';

/**
 * Prova do aceite do termo (BE-32): usuario, organizacao e perfil no instante,
 * versao e hash aceitos, hora do servidor, IP (regra `TRUST_PROXY`), navegador
 * truncado e id da requisicao. Imutavel por trigger, um por usuario e versao.
 */
@Entity('terms_acceptances')
@Unique('terms_acceptances_user_version_unique', ['userId', 'termsVersionId'])
export class TermsAcceptance implements TenantOwned {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid')
  termsVersionId!: string;

  @Column('integer')
  termsVersion!: number;

  @Column({ type: 'char', length: 64 })
  contentHash!: string;

  @Column({ type: 'varchar', length: 32 })
  profileCode!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  acceptedAt!: Date;

  @Column('inet', { nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  requestId!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column('timestamptz', { nullable: true })
  deletedAt!: Date | null;
}

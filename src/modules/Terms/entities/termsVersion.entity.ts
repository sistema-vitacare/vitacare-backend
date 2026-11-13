import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * Versao publicada do termo de uso e privacidade (BE-32). Global: o mesmo
 * texto vale para todas as organizacoes. Imutavel por trigger; o banco confere
 * que `contentHash` e o SHA-256 de `content`. Os acessos sao SQL no repositorio.
 */
@Entity('terms_versions')
@Unique('terms_versions_version_unique', ['version'])
export class TermsVersion {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('integer')
  version!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column('text')
  content!: string;

  @Column({ type: 'char', length: 64 })
  contentHash!: string;

  @Column('timestamptz')
  publishedAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column('timestamptz', { nullable: true })
  deletedAt!: Date | null;
}

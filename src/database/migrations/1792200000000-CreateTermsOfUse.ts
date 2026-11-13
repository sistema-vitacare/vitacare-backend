import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-32 (decidido por Mateus em 2026-11-12/13): termo de uso e privacidade com
 * aceite obrigatorio. `terms_versions` e global (o termo e o mesmo para todas
 * as organizacoes) e o banco confere que `content_hash` e o SHA-256 do texto.
 * `terms_acceptances` guarda a prova do aceite: quem, em que organizacao, com
 * que perfil, que versao e hash, quando (hora do servidor), de que IP, com que
 * navegador e em que requisicao. As duas tabelas sao imutaveis por trigger,
 * como `audit_events`; o `TRUNCATE` dos testes passa.
 *
 * Esta migration so cria a estrutura. Sem versao publicada ninguem e bloqueado;
 * a versao 1 entra pela migration seguinte. Migration nao importa codigo da
 * aplicacao.
 */
export class CreateTermsOfUse1792200000000 implements MigrationInterface {
  name = 'CreateTermsOfUse1792200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('terms_versions')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version integer NOT NULL,
        title varchar(200) NOT NULL,
        content text NOT NULL,
        content_hash char(64) NOT NULL,
        published_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT terms_versions_version_unique UNIQUE (version),
        CONSTRAINT terms_versions_version_check CHECK (version > 0),
        CONSTRAINT terms_versions_hash_check
          CHECK (content_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('terms_acceptances')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        user_id uuid NOT NULL,
        terms_version_id uuid NOT NULL,
        terms_version integer NOT NULL,
        content_hash char(64) NOT NULL,
        profile_code varchar(32) NOT NULL,
        accepted_at timestamptz NOT NULL DEFAULT now(),
        ip_address inet,
        user_agent varchar(512),
        request_id varchar(80),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT terms_acceptances_user_version_unique UNIQUE (user_id, terms_version_id),
        CONSTRAINT terms_acceptances_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT terms_acceptances_user_tenant_fk FOREIGN KEY (user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT terms_acceptances_version_fk FOREIGN KEY (terms_version_id)
          REFERENCES ${table('terms_versions')} (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX terms_acceptances_org_accepted_idx ON ${table('terms_acceptances')} (organization_id, accepted_at DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX terms_acceptances_accepted_idx ON ${table('terms_acceptances')} (accepted_at DESC, id DESC)`,
    );

    for (const name of ['terms_versions', 'terms_acceptances']) {
      await queryRunner.query(`
        CREATE FUNCTION ${schema}.${name}_reject_change() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION '${name} is append-only: % is not allowed', TG_OP
            USING ERRCODE = 'restrict_violation';
        END
        $$
      `);
      await queryRunner.query(`
        CREATE TRIGGER ${name}_immutable
          BEFORE UPDATE OR DELETE ON ${table(name)}
          FOR EACH ROW EXECUTE FUNCTION ${schema}.${name}_reject_change()
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = this.tableName(queryRunner);

    await queryRunner.query(`DROP TABLE ${table('terms_acceptances')}`);
    await queryRunner.query(`DROP TABLE ${table('terms_versions')}`);
    await queryRunner.query(
      `DROP FUNCTION ${schema}.terms_acceptances_reject_change()`,
    );
    await queryRunner.query(
      `DROP FUNCTION ${schema}.terms_versions_reject_change()`,
    );
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');

    return `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
  }

  private tableName(queryRunner: QueryRunner): (name: string) => string {
    const schema = this.schema(queryRunner);

    return (name: string) => `${schema}."${name}"`;
  }
}

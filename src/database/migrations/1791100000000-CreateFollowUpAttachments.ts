import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-13 (2026-11-05): anexos de registro (MER `anexos_registro`) com as
 * decisoes de Mateus: arquivo no volume local (nao S3), envio pelo autor do
 * registro, remocao logica com o arquivo apagado. `storage_key` e o
 * `caminho_arquivo` do MER e nunca sai pela API; `uploaded_by_user_id` e
 * acrescimo ao MER (autoria). FKs compostas garantem o tenant. Migration nao
 * importa codigo da aplicacao.
 */
export class CreateFollowUpAttachments1791100000000 implements MigrationInterface {
  name = 'CreateFollowUpAttachments1791100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_attachments')} (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        record_id uuid NOT NULL,
        uploaded_by_user_id uuid NOT NULL,
        file_name varchar(255) NOT NULL,
        content_type varchar(64) NOT NULL,
        storage_key varchar(255) NOT NULL,
        size_bytes integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_attachments_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_attachments_record_tenant_fk FOREIGN KEY (record_id, organization_id)
          REFERENCES ${table('follow_up_records')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_attachments_uploaded_by_tenant_fk FOREIGN KEY (uploaded_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_attachments_storage_key_unique UNIQUE (storage_key),
        CONSTRAINT follow_up_attachments_file_name_check CHECK (btrim(file_name) <> ''),
        CONSTRAINT follow_up_attachments_content_type_check CHECK (
          content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
        ),
        CONSTRAINT follow_up_attachments_size_check CHECK (size_bytes > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX follow_up_attachments_record_active_idx ON ${table('follow_up_attachments')} (organization_id, record_id, created_at, id) WHERE deleted_at IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE ${this.tableName(queryRunner)('follow_up_attachments')}`,
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

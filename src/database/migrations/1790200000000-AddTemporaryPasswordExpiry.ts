import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prazo da senha temporaria emitida pela redefinicao administrativa (BE-03).
 * `NULL` mantem o comportamento anterior para contas criadas com troca
 * obrigatoria fora desse fluxo; o prazo so existe enquanto a troca e exigida.
 */
export class AddTemporaryPasswordExpiry1790200000000 implements MigrationInterface {
  name = 'AddTemporaryPasswordExpiry1790200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `ALTER TABLE ${table('users')} ADD COLUMN temporary_password_expires_at timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('users')} ADD CONSTRAINT users_temporary_password_expiry_check CHECK (temporary_password_expires_at IS NULL OR must_change_password)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `ALTER TABLE ${table('users')} DROP CONSTRAINT users_temporary_password_expiry_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('users')} DROP COLUMN temporary_password_expires_at`,
    );
  }
}

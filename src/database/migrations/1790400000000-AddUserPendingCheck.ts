import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Usuario `pending` e o convidado que ainda nao concluiu o primeiro acesso
 * (BE-06): so pode ter troca obrigatoria de senha e prazo de convite, entao o
 * login nunca lhe entrega sessao normal.
 */
export class AddUserPendingCheck1790400000000 implements MigrationInterface {
  name = 'AddUserPendingCheck1790400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `ALTER TABLE ${table('users')} ADD CONSTRAINT users_pending_check CHECK (status <> 'pending' OR (must_change_password AND temporary_password_expires_at IS NOT NULL))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `ALTER TABLE ${table('users')} DROP CONSTRAINT users_pending_check`,
    );
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-16 (2026-11-05): alertas por relogio. Ausencia de registro (um alerta
 * por periodo vencido sem envio, decisao de Mateus) e lembrete de medicamento
 * (MER `alertas.id_lembrete_medicamento`). O estado mora aqui, nao no Redis:
 * `follow_up_absence_monitors` guarda o par paciente x formulario monitorado e
 * o cursor `checked_through`; `medication_reminders.dispatched_through` e o
 * cursor de cada linha da agenda. `next_due_at` e `next_dispatch_at` guardam o
 * proximo vencimento (nulo = calcular), para a varredura so tocar o que venceu. Os `UNIQUE` de prazo e de horario impedem
 * evento repetido. As linhas vigentes da agenda comecam a contar daqui, para a
 * implantacao nao gerar lembretes do passado. O `down` falha se ja houver
 * alertas das origens novas, de proposito.
 * Migration nao importa codigo da aplicacao.
 */
export class CreateScheduledAlerts1791400000000 implements MigrationInterface {
  name = 'CreateScheduledAlerts1791400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_absence_monitors')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        form_id uuid NOT NULL,
        started_at timestamptz NOT NULL,
        checked_through timestamptz NOT NULL,
        next_due_at timestamptz,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_absence_monitors_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_absence_monitors_patient_tenant_fk FOREIGN KEY (patient_id, organization_id)
          REFERENCES ${table('patients')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_absence_monitors_form_tenant_fk FOREIGN KEY (form_id, organization_id)
          REFERENCES ${table('follow_up_forms')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_absence_monitors_checked_check CHECK (checked_through >= started_at),
        CONSTRAINT follow_up_absence_monitors_status_check CHECK (status IN ('active', 'ended')),
        CONSTRAINT follow_up_absence_monitors_end_check CHECK ((status = 'active') = (deleted_at IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX follow_up_absence_monitors_active_unique ON ${table('follow_up_absence_monitors')} (patient_id, form_id) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX follow_up_absence_monitors_due_idx ON ${table('follow_up_absence_monitors')} (next_due_at) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('medication_reminders')} ADD COLUMN dispatched_through timestamptz, ADD COLUMN next_dispatch_at timestamptz`,
    );
    await queryRunner.query(
      `UPDATE ${table('medication_reminders')} SET dispatched_through = now() WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('medication_reminders')} ADD CONSTRAINT medication_reminders_id_org_unique UNIQUE (id, organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX medication_reminders_due_idx ON ${table('medication_reminders')} (next_dispatch_at) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE ${table('alerts')}
        ADD COLUMN form_id uuid,
        ADD COLUMN absence_since timestamptz,
        ADD COLUMN due_at timestamptz,
        ADD COLUMN frequency_interval smallint,
        ADD COLUMN frequency_unit varchar(8),
        ADD COLUMN medication_id uuid,
        ADD COLUMN medication_reminder_id uuid,
        ADD COLUMN scheduled_at timestamptz,
        ALTER COLUMN source TYPE varchar(24),
        DROP CONSTRAINT alerts_source_check,
        ADD CONSTRAINT alerts_source_check
          CHECK (source IN ('reading', 'absence', 'medication_reminder')),
        ADD CONSTRAINT alerts_form_tenant_fk FOREIGN KEY (form_id, organization_id)
          REFERENCES ${table('follow_up_forms')} (id, organization_id) ON DELETE RESTRICT,
        ADD CONSTRAINT alerts_medication_tenant_fk FOREIGN KEY (medication_id, organization_id)
          REFERENCES ${table('medications')} (id, organization_id) ON DELETE RESTRICT,
        ADD CONSTRAINT alerts_medication_reminder_tenant_fk FOREIGN KEY (medication_reminder_id, organization_id)
          REFERENCES ${table('medication_reminders')} (id, organization_id) ON DELETE RESTRICT,
        ADD CONSTRAINT alerts_absence_origin_check CHECK (
          source <> 'absence' OR (
            form_id IS NOT NULL AND absence_since IS NOT NULL
            AND due_at IS NOT NULL AND frequency_interval IS NOT NULL
            AND frequency_unit IS NOT NULL)),
        ADD CONSTRAINT alerts_reminder_origin_check CHECK (
          source <> 'medication_reminder' OR (
            medication_id IS NOT NULL AND medication_reminder_id IS NOT NULL
            AND scheduled_at IS NOT NULL)),
        ADD CONSTRAINT alerts_frequency_interval_check
          CHECK (frequency_interval BETWEEN 1 AND 365),
        ADD CONSTRAINT alerts_frequency_unit_check
          CHECK (frequency_unit IN ('hours', 'days', 'weeks')),
        ADD CONSTRAINT alerts_absence_due_unique UNIQUE (patient_id, form_id, due_at),
        ADD CONSTRAINT alerts_reminder_occurrence_unique UNIQUE (medication_reminder_id, scheduled_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      ALTER TABLE ${table('alerts')}
        DROP CONSTRAINT alerts_source_check,
        ADD CONSTRAINT alerts_source_check CHECK (source IN ('reading')),
        ALTER COLUMN source TYPE varchar(16),
        DROP COLUMN form_id,
        DROP COLUMN absence_since,
        DROP COLUMN due_at,
        DROP COLUMN frequency_interval,
        DROP COLUMN frequency_unit,
        DROP COLUMN medication_id,
        DROP COLUMN medication_reminder_id,
        DROP COLUMN scheduled_at
    `);
    await queryRunner.query(
      `DROP INDEX ${table('medication_reminders_due_idx')}`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('medication_reminders')} DROP CONSTRAINT medication_reminders_id_org_unique`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('medication_reminders')} DROP COLUMN dispatched_through, DROP COLUMN next_dispatch_at`,
    );
    await queryRunner.query(
      `DROP TABLE ${table('follow_up_absence_monitors')}`,
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

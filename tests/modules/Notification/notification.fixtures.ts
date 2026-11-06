import type { DataSource } from 'typeorm';

import { type Org, seeder } from '../Automation/automation.fixtures';

export {
  ALL_MIGRATIONS,
  type Org,
  testDataSource,
  TRUNCATE_AUTOMATION,
} from '../Automation/automation.fixtures';

type Profile = 'admin' | 'professional' | 'caregiver' | 'family';
type LinkRole = 'responsible_professional' | 'caregiver' | 'family';

/**
 * Semeadura do BE-17 sobre a do BE-16: usuarios de qualquer perfil,
 * vinculos, preferencias, inscricoes de push e alertas inseridos direto no
 * banco. A geracao e a entrega so leem o estado persistido.
 */
export const notificationSeeder = (dataSource: DataSource) => {
  const base = seeder(dataSource);
  let sequence = 0;

  const profileId = async (org: Org, profile: Profile) =>
    (await base.scalar(
      'SELECT id AS value FROM access_profiles WHERE organization_id = $1 AND code = $2',
      [org.id, profile],
    )) ??
    (await base.scalar(
      `INSERT INTO access_profiles (organization_id, code, name)
       VALUES ($1, $2, $2) RETURNING id AS value`,
      [org.id, profile],
    ));

  const cpf = (): string => {
    sequence += 1;
    const digits = String(500000000 + sequence * 7919);
    const digit = (value: string, weightStart: number) => {
      const sum = [...value].reduce(
        (total, char, index) => total + Number(char) * (weightStart - index),
        0,
      );
      const remainder = (sum * 10) % 11;

      return remainder === 10 ? 0 : remainder;
    };
    const first = digit(digits, 10);

    return `${digits}${first}${digit(`${digits}${first}`, 11)}`;
  };

  return {
    ...base,

    async user(
      org: Org,
      profile: Profile,
      status: 'active' | 'inactive' = 'active',
    ): Promise<string> {
      const label = `${profile}${sequence + 1}`;

      return base.scalar(
        `INSERT INTO users
           (organization_id, profile_id, name, email, cpf, status,
            must_change_password, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6::varchar, false,
                 CASE WHEN $6::varchar = 'inactive' THEN now() END)
         RETURNING id AS value`,
        [
          org.id,
          await profileId(org, profile),
          `Usuario ${label}`,
          `${label}@${org.id}.test`,
          cpf(),
          status,
        ],
      );
    },

    async link(
      org: Org,
      user: string,
      patient: string,
      role: LinkRole,
    ): Promise<string> {
      return base.scalar(
        `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
         VALUES ($1, $2, $3, $4) RETURNING id AS value`,
        [org.id, user, patient, role],
      );
    },

    revokeLink: (link: string) =>
      dataSource.query(
        'UPDATE user_patients SET deleted_at = now() WHERE id = $1',
        [link],
      ),

    /** Preferencias explicitas; colunas omitidas ficam no padrao. */
    async preferences(
      org: Org,
      user: string,
      columns: Record<string, boolean>,
    ): Promise<void> {
      const names = Object.keys(columns);

      await dataSource.query(
        `INSERT INTO notification_preferences
           (organization_id, user_id${names.map((name) => `, ${name}`).join('')})
         VALUES ($1, $2${names.map((_, index) => `, $${index + 3}`).join('')})
         ON CONFLICT (user_id) DO UPDATE SET ${
           names.length === 0
             ? 'updated_at = now()'
             : names.map((name) => `${name} = EXCLUDED.${name}`).join(', ')
         }`,
        [org.id, user, ...Object.values(columns)],
      );
    },

    async pushSubscription(
      org: Org,
      user: string,
      { revoked = false }: { revoked?: boolean } = {},
    ): Promise<string> {
      sequence += 1;

      return base.scalar(
        `INSERT INTO push_subscriptions
           (organization_id, user_id, endpoint, p256dh, auth, deleted_at, revoked_reason)
         VALUES ($1, $2, $3, 'chave-publica', 'segredo',
                 CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN 'user' END)
         RETURNING id AS value`,
        [
          org.id,
          user,
          `https://fcm.googleapis.com/fcm/send/${sequence}`,
          revoked,
        ],
      );
    },

    /** Alerta de ausencia gravado direto, sem notificacao. */
    async alert(
      org: Org,
      patient: string,
      severity: 'critical' | 'warning' | 'info' = 'warning',
    ): Promise<string> {
      const form = await base.form(org, { name: `Formulario ${sequence}` });

      sequence += 1;

      return base.scalar(
        `INSERT INTO alerts
           (organization_id, patient_id, source, form_id, title, message,
            severity, absence_since, due_at, frequency_interval, frequency_unit)
         VALUES ($1, $2, 'absence', $3, 'Ausência de registro', 'Sem registro.',
                 $4, now() - interval '2 days', now() - make_interval(secs => $5), 1, 'days')
         RETURNING id AS value`,
        [org.id, patient, form.id, severity, sequence],
      );
    },
  };
};

export type NotificationSeeder = ReturnType<typeof notificationSeeder>;

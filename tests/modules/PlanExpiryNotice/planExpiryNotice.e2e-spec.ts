import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { DisabledChannelSender } from '@/modules/Notification/channels/disabledChannel.sender';
import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import type { EmailSender } from '@/modules/Notification/channels/emailSender';
import { SmtpNotificationMailer } from '@/modules/Notification/channels/smtpNotification.mailer';
import { insertPlanTerm } from '@/modules/Plan/repositories/planTerm.query';
import { DeliverPlanExpiryNoticesUseCase } from '@/modules/PlanExpiryNotice/DeliverPlanExpiryNotices/deliverPlanExpiryNotices.useCase';
import { GeneratePlanExpiryNoticesUseCase } from '@/modules/PlanExpiryNotice/GeneratePlanExpiryNotices/generatePlanExpiryNotices.useCase';
import { noticeReference } from '@/modules/PlanExpiryNotice/policies/noticeSchedule.policy';
import { PlanExpiryNoticeRepository } from '@/modules/PlanExpiryNotice/repositories/planExpiryNotice.repository';
import { PlanExpiryNoticeDeliveryRepository } from '@/modules/PlanExpiryNotice/repositories/planExpiryNoticeDelivery.repository';

import {
  testDataSource,
  TRUNCATE_AUTOMATION,
} from '../Automation/automation.fixtures';
import {
  type FakeSmtp,
  type NoticeOrg,
  noticeSeeder,
  type NoticeSeeder,
  readMessage,
  startFakeSmtp,
} from './planExpiryNotice.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const APP_URL = 'https://app.example.com';
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

interface DeliveryRow {
  userId: string;
  organizationId: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  sentAt: Date | null;
  dueInSeconds: number;
}

const fakeSender = () => ({
  enabled: true,
  send: jest.fn<Promise<DeliveryResult>, unknown[]>(),
});

describeWithDatabase('aviso de vencimento do plano (e2e)', () => {
  let dataSource: DataSource;
  let seed: NoticeSeeder;
  let reference: Date;
  let sequence = 0;
  const email = fakeSender();

  const config = (values: Record<string, unknown> = {}) => {
    const all: Record<string, unknown> = {
      'notification.appUrl': APP_URL,
      ...values,
    };

    return {
      get: (key: string) => all[key],
      getOrThrow: (key: string) => {
        if (!(key in all)) throw new Error(`config ausente: ${key}`);
        return all[key];
      },
    } as unknown as ConfigService;
  };

  const generate = (at: Date = reference) =>
    new GeneratePlanExpiryNoticesUseCase(
      new PlanExpiryNoticeRepository(dataSource),
    ).execute(at);

  const deliver = (sender: EmailSender = email) =>
    new DeliverPlanExpiryNoticesUseCase(
      new PlanExpiryNoticeDeliveryRepository(dataSource),
      sender,
      config(),
    ).execute();

  const noticesOf = (org: NoticeOrg) =>
    dataSource.query<
      Array<{ id: string; milestone: string; termId: string; validUntil: Date }>
    >(
      `SELECT id, milestone, plan_term_id AS "termId", valid_until AS "validUntil"
         FROM plan_expiry_notices WHERE organization_id = $1
        ORDER BY created_at, milestone`,
      [org.id],
    );

  const deliveriesOf = (org: NoticeOrg) =>
    dataSource.query<DeliveryRow[]>(
      `SELECT d.user_id AS "userId", d.organization_id AS "organizationId",
              d.status, d.attempts, d.last_error_code AS "lastErrorCode",
              d.sent_at AS "sentAt",
              round(extract(epoch FROM d.next_attempt_at - now()))::int AS "dueInSeconds"
         FROM plan_expiry_notice_deliveries d
         JOIN plan_expiry_notices n ON n.id = d.notice_id
        WHERE n.organization_id = $1
        ORDER BY d.created_at, d.user_id`,
      [org.id],
    );

  const makeDue = (org: NoticeOrg) =>
    dataSource.query(
      `UPDATE plan_expiry_notice_deliveries
          SET next_attempt_at = now() - interval '1 second'
        WHERE organization_id = $1 AND status = 'pending'`,
      [org.id],
    );

  /** Organizacao cliente com dois admins ativos. */
  const tenant = async () => {
    sequence += 1;
    const org = await seed.organization(`aviso-${sequence}`);
    const admins = [
      await seed.user(org, 'admin'),
      await seed.user(org, 'admin'),
    ];

    return { org, admins };
  };

  // Fins relativos a referencia (uma 08:00 de Brasilia):
  const sevenDaysEnd = () => new Date(reference.getTime() + 5 * DAY_MS);
  const oneDayEnd = () => new Date(reference.getTime() + DAY_MS + 15 * HOUR_MS);
  const expiredEnd = () => new Date(reference.getTime() - HOUR_MS);

  beforeAll(async () => {
    dataSource = testDataSource(databaseUrl!);
    await dataSource.initialize();

    if (
      (
        await dataSource.query<Array<{ value: string | null }>>(
          "SELECT to_regclass('public.organizations')::text AS value",
        )
      )[0].value !== null
    ) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }

    await dataSource.runMigrations();
    seed = noticeSeeder(dataSource);
    const [{ now }] = await dataSource.query<Array<{ now: Date }>>(
      'SELECT now() AS now',
    );
    reference = noticeReference(now);
  }, 120000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;

    await dataSource.query(TRUNCATE_AUTOMATION);

    for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 120000);

  beforeEach(async () => {
    jest.resetAllMocks();
    email.send.mockResolvedValue({ kind: 'sent' });
    // Cada teste so enxerga os proprios termos e entregas.
    await dataSource.query(
      'UPDATE organization_plan_terms SET superseded_at = now() WHERE superseded_at IS NULL',
    );
    await dataSource.query(
      "UPDATE plan_expiry_notice_deliveries SET status = 'skipped', last_error_code = 'TEST_RESET' WHERE status = 'pending'",
    );
  });

  describe('marcos', () => {
    it('cada marco gera um aviso por termo, um e-mail por admin ativo, e repetir nao duplica', async () => {
      const seven = await tenant();
      const one = await tenant();
      const expired = await tenant();
      const inactiveAdmin = await seed.user(seven.org, 'admin', 'inactive');
      const professional = await seed.user(seven.org, 'professional');
      await seed.term(seven.org, sevenDaysEnd());
      await seed.term(one.org, oneDayEnd());
      const expiredTerm = await seed.term(expired.org, expiredEnd());

      await expect(generate()).resolves.toEqual({
        notices: 3,
        recipients: 6,
        failed: 0,
      });
      await expect(generate()).resolves.toEqual({
        notices: 0,
        recipients: 0,
        failed: 0,
      });

      for (const [{ org, admins }, milestone] of [
        [seven, 'seven_days'],
        [one, 'one_day'],
        [expired, 'expired'],
      ] as const) {
        expect((await noticesOf(org)).map((n) => n.milestone)).toEqual([
          milestone,
        ]);
        expect((await deliveriesOf(org)).map((d) => d.userId).sort()).toEqual(
          admins.map((admin) => admin.id).sort(),
        );
      }
      const sevenRecipients = (await deliveriesOf(seven.org)).map(
        (d) => d.userId,
      );
      expect(sevenRecipients).not.toContain(inactiveAdmin.id);
      expect(sevenRecipients).not.toContain(professional.id);

      const [audit] = await dataSource.query<
        Array<{
          actorType: string;
          actorUserId: string | null;
          entityType: string;
          entityId: string;
          afterValues: Record<string, unknown>;
          ipAddress: string | null;
        }>
      >(
        `SELECT actor_type AS "actorType", actor_user_id AS "actorUserId",
                entity_type AS "entityType", entity_id AS "entityId",
                after_values AS "afterValues", ip_address AS "ipAddress"
           FROM audit_events
          WHERE action = 'plan_expiry_notice.generated' AND organization_id = $1`,
        [expired.org.id],
      );
      expect(audit).toEqual({
        actorType: 'system',
        actorUserId: null,
        entityType: 'organization_plan_term',
        entityId: expiredTerm,
        afterValues: {
          milestone: 'expired',
          endsAt: expiredEnd().toISOString(),
          recipients: 2,
        },
        ipAddress: null,
      });
      expect(
        await seed.scalar(
          `SELECT count(*)::int AS value FROM audit_events
            WHERE action = 'plan_expiry_notice.generated'
              AND after_values::text LIKE '%@%'`,
        ),
      ).toBe(0);
    });

    it('duas execucoes ao mesmo tempo (dois workers) geram um aviso so', async () => {
      const { org } = await tenant();
      await seed.term(org, expiredEnd());

      const runs = await Promise.all([generate(), generate(), generate()]);

      expect(runs.reduce((total, run) => total + run.notices, 0)).toBe(1);
      expect(await noticesOf(org)).toHaveLength(1);
      expect(await deliveriesOf(org)).toHaveLength(2);
    });

    it('marco atrasado por queda: sai so o que ainda vale, nunca o de 7 dias depois do de 1 dia', async () => {
      const { org } = await tenant();
      await seed.term(org, oneDayEnd());

      await generate(new Date(reference.getTime() - 3 * DAY_MS));
      await generate();

      expect((await noticesOf(org)).map((n) => n.milestone)).toEqual([
        'seven_days',
        'one_day',
      ]);

      const { org: late } = await tenant();
      await seed.term(late, oneDayEnd());
      await generate();
      expect((await noticesOf(late)).map((n) => n.milestone)).toEqual([
        'one_day',
      ]);
    });

    it('sem a referencia, a execucao usa a 08:00 de Brasilia mais recente', async () => {
      const { org } = await tenant();
      await seed.term(org, expiredEnd());

      await new GeneratePlanExpiryNoticesUseCase(
        new PlanExpiryNoticeRepository(dataSource),
      ).execute();

      expect((await noticesOf(org)).map((n) => n.milestone)).toEqual([
        'expired',
      ]);
    });

    it('termo aberto depois da 08:00 espera a execucao do dia seguinte', async () => {
      const { org } = await tenant();
      await seed.term(org, expiredEnd(), new Date(reference.getTime() + 1000));

      await generate();
      expect(await noticesOf(org)).toEqual([]);

      await generate(new Date(reference.getTime() + DAY_MS));
      expect((await noticesOf(org)).map((n) => n.milestone)).toEqual([
        'expired',
      ]);
    });

    it('fica de fora: plataforma, termo sem fim, organizacao inativa e fim distante', async () => {
      const platform = await seed.organization('plataforma-aviso', {
        kind: 'platform',
      });
      await seed.user(platform, 'admin');
      await seed.term(platform, expiredEnd());

      const { org: noEnd } = await tenant();
      await seed.term(noEnd, null);

      const { org: inactive } = await tenant();
      await seed.term(inactive, expiredEnd());
      await dataSource.query(
        "UPDATE organizations SET status = 'inactive', deleted_at = now() WHERE id = $1",
        [inactive.id],
      );

      const { org: far } = await tenant();
      await seed.term(far, new Date(reference.getTime() + 30 * DAY_MS));

      await expect(generate()).resolves.toEqual({
        notices: 0,
        recipients: 0,
        failed: 0,
      });
      for (const org of [platform, noEnd, inactive, far]) {
        expect(await noticesOf(org)).toEqual([]);
      }
    });
  });

  describe('entrega', () => {
    it('duas organizacoes: o aviso de A so vai para os admins de A', async () => {
      const a = await tenant();
      const b = await tenant();
      await seed.term(a.org, expiredEnd());
      await seed.term(b.org, sevenDaysEnd());

      await generate();
      await deliver();

      const sentTo = email.send.mock.calls.map(
        ([message]) => (message as { to: string }).to,
      );
      expect(sentTo.sort()).toEqual(
        [...a.admins, ...b.admins].map((admin) => admin.email).sort(),
      );
      for (const { org } of [a, b]) {
        const rows = await deliveriesOf(org);

        expect(rows.every((row) => row.organizationId === org.id)).toBe(true);
        expect(rows.map((row) => row.status)).toEqual(['sent', 'sent']);
      }
      const aSubjects = email.send.mock.calls
        .map(([message]) => message as { to: string; text: string })
        .filter((message) =>
          a.admins.some((admin) => admin.email === message.to),
        )
        .map((message) => message.text);
      expect(aSubjects.every((text) => text.includes(a.org.code))).toBe(true);
      expect(aSubjects.some((text) => text.includes(b.org.code))).toBe(false);
    });

    it('renovacao antes do envio cancela os pendentes; o termo novo tem os proprios marcos', async () => {
      const { org } = await tenant();
      const oldTerm = await seed.term(org, expiredEnd());
      await generate();

      await dataSource.transaction(async (manager) => {
        await insertPlanTerm(manager, {
          organizationId: org.id,
          usagePlanId: await seed.scalar(
            "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
          ),
          origin: 'assignment',
          changeRequestId: null,
          reason: null,
          assignedByUserId: null,
          term: { endsAt: oneDayEnd(), userLimit: null, patientLimit: null },
        });
      });

      await deliver();
      expect(email.send).not.toHaveBeenCalled();
      expect(
        (await deliveriesOf(org)).map((row) => [row.status, row.lastErrorCode]),
      ).toEqual([
        ['skipped', 'TERM_SUPERSEDED'],
        ['skipped', 'TERM_SUPERSEDED'],
      ]);

      await generate(new Date(reference.getTime() + DAY_MS));
      const notices = await noticesOf(org);
      expect(notices.map((n) => [n.termId === oldTerm, n.milestone])).toEqual([
        [true, 'expired'],
        [false, 'one_day'],
      ]);
      await deliver();
      expect(email.send).toHaveBeenCalledTimes(2);
    });

    it('nada sai antes do marco, mesmo gerado por uma execucao adiantada', async () => {
      const { org } = await tenant();
      const tomorrow = new Date(reference.getTime() + DAY_MS);
      await seed.term(org, new Date(tomorrow.getTime() - HOUR_MS));

      await generate(tomorrow);
      const count = await deliver();

      expect(email.send).not.toHaveBeenCalled();
      expect(count.sent).toBe(0);
      expect(count.nextAttemptAt).toEqual(tomorrow);
      const rows = await deliveriesOf(org);
      expect(rows.map((row) => [row.status, row.attempts])).toEqual([
        ['pending', 0],
        ['pending', 0],
      ]);
      for (const row of rows) {
        expect(row.dueInSeconds).toBeGreaterThan(0);
      }
    });

    it('admin inativado ou rebaixado antes do envio nao recebe', async () => {
      const { org, admins } = await tenant();
      await seed.term(org, expiredEnd());
      await generate();

      await dataSource.query(
        "UPDATE users SET status = 'inactive', deleted_at = now() WHERE id = $1",
        [admins[0].id],
      );
      await dataSource.query(
        `UPDATE users SET profile_id = (
           SELECT id FROM access_profiles WHERE organization_id = $1 AND code = 'professional')
          WHERE id = $2`,
        [org.id, admins[1].id],
      );

      await deliver();
      expect(email.send).not.toHaveBeenCalled();
      expect((await deliveriesOf(org)).map((row) => row.lastErrorCode)).toEqual(
        ['RECIPIENT_REVOKED', 'RECIPIENT_REVOKED'],
      );
    });

    it('organizacao inativada antes do envio nao recebe', async () => {
      const { org } = await tenant();
      await seed.term(org, expiredEnd());
      await generate();
      await dataSource.query(
        "UPDATE organizations SET status = 'inactive', deleted_at = now() WHERE id = $1",
        [org.id],
      );

      await deliver();
      expect(email.send).not.toHaveBeenCalled();
      expect((await deliveriesOf(org)).map((row) => row.lastErrorCode)).toEqual(
        ['ORGANIZATION_INACTIVE', 'ORGANIZATION_INACTIVE'],
      );
    });

    it('aviso que perdeu a validade nao sai (o de 7 dias depois do marco de 1 dia)', async () => {
      const { org } = await tenant();
      await seed.term(org, sevenDaysEnd());
      await generate();
      await dataSource.query(
        "UPDATE plan_expiry_notices SET valid_until = now() - interval '1 minute' WHERE organization_id = $1",
        [org.id],
      );

      await deliver();
      expect(email.send).not.toHaveBeenCalled();
      expect((await deliveriesOf(org)).map((row) => row.lastErrorCode)).toEqual(
        ['NOTICE_OUTDATED', 'NOTICE_OUTDATED'],
      );
    });

    it('SMTP desligado: tudo registrado como nao enviado, sem log de erro ou aviso', async () => {
      const { org } = await tenant();
      await seed.term(org, expiredEnd());
      const error = jest.spyOn(Logger.prototype, 'error');
      const warn = jest.spyOn(Logger.prototype, 'warn');

      await generate();
      const count = await deliver(new DisabledChannelSender());

      expect(count).toMatchObject({ sent: 0, failed: 0, skipped: 2 });
      expect(count.nextAttemptAt).toBeNull();
      expect(
        (await deliveriesOf(org)).map((row) => [
          row.status,
          row.lastErrorCode,
          row.sentAt,
        ]),
      ).toEqual([
        ['skipped', 'CHANNEL_DISABLED', null],
        ['skipped', 'CHANNEL_DISABLED', null],
      ]);
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      error.mockRestore();
      warn.mockRestore();
    });

    describe('SMTP ligado (transporte real contra um SMTP em processo)', () => {
      let smtp: FakeSmtp;
      let mailer: SmtpNotificationMailer;

      beforeAll(async () => {
        smtp = await startFakeSmtp();
        mailer = new SmtpNotificationMailer(
          config({
            'mail.from': 'VitaCare <no-reply@example.com>',
            'mail.host': '127.0.0.1',
            'mail.port': smtp.port,
            'mail.secure': false,
            'mail.connectionTimeoutMs': 2000,
            'mail.greetingTimeoutMs': 2000,
            'mail.socketTimeoutMs': 2000,
          }),
        );
      });

      afterAll(async () => {
        await smtp?.close();
      });

      beforeEach(() => {
        smtp.messages.length = 0;
        smtp.failNext(0);
      });

      it('o e-mail chega com organizacao, plano, data de fim, efeito e como renovar', async () => {
        const { org, admins } = await tenant();
        const endsAt = expiredEnd();
        await seed.term(org, endsAt);
        await generate();

        const count = await deliver(mailer);

        expect(count).toMatchObject({ sent: 2, retried: 0, failed: 0 });
        const messages = smtp.messages.map(readMessage);
        expect(messages.map((m) => m.to).sort()).toEqual(
          admins.map((admin) => admin.email).sort(),
        );
        const [message] = messages;
        expect(message.subject).toBe('VitaCare: o plano da organização venceu');
        expect(message.text).toContain(
          `O plano Basic da organização ${org.code} venceu em`,
        );
        expect(message.text).toContain('(horário de Brasília)');
        expect(message.text).toContain(
          'Até a renovação, a organização não consegue cadastrar nem reativar usuários e pacientes.',
        );
        expect(message.text).toContain('solicitação de mudança de plano');
        expect(message.text).toContain(APP_URL);
        expect(message.text.toLowerCase()).not.toContain('paciente ');
        expect(
          (await deliveriesOf(org)).every(
            (row) => row.status === 'sent' && row.sentAt !== null,
          ),
        ).toBe(true);
      });

      it('falha temporaria do SMTP tenta de novo depois, sem duplicar', async () => {
        const { org } = await tenant();
        await seed.term(org, sevenDaysEnd());
        await generate();
        smtp.failNext(2);

        const first = await deliver(mailer);

        expect(first).toMatchObject({ sent: 0, retried: 2 });
        expect(first.nextAttemptAt).not.toBeNull();
        const pending = await deliveriesOf(org);
        expect(
          pending.map((row) => [row.status, row.attempts, row.lastErrorCode]),
        ).toEqual([
          ['pending', 1, 'SMTP_TEMPORARY'],
          ['pending', 1, 'SMTP_TEMPORARY'],
        ]);
        for (const row of pending) {
          expect(row.dueInSeconds).toBeGreaterThanOrEqual(55);
          expect(row.dueInSeconds).toBeLessThanOrEqual(60);
        }
        expect(smtp.messages).toHaveLength(0);

        await expect(deliver(mailer)).resolves.toMatchObject({ sent: 0 });
        await makeDue(org);
        await expect(deliver(mailer)).resolves.toMatchObject({ sent: 2 });
        await expect(deliver(mailer)).resolves.toMatchObject({ sent: 0 });

        expect(smtp.messages).toHaveLength(2);
        expect(
          (await deliveriesOf(org)).map((row) => [row.status, row.attempts]),
        ).toEqual([
          ['sent', 2],
          ['sent', 2],
        ]);
      });
    });
  });

  describe('schema', () => {
    it('entidades nao pedem criar ou remover tabela ou coluna', async () => {
      const changes = await dataSource.driver.createSchemaBuilder().log();

      expect(
        changes.upQueries
          .map((query) => query.query)
          .filter((sql) =>
            [
              '"plan_expiry_notices"',
              '"plan_expiry_notice_deliveries"',
              '"organization_plan_terms"',
            ].some((table) => sql.includes(table)),
          )
          .filter((sql) =>
            /\b(?:CREATE|DROP) TABLE\b|\b(?:ADD|DROP) COLUMN\b/.test(sql),
          ),
      ).toEqual([]);
    });

    it('aviso repetido por termo e marco e entrega repetida por usuario sao recusados', async () => {
      const { org, admins } = await tenant();
      const term = await seed.term(org, expiredEnd());
      await generate();
      const [notice] = await noticesOf(org);

      await expect(
        dataSource.query(
          `INSERT INTO plan_expiry_notices (organization_id, plan_term_id, milestone, term_ends_at, due_at)
           VALUES ($1, $2, 'expired', now(), now())`,
          [org.id, term],
        ),
      ).rejects.toThrow(/plan_expiry_notices_term_milestone_unique/);
      await expect(
        dataSource.query(
          `INSERT INTO plan_expiry_notice_deliveries (organization_id, notice_id, user_id)
           VALUES ($1, $2, $3)`,
          [org.id, notice.id, admins[0].id],
        ),
      ).rejects.toThrow(/plan_expiry_notice_deliveries_notice_user_unique/);
    });

    it('entrega para usuario de outra organizacao e recusada pela FK de tenant', async () => {
      const a = await tenant();
      const b = await tenant();
      await seed.term(a.org, expiredEnd());
      await generate();
      const [notice] = await noticesOf(a.org);

      await expect(
        dataSource.query(
          `INSERT INTO plan_expiry_notice_deliveries (organization_id, notice_id, user_id)
           VALUES ($1, $2, $3)`,
          [a.org.id, notice.id, b.admins[0].id],
        ),
      ).rejects.toThrow(/plan_expiry_notice_deliveries_user_tenant_fk/);
    });

    it('down remove as tabelas e a chave composta do termo; up de novo funciona', async () => {
      await dataSource.query(
        'TRUNCATE plan_expiry_notice_deliveries, plan_expiry_notices',
      );
      await dataSource.undoLastMigration(); // CreateTermsOfUse (BE-32), que vem depois
      await dataSource.undoLastMigration(); // CreateUserInvitations (BE-31), que vem depois
      await dataSource.undoLastMigration(); // AddManagementReportsPermission (BE-30), que vem depois
      await dataSource.undoLastMigration();

      try {
        expect(
          await seed.scalar(
            "SELECT to_regclass('public.plan_expiry_notices')::text AS value",
          ),
        ).toBeNull();
        expect(
          await seed.scalar(
            "SELECT count(*)::int AS value FROM pg_constraint WHERE conname = 'organization_plan_terms_id_org_unique'",
          ),
        ).toBe(0);
      } finally {
        await dataSource.runMigrations();
      }

      expect(
        await seed.scalar(
          "SELECT to_regclass('public.plan_expiry_notice_deliveries')::text AS value",
        ),
      ).toBe('plan_expiry_notice_deliveries');
    });
  });
});

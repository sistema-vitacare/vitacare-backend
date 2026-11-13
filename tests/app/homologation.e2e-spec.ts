import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';

import { ALERTS_QUEUE } from '@/modules/Alert/EvaluateFollowUpAlerts/alertSweep.processor';
import {
  ABSENCE_SWEEP,
  AUTOMATION_QUEUE,
  MEDICATION_REMINDER_SWEEP,
} from '@/modules/Automation/automation.processor';
import {
  NOTIFICATION_DELIVERY_SWEEP,
  NOTIFICATIONS_QUEUE,
} from '@/modules/Notification/notification.processor';
import {
  PLAN_EXPIRY_NOTICE_DAILY,
  PLAN_EXPIRY_NOTICES_QUEUE,
} from '@/modules/PlanExpiryNotice/planExpiryNotice.processor';

import { FakeEmailSender } from './fakeEmailSender';
import {
  bootFullApp,
  CORS_ORIGIN,
  type FullApp,
  migrationFiles,
} from './fullApp.fixtures';

/**
 * Homologacao funcional do backend (BE-24): os 14 casos de uso de ponta a
 * ponta sobre a API inteira, num banco limpo migrado como em producao, com
 * duas organizacoes, arquivos no disco, filas BullMQ no Redis real,
 * revogacao e concorrencia. Cada `it` e um passo da jornada e depende dos
 * anteriores; as regras de cada modulo seguem nas suites proprias.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithInfrastructure =
  databaseUrl && redisUrl ? describe : describe.skip;

const PASSWORD = 'senha definitiva de homologacao';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('imagem sintetica de homologacao'),
]);

const HIDDEN = '********';

type Role = 'admin' | 'professional' | 'caregiver' | 'caregiver2' | 'family';

interface Tenant {
  key: 'A' | 'B';
  id: string;
  code: string;
  users: Record<Role, string>;
  tokens: Record<Role, string>;
}

interface FormVersion {
  id: string;
  fields: Array<{ id: string; fieldKey: string; name: string }>;
}

const cpfFrom = (base: string): string => {
  const digit = (digits: string, weightStart: number) => {
    const sum = [...digits].reduce(
      (total, value, index) => total + Number(value) * (weightStart - index),
      0,
    );
    const remainder = (sum * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  };
  const first = digit(base, 10);

  return `${base}${first}${digit(`${base}${first}`, 11)}`;
};

let cpfSequence = 0;
const nextCpf = () => {
  cpfSequence += 1;

  return cpfFrom(String(500000000 + cpfSequence * 7919));
};

const dataOf = <T>(response: { body: unknown }) =>
  (response.body as { data: T }).data;
const codeOf = (response: { body: unknown }) =>
  (response.body as { error?: { code: string } }).error?.code;
const totalOf = (response: { body: unknown }) =>
  (response.body as { meta: { pagination: { total: number } } }).meta.pagination
    .total;

/** Repete `probe` ate `accept` aceitar o resultado ou o prazo acabar. */
const eventually = async <T>(
  probe: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 30000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();

  while (!accept(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    value = await probe();
  }

  return value;
};

describeWithInfrastructure('homologacao funcional dos 14 casos de uso', () => {
  let t: FullApp;
  const mail = new FakeEmailSender(false);

  const plans: Record<string, string> = {};
  const tenants = {} as Record<'A' | 'B', Tenant>;
  let masterToken: string;

  const s = {} as {
    patientId: string;
    patientBId: string;
    familyLinkId: string;
    form: { id: string; version: FormVersion };
    routineFormId: string;
    ruleId: string;
    medicationId: string;
    followUpId: string;
    attachmentId: string;
    alertId: string;
  };

  const http = (...args: Parameters<FullApp['http']>) => t.http(...args);

  const login = (organizationCode: string, email: string, password: string) =>
    http('post', '/auth/login', null, { organizationCode, email, password });

  /** Primeiro acesso de quem recebeu senha provisoria; devolve o token. */
  const activate = async (
    organizationCode: string,
    email: string,
    temporaryPassword: string,
  ) => {
    const restricted = await login(organizationCode, email, temporaryPassword);

    expect(restricted.status).toBe(200);
    expect(dataOf<{ state: string }>(restricted).state).toBe(
      'password_change_required',
    );
    // BE-27: a sessao restrita identifica o usuario, sem nenhuma permissao.
    expect(
      dataOf<{
        session: { user: { email: string }; permissions: string[] };
      }>(restricted).session,
    ).toMatchObject({ user: { email }, permissions: [] });

    const restrictedToken = dataOf<{ accessToken: string }>(
      restricted,
    ).accessToken;

    expect((await http('get', '/users', restrictedToken)).status).toBe(401);
    expect(
      (
        await http('post', '/auth/password/first-access', restrictedToken, {
          newPassword: PASSWORD,
        })
      ).status,
    ).toBe(200);

    const session = await login(organizationCode, email, PASSWORD);

    expect(dataOf<{ state: string }>(session).state).toBe('authenticated');

    // BE-27: o login devolve a sessao que o frontend usa como cache.
    const block = dataOf<{
      session: {
        user: { email: string; cpf: string };
        permissions: string[];
        organization: { code: string };
      };
    }>(session).session;

    expect(block.user.email).toBe(email);
    expect(block.user.cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    expect(block.permissions).toContain('profile:manage');
    expect(block.organization.code).toBe(organizationCode);

    return dataOf<{ accessToken: string }>(session).accessToken;
  };

  beforeAll(async () => {
    // Porta SMTP falsa desligada: o roteiro roda como em producao, sem SMTP.
    // So o trecho do convite por e-mail (BE-31) a liga.
    t = await bootFullApp(databaseUrl!, redisUrl!, { emailSender: mail });
  }, 120000);

  afterAll(async () => {
    await t?.close();
  }, 120000);

  describe('implantacao', () => {
    it('aplica todas as migrations no banco vazio, como o entrypoint de producao', () => {
      expect(t.executedMigrations).toHaveLength(migrationFiles().length);
      expect(t.executedMigrations.at(-1)).toBe(
        'CreateUserInvitations1792100000000',
      );
    });

    it('responde vivo e pronto com PostgreSQL e Redis reais', async () => {
      const ready = await request(t.server()).get('/health/ready');

      expect(ready.status).toBe(200);
      expect(ready.body).toMatchObject({
        status: 'ok',
        info: { postgres: { status: 'up' }, redis: { status: 'up' } },
      });
      expect((await request(t.server()).get('/health/live')).status).toBe(200);
      expect(dataOf<{ version: string }>(await http('get', '')).version).toBe(
        'homologacao',
      );
    });

    it('agenda as varreduras das quatro rotinas e o aviso diario de vencimento nas filas do Redis', async () => {
      const schedulers = async (name: string) =>
        (await t.app.get<Queue>(getQueueToken(name)).getJobSchedulers()).map(
          (scheduler) => scheduler.key,
        );

      expect(
        await eventually(
          async () => [
            ...(await schedulers(ALERTS_QUEUE)),
            ...(await schedulers(AUTOMATION_QUEUE)),
            ...(await schedulers(NOTIFICATIONS_QUEUE)),
            ...(await schedulers(PLAN_EXPIRY_NOTICES_QUEUE)),
          ],
          (keys) => keys.length === 5,
          10000,
        ),
      ).toEqual(
        expect.arrayContaining([
          'alerts-sweep',
          ABSENCE_SWEEP,
          MEDICATION_REMINDER_SWEEP,
          NOTIFICATION_DELIVERY_SWEEP,
          PLAN_EXPIRY_NOTICE_DAILY,
        ]),
      );

      // BE-28: so as 08:00 de Brasilia, sem rodar o tempo todo.
      const [daily] = await t.app
        .get<Queue>(getQueueToken(PLAN_EXPIRY_NOTICES_QUEUE))
        .getJobSchedulers();
      expect(daily).toMatchObject({
        key: PLAN_EXPIRY_NOTICE_DAILY,
        pattern: '0 8 * * *',
        tz: 'America/Sao_Paulo',
      });
    });
  });

  describe('UC01/UC03 — plataforma, organizacoes e primeiro acesso', () => {
    it('o master troca a senha provisoria do seed e consulta o catalogo do Quadro 2', async () => {
      masterToken = await activate(
        t.master.organizationCode,
        t.master.email,
        t.master.password,
      );

      const catalog = await http('get', '/plans', masterToken);

      expect(catalog.status).toBe(200);

      for (const plan of dataOf<Array<{ id: string; code: string }>>(catalog)) {
        plans[plan.code] = plan.id;
      }

      expect(Object.keys(plans).sort()).toEqual(['basic', 'enterprise']);
    });

    it('cadastra A (Enterprise) e B (Basic), cada uma com o primeiro administrador', async () => {
      for (const [key, plan] of [
        ['A', 'enterprise'],
        ['B', 'basic'],
      ] as const) {
        const code = `homologacao-${key.toLowerCase()}`;
        const created = await http('post', '/organizations', masterToken, {
          code,
          tradeName: `Organizacao ${key}`,
          usagePlanId: plans[plan],
          administrator: {
            name: `Admin ${key}`,
            email: `admin@${code}.test`,
            cpf: nextCpf(),
          },
        });

        expect(created.status).toBe(201);

        const body = dataOf<{
          organization: { id: string };
          administrator: { id: string };
          temporaryPassword: string;
        }>(created);

        tenants[key] = {
          key,
          code,
          id: body.organization.id,
          users: { admin: body.administrator.id } as Tenant['users'],
          tokens: {
            admin: await activate(
              code,
              `admin@${code}.test`,
              body.temporaryPassword,
            ),
          } as Tenant['tokens'],
        };
      }

      expect(
        (
          await http('post', '/organizations', tenants.A.tokens.admin, {
            code: 'intrusa',
            tradeName: 'Intrusa',
            usagePlanId: plans.basic,
            administrator: {
              name: 'X',
              email: 'x@intrusa.test',
              cpf: nextCpf(),
            },
          })
        ).status,
      ).toBe(403);
    });

    it('o administrador convida os quatro perfis; cada convidado entra pelo primeiro acesso', async () => {
      for (const tenant of Object.values(tenants)) {
        for (const [role, profileCode] of [
          ['professional', 'professional'],
          ['caregiver', 'caregiver'],
          ['caregiver2', 'caregiver'],
          ['family', 'family'],
        ] as const) {
          const email = `${role}@${tenant.code}.test`;
          const invited = await http('post', '/users', tenant.tokens.admin, {
            name: `${role} ${tenant.key}`,
            email,
            cpf: nextCpf(),
            profileCode,
          });

          expect(invited.status).toBe(201);

          const body = dataOf<{
            temporaryPassword: string;
            user: { id: string; status: string };
          }>(invited);

          expect(body.user.status).toBe('pending');
          tenant.users[role] = body.user.id;
          tenant.tokens[role] = await activate(
            tenant.code,
            email,
            body.temporaryPassword,
          );
        }
      }

      const duplicate = await http('post', '/users', tenants.A.tokens.admin, {
        name: 'Repetido',
        email: 'professional@homologacao-a.test',
        cpf: nextCpf(),
        profileCode: 'caregiver',
      });

      expect(duplicate.status).toBe(409);

      const invalid = await http('post', '/users', tenants.A.tokens.admin, {
        name: '',
        email: 'nao-e-email',
        cpf: '123',
        profileCode: 'chefe',
      });

      expect(invalid.status).toBe(422);
      expect(
        (
          invalid.body as { error: { fields: Array<{ field: string }> } }
        ).error.fields.map((field) => field.field),
      ).toEqual(expect.arrayContaining(['email', 'cpf', 'profileCode']));
      // Oito convites com primeiro acesso: ~32 hashes argon2id, lentos de
      // proposito; o limite padrao de 5 s depende da velocidade da maquina.
    }, 30000);

    it('UC01 — senha errada 401, logout revoga o token na chamada seguinte', async () => {
      const wrong = await login(
        tenants.A.code,
        'admin@homologacao-a.test',
        'senha totalmente errada',
      );

      expect(wrong.status).toBe(401);

      const extra = dataOf<{ accessToken: string }>(
        await login(tenants.A.code, 'admin@homologacao-a.test', PASSWORD),
      ).accessToken;

      expect((await http('get', '/organizations/me', extra)).status).toBe(200);
      expect((await http('post', '/auth/logout', extra)).status).toBe(200);
      expect((await http('get', '/organizations/me', extra)).status).toBe(401);
      expect(
        (await http('get', '/organizations/me', tenants.A.tokens.admin)).status,
      ).toBe(200);
    });

    it('UC02 — recuperacao assistida: pedido generico 202 e senha temporaria do administrador', async () => {
      for (const email of [
        'family@homologacao-a.test',
        'ninguem@homologacao-a.test',
      ]) {
        const asked = await http(
          'post',
          '/auth/password-recovery/request',
          null,
          { organizationCode: tenants.A.code, email },
        );

        expect(asked.status).toBe(202);
        expect(
          (asked.body as { meta: { message: string } }).meta.message,
        ).toEqual(expect.any(String));
      }

      const reset = await http(
        'post',
        `/auth/users/${tenants.A.users.family}/temporary-password`,
        tenants.A.tokens.admin,
      );

      expect(reset.status).toBe(201);

      tenants.A.tokens.family = await activate(
        tenants.A.code,
        'family@homologacao-a.test',
        dataOf<{ temporaryPassword: string }>(reset).temporaryPassword,
      );

      expect(
        (
          await http(
            'post',
            `/auth/users/${tenants.A.users.family}/temporary-password`,
            tenants.B.tokens.admin,
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('UC04 — plano, consumo e solicitacao de mudanca', () => {
    it('mostra plano e consumo; pedidos simultaneos geram uma unica solicitacao', async () => {
      const plan = dataOf<{
        plan: { code: string };
        usage: { users: number; patients: number };
      }>(await http('get', '/organizations/me/plan', tenants.B.tokens.admin));

      expect(plan.plan.code).toBe('basic');
      expect(plan.usage).toMatchObject({ users: 5, patients: 0 });

      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          http('post', '/plan-change-requests', tenants.B.tokens.admin, {
            requestedPlanId: plans.enterprise,
          }),
        ),
      );
      const statuses = attempts.map((response) => response.status).sort();

      expect(statuses).toEqual([201, 409, 409, 409, 409]);

      const requestId = dataOf<{ id: string }>(
        attempts.find((response) => response.status === 201)!,
      ).id;

      expect(
        (
          await http(
            'post',
            `/plan-change-requests/${requestId}/approve`,
            tenants.B.tokens.admin,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await http(
            'post',
            `/plan-change-requests/${requestId}/reject`,
            masterToken,
            { decisionNote: 'Volume atual cabe no Basic.' },
          )
        ).status,
      ).toBe(200);
      expect(
        dataOf<{ plan: { code: string } }>(
          await http('get', '/organizations/me/plan', tenants.B.tokens.admin),
        ).plan.code,
      ).toBe('basic');
    });
  });

  describe('UC07/UC03 — pacientes e vinculos', () => {
    it('cadastra paciente com responsavel; obrigatorios e CPF repetido sao recusados', async () => {
      const A = tenants.A;
      const cpf = nextCpf();
      const created = await http('post', '/patients', A.tokens.professional, {
        name: 'Maria Homologacao',
        birthDate: '1948-03-12',
        responsibleUserId: A.users.professional,
        cpf,
        phone: '(11) 98765-4321',
        healthPlan: 'Plano Exemplo',
      });

      expect(created.status).toBe(201);
      s.patientId = dataOf<{ id: string }>(created).id;

      const missing = await http('post', '/patients', A.tokens.professional, {
        name: 'Sem nascimento',
      });

      expect(missing.status).toBe(422);
      expect(
        (
          missing.body as { error: { fields: Array<{ field: string }> } }
        ).error.fields.map((field) => field.field),
      ).toEqual(expect.arrayContaining(['birthDate', 'responsibleUserId']));

      const repeated = await http('post', '/patients', A.tokens.admin, {
        name: 'Outra Maria',
        birthDate: '1950-01-01',
        responsibleUserId: A.users.professional,
        cpf,
      });

      expect(codeOf(repeated)).toBe('PATIENT_DUPLICATE_CPF');

      const inB = await http('post', '/patients', tenants.B.tokens.admin, {
        name: 'Paciente de B',
        birthDate: '1950-01-01',
        responsibleUserId: tenants.B.users.professional,
        cpf,
      });

      expect(inB.status).toBe(201);
      s.patientBId = dataOf<{ id: string }>(inB).id;
    });

    it('vincula cuidador e familiar; o cuidador sem vinculo nao ve o paciente', async () => {
      const A = tenants.A;

      for (const [role, linkType] of [
        ['caregiver', 'Cuidador contratado'],
        ['family', 'Filha'],
      ] as const) {
        const linked = await http(
          'post',
          '/patient-links',
          A.tokens.professional,
          { patientId: s.patientId, userId: A.users[role], linkType },
        );

        expect(linked.status).toBe(201);

        if (role === 'family')
          s.familyLinkId = dataOf<{ id: string }>(linked).id;
      }

      expect(
        (await http('get', `/patients/${s.patientId}`, A.tokens.caregiver))
          .status,
      ).toBe(200);
      expect(
        (await http('get', `/patients/${s.patientId}`, A.tokens.caregiver2))
          .status,
      ).toBe(404);
      expect(totalOf(await http('get', '/patients', A.tokens.caregiver2))).toBe(
        0,
      );

      const beyond = await http('get', '/patients?page=9', A.tokens.caregiver);

      expect(beyond.status).toBe(200);
      expect(dataOf<unknown[]>(beyond)).toEqual([]);
      expect(totalOf(beyond)).toBe(1);
      expect(
        (await http('get', '/patients?limit=101&sort=name', A.tokens.caregiver))
          .status,
      ).toBe(422);
    });
  });

  describe('UC09/UC08 — formularios, regras e medicamentos', () => {
    it('cria e publica o formulario; formulario sem campos e recusado', async () => {
      const A = tenants.A;

      expect(
        codeOf(
          await http('post', '/forms', A.tokens.professional, {
            name: 'Vazio',
            audience: 'organization',
            fields: [],
          }),
        ),
      ).toBe('FORM_EMPTY');

      const created = await http('post', '/forms', A.tokens.professional, {
        name: 'Visita domiciliar',
        audience: 'organization',
        fields: [
          {
            name: 'Glicemia capilar',
            fieldType: 'number',
            requirement: 'optional',
            section: 'Sinais vitais',
            unit: 'mg/dL',
            decimalPlaces: 0,
          },
          {
            name: 'Dor',
            fieldType: 'scale',
            requirement: 'optional',
            section: 'Bem-estar',
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: 'Banho assistido',
            fieldType: 'boolean',
            requirement: 'optional',
            section: 'Atividades',
          },
        ],
      });

      expect(created.status).toBe(201);

      const published = await http(
        'post',
        `/forms/${dataOf<{ id: string }>(created).id}/publish`,
        A.tokens.professional,
        { confirmImpact: false },
      );

      expect(published.status).toBe(200);

      const form = dataOf<{ id: string; currentVersion: FormVersion }>(
        published,
      );

      s.form = { id: form.id, version: form.currentVersion };

      const routine = await http('post', '/forms', A.tokens.professional, {
        name: 'Rotina diaria',
        audience: 'patients',
        patientIds: [s.patientId],
        frequency: { interval: 1, unit: 'days' },
        fields: [
          {
            name: 'Hidratacao',
            fieldType: 'boolean',
            requirement: 'optional',
          },
        ],
      });

      s.routineFormId = dataOf<{ id: string }>(routine).id;

      expect(
        (
          await http(
            'post',
            `/forms/${s.routineFormId}/publish`,
            A.tokens.professional,
            { confirmImpact: false },
          )
        ).status,
      ).toBe(200);
      expect(
        (await http('get', `/forms/${s.form.id}`, tenants.B.tokens.admin))
          .status,
      ).toBe(404);
    });

    it('configura a regra de alerta; cuidador e familiar nao configuram', async () => {
      const A = tenants.A;
      const rule = {
        formId: s.form.id,
        fieldKey: s.form.version.fields[0].fieldKey,
        name: 'Glicemia acima de 180',
        operator: 'gt',
        referenceValue: 180,
        severity: 'critical',
      };
      const created = await http(
        'post',
        '/alert-rules',
        A.tokens.professional,
        rule,
      );

      expect(created.status).toBe(201);
      s.ruleId = dataOf<{ id: string }>(created).id;

      for (const role of ['caregiver', 'family'] as const) {
        expect(
          (await http('post', '/alert-rules', A.tokens[role], rule)).status,
        ).toBe(403);
      }
    });

    it('cadastra medicamentos com agenda e avisa a sobreposicao sem bloquear', async () => {
      const A = tenants.A;
      const medication = (name: string) =>
        http('post', '/medications', A.tokens.professional, {
          patientId: s.patientId,
          name,
          doseAmount: 0.5,
          doseUnit: 'tablet',
          times: ['08:00', '20:00'],
          remindersEnabled: true,
        });
      const first = await medication('Losartana');

      expect(first.status).toBe(201);
      s.medicationId = dataOf<{ id: string }>(first).id;

      const second = await medication('Metformina');

      expect(second.status).toBe(201);
      expect(
        dataOf<{ scheduleConflicts: Array<{ time: string }> }>(
          second,
        ).scheduleConflicts.map((conflict) => conflict.time),
      ).toEqual(['08:00', '20:00']);
      expect(
        (
          await http('post', '/medications', A.tokens.family, {
            patientId: s.patientId,
            name: 'Familiar nao escreve',
            doseAmount: 1,
            doseUnit: 'mg',
            times: ['09:00'],
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('UC11/UC13 — registro, anexo, alerta e notificacao', () => {
    it('o cuidador vinculado registra 0, falso e valor fora da faixa; vazio e recusado', async () => {
      const A = tenants.A;
      const [glicemia, dor, banho] = s.form.version.fields;
      const body = {
        patientId: s.patientId,
        formId: s.form.id,
        formVersionId: s.form.version.id,
        answers: [
          { fieldId: glicemia.id, value: 250 },
          { fieldId: dor.id, value: 0 },
          { fieldId: banho.id, value: false },
        ],
      };

      expect(
        codeOf(
          await http('post', '/follow-ups', A.tokens.caregiver, {
            ...body,
            answers: [],
          }),
        ),
      ).toBe('FOLLOW_UP_EMPTY');
      expect(
        (await http('post', '/follow-ups', A.tokens.caregiver2, body)).status,
      ).toBe(404);
      expect(
        (await http('post', '/follow-ups', A.tokens.professional, body)).status,
      ).toBe(403);

      const created = await http(
        'post',
        '/follow-ups',
        A.tokens.caregiver,
        body,
      );

      expect(created.status).toBe(201);

      const record = dataOf<{
        id: string;
        author: { id: string };
        answers: Array<{ value: unknown }>;
      }>(created);

      s.followUpId = record.id;
      expect(record.author.id).toBe(A.users.caregiver);
      expect(record.answers.map((answer) => answer.value)).toEqual([
        250,
        0,
        false,
      ]);
    });

    it('anexa uma imagem ao registro e baixa os mesmos bytes; outra organizacao nao baixa', async () => {
      const A = tenants.A;
      const uploaded = await request(t.server())
        .post(`/api/v1/follow-ups/${s.followUpId}/attachments`)
        .set('Authorization', `Bearer ${A.tokens.caregiver}`)
        .attach('file', PNG, 'curativo.png');

      expect(uploaded.status).toBe(201);
      s.attachmentId = dataOf<{ id: string }>(uploaded).id;

      const contentPath = `/follow-ups/${s.followUpId}/attachments/${s.attachmentId}/content`;
      const downloaded = await http('get', contentPath, A.tokens.family)
        .set('Origin', CORS_ORIGIN)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        });

      expect(downloaded.status).toBe(200);
      expect(downloaded.headers['content-type']).toBe('image/png');
      expect(downloaded.headers['content-disposition']).toContain('attachment');
      expect(downloaded.headers['access-control-expose-headers']).toBe(
        'Content-Disposition',
      );
      expect(Buffer.compare(downloaded.body as Buffer, PNG)).toBe(0);
      expect(
        (await http('get', contentPath, tenants.B.tokens.admin)).status,
      ).toBe(404);

      const [{ count }] = await t.dataSource.query<Array<{ count: string }>>(
        'SELECT count(*)::text AS count FROM follow_up_attachments WHERE record_id = $1',
        [s.followUpId],
      );

      expect(count).toBe('1');
    });

    it('o valor acima da regra gera um alerta critico, entregue na caixa dos vinculados', async () => {
      const A = tenants.A;
      const alerts = await eventually(
        async () =>
          dataOf<Array<{ id: string; severity: string; source: string }>>(
            await http(
              'get',
              `/alerts?patientId=${s.patientId}`,
              A.tokens.professional,
            ),
          ),
        (list) => list.length > 0,
      );

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        severity: 'critical',
        source: 'reading',
      });
      s.alertId = alerts[0].id;

      for (const role of ['professional', 'caregiver', 'family'] as const) {
        const unread = dataOf<{ unread: number }>(
          await http('get', '/notifications/unread-count', A.tokens[role]),
        );

        expect(unread.unread).toBe(1);
      }

      expect(
        dataOf<{ unread: number }>(
          await http('get', '/notifications/unread-count', A.tokens.caregiver2),
        ).unread,
      ).toBe(0);

      const inbox = dataOf<Array<{ id: string }>>(
        await http('get', '/notifications', A.tokens.family),
      );

      expect(
        (
          await http(
            'post',
            `/notifications/${inbox[0].id}/read`,
            A.tokens.family,
          )
        ).status,
      ).toBe(200);
      expect(
        dataOf<{ unread: number }>(
          await http('get', '/notifications/unread-count', A.tokens.family),
        ).unread,
      ).toBe(0);
    });

    it('o worker de entrega processa os e-mails pendentes (SMTP desligado: skipped, sem afirmar envio)', async () => {
      const queue = t.app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));

      await queue.add(
        NOTIFICATION_DELIVERY_SWEEP,
        {},
        { removeOnComplete: true },
      );

      const deliveries = await eventually(
        () =>
          t.dataSource.query<Array<{ status: string; code: string | null }>>(
            `SELECT status, last_error_code AS code FROM notification_deliveries
              WHERE organization_id = $1 AND channel = 'email'`,
            [tenants.A.id],
          ),
        (rows) =>
          rows.length > 0 && rows.every((row) => row.status !== 'pending'),
      );

      expect(deliveries.length).toBeGreaterThan(0);
      expect(
        deliveries.every(
          (row) => row.status === 'skipped' && row.code === 'CHANNEL_DISABLED',
        ),
      ).toBe(true);
    });

    it('a ausencia de registro no prazo vira alerta pela fila de automacao, sem duplicar', async () => {
      const queue = t.app.get<Queue>(getQueueToken(AUTOMATION_QUEUE));
      const monitor = () =>
        t.dataSource.query<Array<{ id: string }>>(
          `SELECT id FROM follow_up_absence_monitors
            WHERE patient_id = $1 AND form_id = $2 AND deleted_at IS NULL`,
          [s.patientId, s.routineFormId],
        );

      await queue.add(ABSENCE_SWEEP, {}, { removeOnComplete: true });
      expect(
        await eventually(monitor, (rows) => rows.length === 1),
      ).toHaveLength(1);

      // Simula 25 h sem envio de um formulario diario.
      await t.dataSource.query(
        `UPDATE follow_up_absence_monitors
            SET started_at = now() - interval '25 hours',
                checked_through = now() - interval '25 hours',
                next_due_at = NULL
          WHERE patient_id = $1 AND form_id = $2 AND deleted_at IS NULL`,
        [s.patientId, s.routineFormId],
      );

      const absences = () =>
        t.dataSource.query<Array<{ severity: string }>>(
          `SELECT severity FROM alerts
            WHERE patient_id = $1 AND source = 'absence'`,
          [s.patientId],
        );

      await queue.add(ABSENCE_SWEEP, {}, { removeOnComplete: true });
      expect(await eventually(absences, (rows) => rows.length > 0)).toEqual([
        { severity: 'warning' },
      ]);

      await queue.add(ABSENCE_SWEEP, {}, { removeOnComplete: true });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect(await absences()).toHaveLength(1);
    });

    it('o familiar nao resolve; o cuidador vinculado resolve para todos', async () => {
      const A = tenants.A;

      expect(
        (await http('post', `/alerts/${s.alertId}/resolve`, A.tokens.family))
          .status,
      ).toBe(403);
      expect(
        (await http('post', `/alerts/${s.alertId}/resolve`, A.tokens.caregiver))
          .status,
      ).toBe(200);
      expect(
        dataOf<{ status: string }>(
          await http('get', `/alerts/${s.alertId}`, A.tokens.professional),
        ).status,
      ).toBe('resolved');
      expect(
        (await http('get', `/alerts/${s.alertId}`, tenants.B.tokens.admin))
          .status,
      ).toBe(404);
    });
  });

  describe('UC12/UC14 — historico e visao do familiar', () => {
    it('filtra o historico por periodo e parametro; periodo sem registro e lista vazia', async () => {
      const A = tenants.A;
      const today = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      });
      const fieldKey = s.form.version.fields[0].fieldKey;
      const found = await http(
        'get',
        `/follow-ups?patientId=${s.patientId}&from=${today}&to=${today}&fieldKey=${fieldKey}`,
        A.tokens.professional,
      );

      expect(found.status).toBe(200);
      expect(totalOf(found)).toBe(1);

      const empty = await http(
        'get',
        `/follow-ups?patientId=${s.patientId}&from=2020-01-01&to=2020-01-31`,
        A.tokens.professional,
      );

      expect(empty.status).toBe(200);
      expect(totalOf(empty)).toBe(0);

      const overview = dataOf<{
        counts: { validFollowUps: number };
      }>(
        await http(
          'get',
          `/patients/${s.patientId}/overview`,
          A.tokens.professional,
        ),
      );

      expect(overview.counts.validFollowUps).toBe(1);
    });

    it('o familiar ve o recorte da Figura 37, o parentesco e nao escreve', async () => {
      const A = tenants.A;
      const patient = dataOf<{
        cpf: string;
        phone: string;
        healthPlan: string;
        viewerLink: { role: string; linkType: string };
      }>(await http('get', `/patients/${s.patientId}`, A.tokens.family));

      expect(patient).toMatchObject({
        cpf: HIDDEN,
        phone: HIDDEN,
        healthPlan: HIDDEN,
        viewerLink: { role: 'family', linkType: 'Filha' },
      });
      expect(
        dataOf<{ cpf: string }>(
          await http('get', `/patients/${s.patientId}`, A.tokens.caregiver),
        ).cpf,
      ).not.toBe(HIDDEN);

      for (const [method, path, body] of [
        ['patch', `/patients/${s.patientId}`, { name: 'Mudado' }],
        ['post', `/follow-ups/${s.followUpId}/annul`, { reason: 'Familiar' }],
        ['post', `/medications/${s.medicationId}/deactivate`, undefined],
      ] as const) {
        expect((await http(method, path, A.tokens.family, body)).status).toBe(
          403,
        );
      }
    });
  });

  describe('UC10 — evolucao, relatorio e PDF', () => {
    it('calcula a serie do periodo; o cuidador nao ve a evolucao', async () => {
      const A = tenants.A;
      const evolution = await http(
        'get',
        `/patients/${s.patientId}/evolution`,
        A.tokens.family,
      );

      expect(evolution.status).toBe(200);

      const glicemia = dataOf<{
        series: Array<{
          name: string;
          indicators: {
            mean: number | null;
            unavailable: Array<{ indicator: string }>;
          };
        }>;
      }>(evolution).series.find((series) => series.name === 'Glicemia capilar');

      expect(glicemia?.indicators.mean).toBe(250);
      expect(
        glicemia?.indicators.unavailable.map((item) => item.indicator),
      ).toEqual(['variation', 'trend']);
      expect(
        (
          await http(
            'get',
            `/patients/${s.patientId}/evolution`,
            A.tokens.caregiver,
          )
        ).status,
      ).toBe(403);
    });

    it('gera o relatorio em JSON e o PDF na hora, auditando so a exportacao', async () => {
      const A = tenants.A;

      expect(
        (
          await http(
            'get',
            `/patients/${s.patientId}/report`,
            A.tokens.professional,
          )
        ).status,
      ).toBe(200);

      const pdf = await http(
        'get',
        `/patients/${s.patientId}/report/pdf`,
        A.tokens.professional,
      )
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        });

      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toMatch(
        /^attachment; filename="relatorio-paciente-/,
      );
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      for (const role of ['caregiver', 'family'] as const) {
        expect(
          (
            await http(
              'get',
              `/patients/${s.patientId}/report/pdf`,
              A.tokens[role],
            )
          ).status,
        ).toBe(403);
      }

      const [{ count }] = await t.dataSource.query<Array<{ count: string }>>(
        `SELECT count(*)::text AS count FROM audit_events
          WHERE organization_id = $1 AND action = 'patient_report.exported'`,
        [A.id],
      );

      expect(count).toBe('1');
    });
  });

  describe('UC05 — painel operacional', () => {
    it('o administrador Enterprise ve os numeros da propria organizacao; Basic e outros perfis nao', async () => {
      const dashboard = dataOf<{
        patients: { active: number };
        followUps: { inPeriod: number };
        alerts: { issuedInPeriod: number; pending: number };
      }>(await http('get', '/dashboard', tenants.A.tokens.admin));

      // Alerta por valor (resolvido) e de ausencia (pendente).
      expect(dashboard).toMatchObject({
        patients: { active: 1 },
        followUps: { inPeriod: 1 },
        alerts: { issuedInPeriod: 2, pending: 1 },
      });
      expect(
        codeOf(await http('get', '/dashboard', tenants.B.tokens.admin)),
      ).toBe('DASHBOARD_PLAN_FEATURE_UNAVAILABLE');
      expect(
        (await http('get', '/dashboard', tenants.A.tokens.professional)).status,
      ).toBe(403);
    });
  });

  describe('Relatorios gerenciais — Quadro 2 e Figura 43 (BE-30)', () => {
    it('o administrador Enterprise gera alertas e cuidadores em JSON e PDF; recentes vem da auditoria; Basic e outros perfis nao', async () => {
      const A = tenants.A;
      const alerts = dataOf<{
        totals: { issued: number; open: number; resolved: number };
      }>(await http('get', '/management-reports/alerts', A.tokens.admin));
      const caregivers = dataOf<{
        summary: { caregivers: number; validFollowUps: number };
      }>(await http('get', '/management-reports/caregivers', A.tokens.admin));

      // Os mesmos numeros do painel: um registro valido e dois alertas.
      expect(alerts.totals).toMatchObject({ issued: 2, open: 1, resolved: 1 });
      expect(caregivers.summary).toMatchObject({
        caregivers: 1,
        validFollowUps: 1,
      });

      for (const kind of ['alerts', 'caregivers']) {
        const pdf = await http(
          'get',
          `/management-reports/${kind}/pdf`,
          A.tokens.admin,
        )
          .buffer(true)
          .parse((response, done) => {
            const chunks: Buffer[] = [];

            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => done(null, Buffer.concat(chunks)));
          });

        expect(pdf.status).toBe(200);
        expect(pdf.headers['content-type']).toBe('application/pdf');
        expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      }

      const recent = dataOf<Array<{ type: string }>>(
        await http('get', '/management-reports/recent', A.tokens.admin),
      );

      expect(recent.map((item) => item.type)).toEqual([
        'caregiver_activity',
        'alerts',
        'patient_follow_up',
      ]);
      expect(
        codeOf(
          await http(
            'get',
            '/management-reports/alerts',
            tenants.B.tokens.admin,
          ),
        ),
      ).toBe('MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE');

      for (const role of ['professional', 'caregiver', 'family'] as const) {
        expect(
          (await http('get', '/management-reports/alerts', A.tokens[role]))
            .status,
        ).toBe(403);
      }
    });
  });

  describe('UC06 — auditoria', () => {
    it('o administrador consulta e exporta so a propria trilha', async () => {
      const A = tenants.A;
      const list = await http('get', '/audit-events?limit=100', A.tokens.admin);

      expect(list.status).toBe(200);

      const events =
        dataOf<Array<{ organization: { id: string }; action: string }>>(list);

      expect(new Set(events.map((event) => event.organization.id))).toEqual(
        new Set([A.id]),
      );
      expect(events.map((event) => event.action)).toEqual(
        expect.arrayContaining([
          'patient.created',
          'follow_up_attachment.created',
          'alert.resolved',
          'patient_report.exported',
        ]),
      );

      const csv = await http('get', '/audit-events/export', A.tokens.admin);

      expect(csv.status).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.startsWith('﻿')).toBe(true);
      expect(
        (await http('get', '/audit-events', A.tokens.professional)).status,
      ).toBe(403);
    });

    it('o master ve as duas organizacoes, com nomes de pessoas de outra organizacao mascarados', async () => {
      const events = dataOf<
        Array<{
          organization: { id: string };
          actor: { user: { name: string } | null };
        }>
      >(await http('get', '/audit-events?limit=100', masterToken));
      const organizations = new Set(
        events.map((event) => event.organization.id),
      );

      expect(organizations.has(tenants.A.id)).toBe(true);
      expect(organizations.has(tenants.B.id)).toBe(true);

      const fromA = events.find(
        (event) =>
          event.organization.id === tenants.A.id && event.actor.user !== null,
      );

      expect(fromA?.actor.user?.name).toMatch(/\*/);
    });
  });

  describe('revogacao e isolamento', () => {
    it('vinculo revogado tira o acesso do familiar na requisicao seguinte', async () => {
      const A = tenants.A;

      expect(
        (
          await http(
            'post',
            `/patient-links/${s.familyLinkId}/revoke`,
            A.tokens.professional,
          )
        ).status,
      ).toBe(200);

      for (const path of [
        `/patients/${s.patientId}`,
        `/follow-ups/${s.followUpId}`,
        `/alerts/${s.alertId}`,
        `/follow-ups/${s.followUpId}/attachments/${s.attachmentId}/content`,
      ]) {
        expect((await http('get', path, A.tokens.family)).status).toBe(404);
      }
    });

    it('nenhum identificador de A e alcancavel com as sessoes de B', async () => {
      const B = tenants.B;

      for (const path of [
        `/patients/${s.patientId}`,
        `/patients/${s.patientId}/overview`,
        `/patients/${s.patientId}/evolution`,
        `/patients/${s.patientId}/report`,
        `/follow-ups/${s.followUpId}`,
        `/follow-ups?patientId=${s.patientId}`,
        `/follow-ups/${s.followUpId}/attachments`,
        `/medications/${s.medicationId}`,
        `/alert-rules/${s.ruleId}`,
        `/alerts/${s.alertId}`,
        `/patient-links/${s.familyLinkId}`,
      ]) {
        for (const role of ['admin', 'professional'] as const) {
          const response = await http('get', path, B.tokens[role]);

          expect([path, role, response.status]).toEqual([path, role, 404]);
          expect(JSON.stringify(response.body)).not.toContain(
            'Maria Homologacao',
          );
        }
      }

      expect(
        (
          await http(
            'get',
            `/users/${tenants.A.users.caregiver}`,
            B.tokens.admin,
          )
        ).status,
      ).toBe(404);
      expect(
        (await http('get', `/patients/${s.patientBId}`, tenants.A.tokens.admin))
          .status,
      ).toBe(404);
    });

    it('usuario inativado e organizacao inativada perdem a sessao na chamada seguinte', async () => {
      const A = tenants.A;

      expect(
        (
          await http(
            'post',
            `/users/${A.users.caregiver2}/deactivate`,
            A.tokens.admin,
          )
        ).status,
      ).toBe(200);
      expect((await http('get', '/patients', A.tokens.caregiver2)).status).toBe(
        401,
      );
      expect(
        (
          await http(
            'post',
            `/organizations/${tenants.B.id}/deactivate`,
            masterToken,
          )
        ).status,
      ).toBe(200);
      expect(
        (await http('get', '/organizations/me', tenants.B.tokens.admin)).status,
      ).toBe(401);
      expect(
        (await login(tenants.B.code, 'admin@homologacao-b.test', PASSWORD))
          .status,
      ).toBe(401);
      expect((await http('get', '/patients', A.tokens.admin)).status).toBe(200);
    });
  });

  describe('UC03 — convite por e-mail com link de aceite (BE-31)', () => {
    afterAll(() => {
      mail.enabled = false;
    });

    it('SMTP desligado: o convite e a senha provisoria, com o canal na resposta', async () => {
      const response = await http('post', '/users', tenants.A.tokens.admin, {
        name: 'Convite Senha',
        email: 'convite-senha@homologacao-a.test',
        cpf: nextCpf(),
        profileCode: 'caregiver',
      });

      expect(response.status).toBe(201);
      expect(dataOf<{ channel: string }>(response).channel).toBe(
        'temporary_password',
      );
      expect(
        dataOf<{ temporaryPassword: string }>(response).temporaryPassword,
      ).toHaveLength(20);
      expect(
        codeOf(
          await http('post', '/users', tenants.A.tokens.admin, {
            name: 'Convite Email',
            email: 'convite-recusado@homologacao-a.test',
            cpf: nextCpf(),
            profileCode: 'caregiver',
            channel: 'email',
          }),
        ),
      ).toBe('USER_INVITATION_EMAIL_UNAVAILABLE');
    });

    it('SMTP ligado: o link chega por e-mail, o convidado cadastra a senha e entra pelo login', async () => {
      mail.enabled = true;

      const email = 'convite-link@homologacao-a.test';
      const created = await http('post', '/users', tenants.A.tokens.admin, {
        name: 'Convite Link',
        email,
        cpf: nextCpf(),
        profileCode: 'professional',
      });

      expect(created.status).toBe(201);
      expect(dataOf<object>(created)).toMatchObject({
        channel: 'email',
        delivery: { status: 'sent' },
      });
      expect(dataOf<object>(created)).not.toHaveProperty('temporaryPassword');

      const token = mail.tokenFor(email);

      expect((await login(tenants.A.code, email, PASSWORD)).status).toBe(401);

      const preview = await http('post', '/auth/invitations/inspect', null, {
        token,
      });

      expect(preview.status).toBe(200);
      expect(dataOf<object>(preview)).toMatchObject({
        user: { email },
        organization: { code: tenants.A.code },
        profile: { code: 'professional' },
      });

      const accepted = await http('post', '/auth/invitations/accept', null, {
        token,
        newPassword: PASSWORD,
      });

      expect(accepted.status).toBe(200);
      expect(dataOf<object>(accepted)).toEqual({
        organizationCode: tenants.A.code,
        email,
      });

      const session = await login(tenants.A.code, email, PASSWORD);

      expect(dataOf<{ state: string }>(session).state).toBe('authenticated');
      expect(
        (
          await http('post', '/auth/invitations/accept', null, {
            token,
            newPassword: PASSWORD,
          })
        ).status,
      ).toBe(422);
    });
  });

  describe('contrato com o navegador', () => {
    it('o preflight da origem configurada libera Authorization; outra origem nao recebe CORS', async () => {
      const preflight = await request(t.server())
        .options('/api/v1/patients')
        .set('Origin', CORS_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

      expect(preflight.status).toBe(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(
        CORS_ORIGIN,
      );
      expect(
        preflight.headers['access-control-allow-headers'].toLowerCase(),
      ).toContain('authorization');

      const foreign = await request(t.server())
        .options('/api/v1/patients')
        .set('Origin', 'https://outra.example.test')
        .set('Access-Control-Request-Method', 'GET');

      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

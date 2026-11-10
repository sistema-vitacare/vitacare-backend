#!/usr/bin/env node
// Smoke test da API por HTTP (BE-25). Prova a IMAGEM implantada; os fluxos
// alternativos de cada UC seguem em tests/app/homologation.e2e-spec.ts.
//
//   read    (padrao) so leitura, seguro em producao
//   full    jornada completa com escrita; so homologacao (exige --allow-writes)
//   verify  depois de restauracao/rollback: os dados do `full` continuam la
//
// node scripts/ops/smoke.mjs --base-url http://127.0.0.1:1050 [--mode read]
//   [--expect-version <sha>] [--wait <segundos>] [--allow-writes]
//   [--state-file smoke-state.json]
//
// Ambiente do full/verify: SMOKE_PLATFORM_CODE, SMOKE_MASTER_EMAIL,
// SMOKE_MASTER_PASSWORD (a provisoria do seed) e SMOKE_ADMIN_PASSWORD (a
// definitiva de todas as contas criadas). O estado nunca guarda senha.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  CheckFailed,
  createClient,
  createReport,
  dataOf,
  eventually,
  expect,
  expectStatus,
  signIn,
  sleep,
  syntheticCpf,
} from './lib/client.mjs';

const { values: args } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    mode: { type: 'string', default: 'read' },
    'expect-version': { type: 'string' },
    wait: { type: 'string', default: '0' },
    'allow-writes': { type: 'boolean', default: false },
    'state-file': { type: 'string', default: 'smoke-state.json' },
  },
});

const HIDDEN = '********';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('imagem sintetica do smoke'),
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (!args['base-url'] || !['read', 'full', 'verify'].includes(args.mode)) {
  console.error('Uso: smoke.mjs --base-url <url> [--mode read|full|verify]');
  process.exit(2);
}
if (args.mode === 'full' && !args['allow-writes']) {
  console.error(
    'O modo full escreve dados: use --allow-writes, e nunca em producao.',
  );
  process.exit(2);
}

const api = createClient(args['base-url']);
const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.error(`Variavel obrigatoria ausente: ${name}`);
    process.exit(2);
  }
  return value;
};

const readChecks = async (report) => {
  await report.check('GET /health/live responde ok', async () => {
    const live = await api.request('GET', '/health/live');
    expectStatus(live, 200);
    expect(live.body?.status === 'ok', 'status diferente de ok');
  });

  await report.check(
    'GET /health/ready com PostgreSQL e Redis up',
    async () => {
      const ready = await api.request('GET', '/health/ready');
      expectStatus(ready, 200);
      expect(
        ready.body?.info?.postgres?.status === 'up',
        'postgres nao esta up',
      );
      expect(ready.body?.info?.redis?.status === 'up', 'redis nao esta up');
    },
  );

  await report.check('GET /api/v1 no envelope, com a versao', async () => {
    const identity = await api.request('GET', '/api/v1');
    expectStatus(identity, 200);
    expect(
      typeof identity.body?.meta?.requestId === 'string',
      'sem meta.requestId',
    );
    const version = dataOf(identity)?.version;
    if (args['expect-version']) {
      expect(
        version === args['expect-version'],
        `versao no ar ${version}, esperada ${args['expect-version']}`,
      );
    }
  });

  await report.check('cabecalhos de seguranca do Helmet', async () => {
    const identity = await api.request('GET', '/api/v1');
    expect(
      identity.headers.get('x-content-type-options') === 'nosniff',
      'sem X-Content-Type-Options',
    );
    expect(
      identity.headers.has('content-security-policy'),
      'sem Content-Security-Policy',
    );
    expect(!identity.headers.has('x-powered-by'), 'X-Powered-By exposto');
  });

  await report.check(
    'GET /api/docs-json publica o OpenAPI (ou desligado)',
    async () => {
      const docs = await api.request('GET', '/api/docs-json');
      if (docs.status === 404) return;
      expectStatus(docs, 200);
      expect(
        Object.keys(docs.body?.paths ?? {}).length > 0,
        'OpenAPI sem rotas',
      );
    },
  );

  await report.check(
    'rota protegida sem token: 401 no envelope de erro',
    async () => {
      const denied = await api.request('GET', '/api/v1/patients');
      expectStatus(denied, 401);
      expect(typeof denied.body?.error?.code === 'string', 'sem error.code');
      expect(
        typeof denied.body?.meta?.requestId === 'string',
        'sem meta.requestId',
      );
    },
  );

  await report.check('rota inexistente: 404 no envelope de erro', async () => {
    const missing = await api.request(
      'GET',
      '/api/v1/rota-inexistente-do-smoke',
    );
    expectStatus(missing, 404);
    expect(typeof missing.body?.error?.code === 'string', 'sem error.code');
  });
};

const fullJourney = async (report) => {
  const platformCode = env('SMOKE_PLATFORM_CODE');
  const masterEmail = env('SMOKE_MASTER_EMAIL');
  const masterPassword = env('SMOKE_MASTER_PASSWORD');
  const password = env('SMOKE_ADMIN_PASSWORD', 'senha definitiva do smoke');
  const run = Date.now().toString(36);
  const cpfSeed = Number.parseInt(run.slice(-6), 36) % 900_000_000;
  let cpfCount = 0;
  const cpf = () =>
    syntheticCpf(100_000_000 + ((cpfSeed + ++cpfCount * 7919) % 800_000_000));
  const state = {};
  const post = (path, token, json) =>
    api.request('POST', `/api/v1${path}`, { token, json });
  const get = (path, token) => api.request('GET', `/api/v1${path}`, { token });

  const master = await report.check(
    'UC01 master entra (troca a senha provisoria do seed)',
    () =>
      signIn(
        api,
        platformCode,
        masterEmail,
        [masterPassword, password],
        password,
      ),
  );

  const plans = await report.check(
    'catalogo de planos Basic e Enterprise',
    async () => {
      const catalog = await get('/plans', master);
      expectStatus(catalog, 200);
      const byCode = Object.fromEntries(
        dataOf(catalog).map((plan) => [plan.code, plan.id]),
      );
      expect(
        byCode.basic && byCode.enterprise,
        'catalogo sem basic/enterprise',
      );
      return byCode;
    },
  );

  const tenants = {};
  for (const [key, plan] of [
    ['A', 'enterprise'],
    ['B', 'basic'],
  ]) {
    tenants[key] = await report.check(
      `UC03 organizacao ${key} (${plan}) com primeiro administrador`,
      async () => {
        const code = `smoke-${key.toLowerCase()}-${run}`;
        const email = `admin@${code}.example.test`;
        const created = await post('/organizations', master, {
          code,
          tradeName: `Smoke ${key}`,
          usagePlanId: plans[plan],
          administrator: { name: `Admin Smoke ${key}`, email, cpf: cpf() },
        });
        expectStatus(created, 201);
        const admin = await signIn(
          api,
          code,
          email,
          [dataOf(created).temporaryPassword],
          password,
        );
        return { code, email, admin, users: {}, tokens: { admin } };
      },
    );
  }
  const A = tenants.A;
  state.organizationCode = A.code;
  state.adminEmail = A.email;

  for (const role of ['professional', 'caregiver', 'family']) {
    await report.check(`UC03 convite e primeiro acesso: ${role}`, async () => {
      const email = `${role}@${A.code}.example.test`;
      const invited = await post('/users', A.admin, {
        name: `${role} smoke`,
        email,
        cpf: cpf(),
        profileCode: role,
      });
      expectStatus(invited, 201);
      A.users[role] = dataOf(invited).user.id;
      A.tokens[role] = await signIn(
        api,
        A.code,
        email,
        [dataOf(invited).temporaryPassword],
        password,
      );
    });
  }

  await report.check('UC07 paciente com profissional responsavel', async () => {
    const created = await post('/patients', A.tokens.professional, {
      name: 'Paciente Smoke',
      birthDate: '1948-03-12',
      responsibleUserId: A.users.professional,
      cpf: cpf(),
      phone: '(11) 98765-4321',
      healthPlan: 'Plano Exemplo',
    });
    expectStatus(created, 201);
    state.patientId = dataOf(created).id;
  });

  for (const [role, linkType] of [
    ['caregiver', 'Cuidador contratado'],
    ['family', 'Filha'],
  ]) {
    await report.check(`UC03 vinculo de ${role}`, async () => {
      const linked = await post('/patient-links', A.tokens.professional, {
        patientId: state.patientId,
        userId: A.users[role],
        linkType,
      });
      expectStatus(linked, 201);
    });
  }

  const form = await report.check('UC09 formulario publicado', async () => {
    const created = await post('/forms', A.tokens.professional, {
      name: 'Visita do smoke',
      audience: 'organization',
      fields: [
        {
          name: 'Glicemia capilar',
          fieldType: 'number',
          requirement: 'optional',
          unit: 'mg/dL',
          decimalPlaces: 0,
        },
      ],
    });
    expectStatus(created, 201);
    const published = await post(
      `/forms/${dataOf(created).id}/publish`,
      A.tokens.professional,
      { confirmImpact: false },
    );
    expectStatus(published, 200);
    return {
      id: dataOf(published).id,
      version: dataOf(published).currentVersion,
    };
  });

  await report.check('UC13 regra de alerta gt 180 critical', async () => {
    const rule = await post('/alert-rules', A.tokens.professional, {
      formId: form.id,
      fieldKey: form.version.fields[0].fieldKey,
      name: 'Glicemia acima de 180',
      operator: 'gt',
      referenceValue: 180,
      severity: 'critical',
    });
    expectStatus(rule, 201);
  });

  await report.check('UC11 registro do cuidador vinculado', async () => {
    const created = await post('/follow-ups', A.tokens.caregiver, {
      patientId: state.patientId,
      formId: form.id,
      formVersionId: form.version.id,
      answers: [{ fieldId: form.version.fields[0].id, value: 250 }],
    });
    expectStatus(created, 201);
    state.followUpId = dataOf(created).id;
  });

  await report.check(
    'UC13 alerta critico gerado e notificado ao profissional',
    async () => {
      const alerts = await eventually(
        async () =>
          dataOf(
            await get(
              `/alerts?patientId=${state.patientId}`,
              A.tokens.professional,
            ),
          ) ?? [],
        (list) => list.length > 0,
      );
      expect(
        alerts.length === 1 && alerts[0].severity === 'critical',
        'alerta critico ausente',
      );
      state.alertId = alerts[0].id;
      const unread = dataOf(
        await get('/notifications/unread-count', A.tokens.professional),
      );
      expect(unread?.unread >= 1, 'notificacao nao chegou a caixa');
    },
  );

  await report.check(
    'anexo enviado pelo autor e baixado pelo familiar com o mesmo SHA-256',
    async () => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([PNG], { type: 'image/png' }),
        'curativo.png',
      );
      const uploaded = await api.request(
        'POST',
        `/api/v1/follow-ups/${state.followUpId}/attachments`,
        {
          token: A.tokens.caregiver,
          form: formData,
        },
      );
      expectStatus(uploaded, 201);
      state.attachmentId = dataOf(uploaded).id;
      const content = await get(
        `/follow-ups/${state.followUpId}/attachments/${state.attachmentId}/content`,
        A.tokens.family,
      );
      expectStatus(content, 200);
      state.attachmentSha256 = sha256(content.bytes);
      expect(
        state.attachmentSha256 === sha256(PNG),
        'bytes baixados diferentes dos enviados',
      );
    },
  );

  await report.check(
    'UC14 familiar ve o cadastro no recorte da Figura 37',
    async () => {
      const patient = dataOf(
        await get(`/patients/${state.patientId}`, A.tokens.family),
      );
      expect(
        patient?.cpf === HIDDEN && patient?.phone === HIDDEN,
        'CPF/telefone visiveis ao familiar',
      );
    },
  );

  await report.check('UC10 relatorio PDF do paciente', async () => {
    const pdf = await get(
      `/patients/${state.patientId}/report/pdf`,
      A.tokens.professional,
    );
    expectStatus(pdf, 200);
    expect(
      pdf.bytes.subarray(0, 5).toString() === '%PDF-',
      'resposta nao e PDF',
    );
  });

  await report.check(
    'UC05 painel Enterprise; Basic recusado pelo plano',
    async () => {
      const dashboard = await get('/dashboard', A.admin);
      expectStatus(dashboard, 200);
      const basic = await get('/dashboard', tenants.B.admin);
      expect(
        basic.body?.error?.code === 'DASHBOARD_PLAN_FEATURE_UNAVAILABLE',
        'Basic acessou o painel',
      );
    },
  );

  await report.check('UC06 exportacao CSV da auditoria', async () => {
    const csv = await get('/audit-events/export', A.admin);
    expectStatus(csv, 200);
    expect(
      csv.bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
      'CSV sem BOM',
    );
  });

  await report.check(
    'isolamento: administrador de B nao ve paciente nem anexo de A',
    async () => {
      expectStatus(
        await get(`/patients/${state.patientId}`, tenants.B.admin),
        404,
        'paciente',
      );
      expectStatus(
        await get(
          `/follow-ups/${state.followUpId}/attachments/${state.attachmentId}/content`,
          tenants.B.admin,
        ),
        404,
        'anexo',
      );
    },
  );

  await report.check('UC01 logout revoga o token', async () => {
    const extra = await signIn(api, A.code, A.email, [password], password);
    expectStatus(await post('/auth/logout', extra), 200, 'logout');
    expectStatus(await get('/organizations/me', extra), 401, 'token revogado');
  });

  await writeFile(args['state-file'], `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`estado gravado em ${args['state-file']}`);
};

const verifyState = async (report) => {
  const password = env('SMOKE_ADMIN_PASSWORD', 'senha definitiva do smoke');
  const state = JSON.parse(await readFile(args['state-file'], 'utf8'));
  const get = (path, token) => api.request('GET', `/api/v1${path}`, { token });

  const admin = await report.check(
    'administrador da organizacao do smoke entra',
    () =>
      signIn(
        api,
        state.organizationCode,
        state.adminEmail,
        [password],
        password,
      ),
  );
  await report.check('paciente, registro e alerta preservados', async () => {
    expectStatus(
      await get(`/patients/${state.patientId}`, admin),
      200,
      'paciente',
    );
    expectStatus(
      await get(`/follow-ups/${state.followUpId}`, admin),
      200,
      'registro',
    );
    expectStatus(await get(`/alerts/${state.alertId}`, admin), 200, 'alerta');
  });
  await report.check('anexo preservado com o mesmo SHA-256', async () => {
    const content = await get(
      `/follow-ups/${state.followUpId}/attachments/${state.attachmentId}/content`,
      admin,
    );
    expectStatus(content, 200);
    expect(
      sha256(content.bytes) === state.attachmentSha256,
      'SHA-256 diferente do gravado',
    );
  });
};

const main = async () => {
  const waitSeconds = Number(args.wait);

  if (waitSeconds > 0) {
    const deadline = Date.now() + waitSeconds * 1000;
    for (;;) {
      const probe = createReport({ quiet: true });
      try {
        await readChecks(probe);
        break;
      } catch {
        if (Date.now() > deadline) break;
        console.log(
          `aguardando: ${probe.results.at(-1)?.reason ?? 'sem resposta'}`,
        );
        await sleep(10_000);
      }
    }
  }

  const report = createReport();
  let unexpected = false;
  try {
    if (args.mode !== 'verify') await readChecks(report);
    if (args.mode === 'full') await fullJourney(report);
    if (args.mode === 'verify') await verifyState(report);
  } catch (error) {
    if (!(error instanceof CheckFailed)) {
      unexpected = true;
      console.log(`FALHOU  erro inesperado: ${error.message}`);
    }
  }

  const passed = report.results.filter((result) => result.ok).length;
  console.log(
    `\n${passed}/${report.results.length} verificacoes ok (modo ${args.mode})${
      unexpected ? ', com erro inesperado' : ''
    }`,
  );
  process.exit(
    unexpected || report.failed > 0 || report.results.length === 0 ? 1 : 0,
  );
};

await main();

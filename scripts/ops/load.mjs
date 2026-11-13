#!/usr/bin/env node
// Medicao de desempenho do RNF008 (BE-25), contra uma API de HOMOLOGACAO.
// Metas decididas por Mateus em 2026-11-10, antes da medicao:
//   p95 <= 500 ms leitura, <= 1 s escrita, <= 5 s PDF/CSV, nenhuma resposta 5xx,
//   50 usuarios simultaneos sobre 1.000 pacientes (teto do Enterprise).
//
// node scripts/ops/load.mjs --base-url http://127.0.0.1:1050 --allow-writes
//   [--users 50] [--patients 1000] [--records-per-patient 5] [--duration 120]
//   [--think-ms 0] [--report load-report.json]
//
// --think-ms 0 (padrao, o cenario das metas) = cada sessao dispara a proxima
// requisicao assim que a anterior volta: mede a API saturada. Com pausa, a
// sessao espera em media esse tempo entre requisicoes, mais perto de uso real.
//
// Mesmas variaveis de master do smoke (SMOKE_*). Prepara pela API uma
// organizacao Enterprise propria e depois roda N sessoes em laco. Na API alvo,
// THROTTLE_LIMIT alto: aqui todos os usuarios saem do mesmo IP. 429 e contado
// a parte e nao entra nas latencias.
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  createClient,
  dataOf,
  expectStatus,
  signIn,
  sleep,
  syntheticCpf,
} from './lib/client.mjs';

const { values: args } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    'allow-writes': { type: 'boolean', default: false },
    users: { type: 'string', default: '50' },
    patients: { type: 'string', default: '1000' },
    'records-per-patient': { type: 'string', default: '5' },
    duration: { type: 'string', default: '120' },
    'think-ms': { type: 'string', default: '0' },
    report: { type: 'string' },
  },
});

const TARGETS = { read: 500, write: 1000, export: 5000 };
const WEIGHTS = { read: 0.8, write: 0.17, export: 0.03 };
const PREP_CONCURRENCY = 10;
// Convite + primeiro acesso custam 4 hashes argon2id cada; com 1 CPU a API faz
// ~3-4 por segundo, e 10 usuarios em paralelo estouram o timeout de 30 s.
const USER_PREP_CONCURRENCY = 3;
const LOGIN_BURST = 10;

if (!args['base-url'] || !args['allow-writes']) {
  console.error(
    'Uso: load.mjs --base-url <url> --allow-writes (escreve dados: so homologacao)',
  );
  process.exit(2);
}

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.error(`Variavel obrigatoria ausente: ${name}`);
    process.exit(2);
  }
  return value;
};

const api = createClient(args['base-url']);
const password = env('SMOKE_ADMIN_PASSWORD', 'senha definitiva do smoke');
const run = Date.now().toString(36);
let cpfCount = 0;
const cpf = () =>
  syntheticCpf(
    200_000_000 +
      ((Number.parseInt(run.slice(-5), 36) + ++cpfCount * 7919) % 700_000_000),
  );
const pick = (list, index) => list[index % list.length];
const random = (list) => list[Math.floor(Math.random() * list.length)];

/** Executa `task(i)` para i em [0, total) com no maximo `limit` em paralelo. */
const pool = async (total, limit, task) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, total) }, async () => {
      while (next < total) await task(next++);
    }),
  );
};

const prepare = async () => {
  const totalUsers = Number(args.users);
  const professionals = Math.max(1, Math.round((totalUsers - 1) * 0.18));
  const families = Math.max(1, Math.round((totalUsers - 1) * 0.2));
  const caregivers = Math.max(1, totalUsers - 1 - professionals - families);
  const started = performance.now();

  const master = await signIn(
    api,
    env('SMOKE_PLATFORM_CODE'),
    env('SMOKE_MASTER_EMAIL'),
    [env('SMOKE_MASTER_PASSWORD'), password],
    password,
  );
  const plans = Object.fromEntries(
    dataOf(await api.request('GET', '/api/v1/plans', { token: master })).map(
      (p) => [p.code, p.id],
    ),
  );
  const code = `carga-${run}`;
  const adminEmail = `admin@${code}.example.test`;
  const created = await api.request('POST', '/api/v1/organizations', {
    token: master,
    json: {
      code,
      tradeName: 'Carga',
      usagePlanId: plans.enterprise,
      administrator: { name: 'Admin Carga', email: adminEmail, cpf: cpf() },
    },
  });
  expectStatus(created, 201, 'organizacao');
  const admin = await signIn(
    api,
    code,
    adminEmail,
    [dataOf(created).temporaryPassword],
    password,
  );
  const sessions = [{ role: 'admin', token: admin, patients: [] }];

  const roles = [
    ...Array(professionals).fill('professional'),
    ...Array(caregivers).fill('caregiver'),
    ...Array(families).fill('family'),
  ];
  await pool(roles.length, USER_PREP_CONCURRENCY, async (i) => {
    const role = roles[i];
    const email = `${role}${i}@${code}.example.test`;
    const invited = await api.request('POST', '/api/v1/users', {
      token: admin,
      // Senha provisoria explicita (BE-31): com SMTP ligado o padrao e o link.
      json: {
        name: `${role} ${i}`,
        email,
        cpf: cpf(),
        profileCode: role,
        channel: 'temporary_password',
      },
    });
    expectStatus(invited, 201, `convite ${role}`);
    const token = await signIn(
      api,
      code,
      email,
      [dataOf(invited).temporaryPassword],
      password,
    );
    sessions.push({
      role,
      id: dataOf(invited).user.id,
      email,
      token,
      patients: [],
    });
  });
  const byRole = (role) => sessions.filter((session) => session.role === role);
  const pros = byRole('professional');
  const cares = byRole('caregiver');
  const fams = byRole('family');

  const patients = [];
  await pool(Number(args.patients), PREP_CONCURRENCY, async (i) => {
    const responsible = pick(pros, i);
    const patient = await api.request('POST', '/api/v1/patients', {
      token: admin,
      json: {
        name: `Paciente Carga ${i}`,
        birthDate: '1950-01-01',
        responsibleUserId: responsible.id,
        cpf: cpf(),
      },
    });
    expectStatus(patient, 201, 'paciente');
    const id = dataOf(patient).id;
    patients.push(id);
    responsible.patients.push(id);
    for (const [session, linkType] of [
      [pick(cares, i), 'Cuidador'],
      [pick(fams, i), 'Filho'],
    ]) {
      const link = await api.request('POST', '/api/v1/patient-links', {
        token: admin,
        json: { patientId: id, userId: session.id, linkType },
      });
      expectStatus(link, 201, 'vinculo');
      session.patients.push(id);
    }
  });
  sessions[0].patients = patients;

  const form = await api.request('POST', '/api/v1/forms', {
    token: admin,
    json: {
      name: 'Visita da carga',
      audience: 'organization',
      fields: [
        {
          name: 'Glicemia',
          fieldType: 'number',
          requirement: 'optional',
          unit: 'mg/dL',
          decimalPlaces: 0,
        },
        {
          name: 'Dor',
          fieldType: 'scale',
          requirement: 'optional',
          scaleMin: 0,
          scaleMax: 10,
        },
      ],
    },
  });
  expectStatus(form, 201, 'formulario');
  const published = await api.request(
    'POST',
    `/api/v1/forms/${dataOf(form).id}/publish`,
    { token: admin, json: { confirmImpact: false } },
  );
  expectStatus(published, 200, 'publicacao');
  const formInfo = {
    id: dataOf(published).id,
    version: dataOf(published).currentVersion,
  };
  const rule = await api.request('POST', '/api/v1/alert-rules', {
    token: admin,
    json: {
      formId: formInfo.id,
      fieldKey: formInfo.version.fields[0].fieldKey,
      name: 'Glicemia alta',
      operator: 'gt',
      referenceValue: 230,
      severity: 'warning',
    },
  });
  expectStatus(rule, 201, 'regra');

  const followUp = (patientId) => ({
    patientId,
    formId: formInfo.id,
    formVersionId: formInfo.version.id,
    answers: [
      {
        fieldId: formInfo.version.fields[0].id,
        value: 80 + Math.floor(Math.random() * 170),
      },
      {
        fieldId: formInfo.version.fields[1].id,
        value: Math.floor(Math.random() * 11),
      },
    ],
  });
  const perPatient = Number(args['records-per-patient']);
  await pool(patients.length * perPatient, PREP_CONCURRENCY, async (i) => {
    const caregiver = pick(cares, Math.floor(i / perPatient));
    const patientId = pick(
      caregiver.patients,
      Math.floor(i / perPatient / cares.length),
    );
    const record = await api.request('POST', '/api/v1/follow-ups', {
      token: caregiver.token,
      json: followUp(patientId),
    });
    expectStatus(record, 201, 'registro');
  });

  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  console.log(
    `preparo: ${sessions.length} usuarios, ${patients.length} pacientes, ${patients.length * perPatient} registros em ${seconds} s`,
  );
  return { sessions, followUp, code };
};

const operations = ({ followUp }) => {
  const patientOf = (session) => random(session.patients);
  const get = (route, path) => ({
    route,
    run: (s) => api.request('GET', path(s), { token: s.token }),
  });
  const read = {
    patientsList: get('GET /patients', () => '/api/v1/patients?limit=20'),
    patientDetail: get(
      'GET /patients/:id',
      (s) => `/api/v1/patients/${patientOf(s)}`,
    ),
    history: get(
      'GET /follow-ups?patientId',
      (s) => `/api/v1/follow-ups?patientId=${patientOf(s)}`,
    ),
    overview: get(
      'GET /patients/:id/overview',
      (s) => `/api/v1/patients/${patientOf(s)}/overview`,
    ),
    evolution: get(
      'GET /patients/:id/evolution',
      (s) => `/api/v1/patients/${patientOf(s)}/evolution`,
    ),
    alerts: get(
      'GET /alerts?patientId',
      (s) => `/api/v1/alerts?patientId=${patientOf(s)}&limit=20`,
    ),
    inbox: get('GET /notifications', () => '/api/v1/notifications?limit=20'),
    unread: get(
      'GET /notifications/unread-count',
      () => '/api/v1/notifications/unread-count',
    ),
    dashboard: get('GET /dashboard', () => '/api/v1/dashboard'),
    audit: get('GET /audit-events', () => '/api/v1/audit-events?limit=20'),
  };
  const write = {
    followUp: {
      route: 'POST /follow-ups',
      run: (s) =>
        api.request('POST', '/api/v1/follow-ups', {
          token: s.token,
          json: followUp(patientOf(s)),
        }),
    },
    readAll: {
      route: 'POST /notifications/read-all',
      run: (s) =>
        api.request('POST', '/api/v1/notifications/read-all', {
          token: s.token,
        }),
    },
  };
  const exports = {
    pdf: {
      route: 'GET /patients/:id/report/pdf',
      run: (s) =>
        api.request('GET', `/api/v1/patients/${patientOf(s)}/report/pdf`, {
          token: s.token,
        }),
    },
    csv: get('GET /audit-events/export', () => '/api/v1/audit-events/export'),
  };

  return {
    admin: {
      read: [
        read.dashboard,
        read.patientsList,
        read.alerts,
        read.audit,
        read.patientDetail,
      ],
      write: [],
      export: [exports.csv],
    },
    professional: {
      read: [
        read.patientsList,
        read.patientDetail,
        read.overview,
        read.evolution,
        read.history,
        read.alerts,
      ],
      write: [],
      export: [exports.pdf],
    },
    caregiver: {
      read: [read.patientsList, read.patientDetail, read.history, read.inbox],
      write: [write.followUp, write.readAll],
      export: [],
    },
    family: {
      read: [read.patientDetail, read.history, read.alerts, read.unread],
      write: [write.readAll],
      export: [],
    },
  };
};

const chooseCategory = () => {
  const roll = Math.random();
  if (roll < WEIGHTS.export) return 'export';
  if (roll < WEIGHTS.export + WEIGHTS.write) return 'write';
  return 'read';
};

const percentile = (sorted, p) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
    : null;

const measure = async (prepared) => {
  const byRole = operations(prepared);
  const samples = [];
  const deadline = Date.now() + Number(args.duration) * 1000;
  const thinkMs = Number(args['think-ms']);

  await Promise.all(
    prepared.sessions.map(async (session) => {
      while (Date.now() < deadline) {
        let category = chooseCategory();
        if (byRole[session.role][category].length === 0) category = 'read';
        const operation = random(byRole[session.role][category]);
        try {
          const response = await operation.run(session);
          samples.push({
            category,
            route: operation.route,
            status: response.status,
            ms: response.elapsedMs,
          });
        } catch {
          samples.push({
            category,
            route: operation.route,
            status: 0,
            ms: null,
          });
        }
        if (thinkMs > 0) await sleep(thinkMs * (0.5 + Math.random()));
      }
    }),
  );
  return samples;
};

const summarize = (samples) => {
  const group = (key) => {
    const groups = new Map();
    for (const sample of samples) {
      if (!groups.has(sample[key])) groups.set(sample[key], []);
      groups.get(sample[key]).push(sample);
    }
    return [...groups].map(([name, list]) => {
      const timed = list
        .filter((s) => s.status !== 429 && s.ms !== null)
        .map((s) => s.ms)
        .sort((a, b) => a - b);
      return {
        name,
        category: list[0].category,
        n: list.length,
        p50: percentile(timed, 0.5),
        p95: percentile(timed, 0.95),
        p99: percentile(timed, 0.99),
        max: timed.at(-1) ?? null,
        errors5xx: list.filter((s) => s.status >= 500 || s.status === 0).length,
        throttled429: list.filter((s) => s.status === 429).length,
        other4xx: list.filter(
          (s) => s.status >= 400 && s.status < 500 && s.status !== 429,
        ).length,
      };
    });
  };
  return {
    categories: group('category'),
    routes: group('route').sort((a, b) => a.category.localeCompare(b.category)),
  };
};

const fmt = (value) => (value === null ? '-' : `${Math.round(value)}`);

const main = async () => {
  const prepared = await prepare();
  console.log(
    `carga: ${prepared.sessions.length} sessoes simultaneas por ${args.duration} s`,
  );
  const samples = await measure(prepared);
  const summary = summarize(samples);
  const verdicts = summary.categories.map((c) => ({
    category: c.name,
    target: TARGETS[c.name],
    ok: c.p95 !== null && c.p95 <= TARGETS[c.name] && c.errors5xx === 0,
  }));

  console.log(
    '\ncategoria  n       p50   p95   p99   max    5xx  429  4xx  meta p95  ok',
  );
  for (const c of summary.categories) {
    const verdict = verdicts.find((v) => v.category === c.name);
    console.log(
      `${c.name.padEnd(10)} ${String(c.n).padEnd(7)} ${fmt(c.p50).padEnd(5)} ${fmt(c.p95).padEnd(5)} ${fmt(c.p99).padEnd(5)} ${fmt(c.max).padEnd(6)} ${String(c.errors5xx).padEnd(4)} ${String(c.throttled429).padEnd(4)} ${String(c.other4xx).padEnd(4)} ${String(verdict.target).padEnd(9)} ${verdict.ok ? 'sim' : 'NAO'}`,
    );
  }
  console.log(
    '\nrota                                  n      p50   p95   p99   5xx  4xx',
  );
  for (const r of summary.routes) {
    console.log(
      `${r.name.padEnd(37)} ${String(r.n).padEnd(6)} ${fmt(r.p50).padEnd(5)} ${fmt(r.p95).padEnd(5)} ${fmt(r.p99).padEnd(5)} ${String(r.errors5xx).padEnd(4)} ${r.other4xx}`,
    );
  }
  const throughput = (samples.length / Number(args.duration)).toFixed(1);
  console.log(`\n${samples.length} requisicoes, ${throughput} req/s`);

  // Informativo, sem meta: a capacidade de login e limitada pelo argon2id.
  const burst = await Promise.all(
    prepared.sessions.slice(1, 1 + LOGIN_BURST).map(async (session) => {
      const login = await api.request('POST', '/api/v1/auth/login', {
        json: {
          organizationCode: prepared.code,
          email: session.email,
          password,
        },
      });
      return { status: login.status, ms: login.elapsedMs };
    }),
  );
  const burstMs = burst.map((b) => b.ms).sort((a, b) => a - b);
  const loginBurst = {
    n: burst.length,
    ok: burst.filter((b) => b.status === 200).length,
    p50: percentile(burstMs, 0.5),
    max: burstMs.at(-1) ?? null,
  };
  console.log(
    `rajada de ${loginBurst.n} logins simultaneos (informativo): ${loginBurst.ok} ok, p50 ${fmt(loginBurst.p50)} ms, max ${fmt(loginBurst.max)} ms`,
  );

  if (args.report) {
    await writeFile(
      args.report,
      `${JSON.stringify({ args, targets: TARGETS, verdicts, ...summary, throughput, loginBurst }, null, 2)}\n`,
    );
  }
  process.exit(verdicts.every((v) => v.ok) ? 0 : 1);
};

await main();

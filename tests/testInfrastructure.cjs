/**
 * Infraestrutura real das suites e2e (BE-24).
 *
 * As suites de banco e Redis pulam sem `VITACARE_TEST_DATABASE_URL` e
 * `VITACARE_TEST_REDIS_URL`, para o desenvolvimento local rodar sem
 * dependencias. Com `VITACARE_TEST_REQUIRE_INFRA=true` (o CI liga), pular
 * deixa de ser opcao: faltar URL ou servico derruba a execucao antes do
 * primeiro teste, e qualquer teste pulado a reprova no fim.
 */
const net = require('node:net');

const REQUIRED_URLS = ['VITACARE_TEST_DATABASE_URL', 'VITACARE_TEST_REDIS_URL'];
const PROBE_TIMEOUT_MS = 5000;

const infrastructureRequired = () =>
  process.env.VITACARE_TEST_REQUIRE_INFRA === 'true';

const probe = (variable) =>
  new Promise((resolve) => {
    const url = new URL(process.env[variable]);
    const port = Number(url.port || (url.protocol === 'redis:' ? 6379 : 5432));
    const socket = net.connect({ host: url.hostname, port });
    const done = (problem) => {
      socket.destroy();
      resolve(problem);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS, () =>
      done(`${variable}: ${url.hostname}:${port} nao respondeu`),
    );
    socket.once('connect', () => done(null));
    socket.once('error', (error) =>
      done(`${variable}: ${url.hostname}:${port} recusou (${error.code})`),
    );
  });

const assertTestInfrastructure = async () => {
  if (!infrastructureRequired()) return;

  const missing = REQUIRED_URLS.filter((variable) => !process.env[variable]);
  const problems =
    missing.length > 0
      ? missing.map((variable) => `${variable} ausente`)
      : (await Promise.all(REQUIRED_URLS.map(probe))).filter(Boolean);

  if (problems.length === 0) return;

  throw new Error(
    [
      '',
      'VITACARE_TEST_REQUIRE_INFRA=true exige PostgreSQL e Redis descartaveis:',
      ...problems.map((problem) => `  - ${problem}`),
      '',
    ].join('\n'),
  );
};

module.exports = { assertTestInfrastructure, infrastructureRequired };

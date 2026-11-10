// Cliente HTTP e relatorio de verificacoes dos scripts de operacao (BE-25).
// Node 22 puro: fetch nativo, sem dependencia. Nada aqui imprime token,
// senha ou corpo de resposta: so o nome da verificacao e o motivo da falha.

export const createClient = (baseUrl) => {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    async request(
      method,
      path,
      { token, json, form, headers = {}, timeoutMs = 30_000 } = {},
    ) {
      const init = {
        method,
        headers: { ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      };

      if (token) init.headers.authorization = `Bearer ${token}`;
      if (json !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(json);
      }
      if (form) init.body = form;

      const started = performance.now();
      const response = await fetch(`${root}${path}`, init);
      const bytes = Buffer.from(await response.arrayBuffer());
      const elapsedMs = performance.now() - started;
      const type = response.headers.get('content-type') ?? '';
      let body = null;

      if (type.includes('application/json')) {
        try {
          body = JSON.parse(bytes.toString('utf8'));
        } catch {
          body = null;
        }
      }

      return {
        status: response.status,
        headers: response.headers,
        body,
        bytes,
        elapsedMs,
      };
    },
  };
};

export class CheckFailed extends Error {}

/** Falha a verificacao com um motivo curto, sem dado da resposta. */
export const expect = (condition, reason) => {
  if (!condition) throw new CheckFailed(reason);
};

export const expectStatus = (response, status, what = '') =>
  expect(
    response.status === status,
    `${what ? `${what}: ` : ''}esperado ${status}, veio ${response.status}${
      response.body?.error?.code ? ` ${response.body.error.code}` : ''
    }`,
  );

export const createReport = ({ quiet = false } = {}) => {
  const results = [];

  return {
    results,
    async check(name, fn) {
      try {
        const value = await fn();
        results.push({ name, ok: true });
        if (!quiet) console.log(`ok      ${name}`);
        return value;
      } catch (error) {
        const reason =
          error instanceof CheckFailed
            ? error.message
            : `erro: ${error.message}`;
        results.push({ name, ok: false, reason });
        if (!quiet) console.log(`FALHOU  ${name}: ${reason}`);
        throw new CheckFailed(name);
      }
    },
    get failed() {
      return results.filter((result) => !result.ok).length;
    },
  };
};

/** CPF valido e sintetico a partir de uma semente numerica de 9 digitos. */
export const syntheticCpf = (seed) => {
  const base = String(seed).padStart(9, '0').slice(-9);
  const digit = (digits, weightStart) => {
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

export const dataOf = (response) => response.body?.data;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Repete `probe` ate `accept` aceitar ou o prazo acabar; devolve o ultimo valor. */
export const eventually = async (probe, accept, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!accept(value) && Date.now() < deadline) {
    await sleep(500);
    value = await probe();
  }
  return value;
};

/**
 * Sessao: login e, se a senha for provisoria, primeiro acesso com a definitiva.
 * Aceita conta ja ativada (segunda execucao contra o mesmo banco).
 */
export const signIn = async (
  api,
  organizationCode,
  email,
  passwords,
  finalPassword,
) => {
  for (const password of passwords) {
    const login = await api.request('POST', '/api/v1/auth/login', {
      json: { organizationCode, email, password },
    });

    if (login.status !== 200) continue;

    const { state, accessToken } = dataOf(login);

    if (state === 'authenticated') return accessToken;

    const changed = await api.request(
      'POST',
      '/api/v1/auth/password/first-access',
      {
        token: accessToken,
        json: { newPassword: finalPassword },
      },
    );
    expectStatus(changed, 200, 'primeiro acesso');

    const session = await api.request('POST', '/api/v1/auth/login', {
      json: { organizationCode, email, password: finalPassword },
    });
    expectStatus(session, 200, 'login apos primeiro acesso');
    return dataOf(session).accessToken;
  }

  throw new CheckFailed(
    `login recusado para a conta da organizacao ${organizationCode}`,
  );
};

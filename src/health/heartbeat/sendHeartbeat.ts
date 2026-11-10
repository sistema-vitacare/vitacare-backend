export type HeartbeatResult = 'sent' | 'database_down' | 'push_failed';

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Um pulso so sai com o banco respondendo: chegar ate aqui ja prova que o
 * Redis agendou e que o worker do processo consumiu. Nunca lanca, para o
 * Kuma fora do ar nao virar falha de job.
 */
export const sendHeartbeat = async (deps: {
  pushUrl: string;
  pingDatabase: () => Promise<void>;
  fetch: typeof fetch;
  timeoutMs?: number;
}): Promise<HeartbeatResult> => {
  try {
    await deps.pingDatabase();
  } catch {
    return 'database_down';
  }

  const url = new URL(deps.pushUrl);
  url.searchParams.set('status', 'up');
  url.searchParams.set('msg', 'OK');

  try {
    const response = await deps.fetch(url, {
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    return response.ok ? 'sent' : 'push_failed';
  } catch {
    return 'push_failed';
  }
};

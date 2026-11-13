/** Limite da coluna `terms_acceptances.user_agent`. */
export const USER_AGENT_MAX_LENGTH = 512;

/**
 * Navegador informado no aceite (BE-32): sem caracteres de controle, ate 512
 * caracteres; ausente ou vazio vira `null`. E dado de rastreabilidade, nao de
 * identificacao, e nunca e confiavel: o cliente escreve o que quiser.
 */
export const normalizeUserAgent = (
  raw: string | string[] | undefined,
): string | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const clean = (value ?? '').replace(/\p{Cc}/gu, '').trim();

  return clean
    ? Array.from(clean).slice(0, USER_AGENT_MAX_LENGTH).join('')
    : null;
};

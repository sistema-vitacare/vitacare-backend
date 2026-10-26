export const toBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (value === undefined || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true';
};

export const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/**
 * Valor de `trust proxy` do Express. Vazio ou `false` desliga (acesso direto,
 * desenvolvimento); um inteiro confia nesse numero de saltos; qualquer outro
 * texto e repassado como lista de faixas (`loopback,uniquelocal`). `true` e
 * recusado na validacao do ambiente: confiaria em X-Forwarded-For forjado.
 */
export const toTrustProxy = (
  value: string | undefined,
): false | number | string => {
  const normalized = (value ?? '').trim();

  if (normalized === '' || normalized.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);

  return toList(normalized).join(',');
};

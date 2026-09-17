/**
 * Rotas que nao recebem o envelope nem o novo formato de erro: health mantem o
 * formato do Terminus e a documentacao mantem HTML e OpenAPI puros.
 *
 * A comparacao e por prefixo, entao `/api/docs` cobre tambem `/api/docs-json`.
 */
export const isExcludedPath = (
  path: string,
  prefixes: readonly string[],
): boolean => prefixes.some((prefix) => path.startsWith(prefix));

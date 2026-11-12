/** `%`, `_` e `\` digitados na busca sao texto, nao curinga do ILIKE. */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&');

/** Dias locais inclusivos `$2..$3`, na forma que usa o indice por instante. */
export const inPeriod = (column: string) =>
  `${column} >= $2::date::timestamp AT TIME ZONE 'America/Sao_Paulo'
   AND ${column} < ($3::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`;

/** Dia local `AAAA-MM-DD` de um instante, no fuso das regras de periodo. */
export const localDay = (column: string) =>
  `to_char((${column} AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`;

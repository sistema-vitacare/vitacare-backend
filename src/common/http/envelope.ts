const ENVELOPE = Symbol('vitacare.envelope');

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Forma minima aceita por `paginate`. `PaginationQueryDto` a satisfaz. */
export interface PaginationInput {
  page: number;
  limit: number;
}

export interface EnvelopeExtras {
  message?: string;
  pagination?: PaginationMeta;
}

export interface ResponseMeta extends EnvelopeExtras {
  requestId: string;
  timestamp: string;
}

export interface EnvelopePayload<T> {
  readonly [ENVELOPE]: true;
  data: T;
  extras: EnvelopeExtras;
}

/** O caso de uso usa isto quando quer preencher `meta` alem do padrao. */
export const withMeta = <T>(
  data: T,
  extras: EnvelopeExtras,
): EnvelopePayload<T> => ({ [ENVELOPE]: true, data, extras });

export const isEnvelopePayload = (
  value: unknown,
): value is EnvelopePayload<unknown> =>
  typeof value === 'object' && value !== null && ENVELOPE in value;

/** Resultado de `findAndCount` pronto para virar `meta.pagination`. */
export const paginate = <T>(
  items: T[],
  total: number,
  query: PaginationInput,
): EnvelopePayload<T[]> =>
  withMeta(items, {
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
    },
  });

export const buildEnvelope = (
  result: unknown,
  requestId: string,
): { data: unknown; meta: ResponseMeta } => {
  const timestamp = new Date().toISOString();

  if (isEnvelopePayload(result)) {
    return {
      data: result.data ?? null,
      meta: { requestId, timestamp, ...result.extras },
    };
  }

  return { data: result ?? null, meta: { requestId, timestamp } };
};

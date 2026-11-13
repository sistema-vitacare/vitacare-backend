/** Versao do termo como sai do banco (BE-32). */
export interface TermsVersionRow {
  id: string;
  version: number;
  title: string;
  content: string;
  contentHash: string;
  publishedAt: Date;
}

/** Caminho da pagina publica, relativo a origem da API. */
export const termsPagePath = (version: number): string =>
  `/termos?versao=${version}`;

/** Aceite gravado, como sai para o proprio usuario. */
export interface TermsAcceptanceRow {
  id: string;
  version: number;
  contentHash: string;
  acceptedAt: Date;
}

export type AcceptTermsOutcome =
  { row: TermsAcceptanceRow; created: boolean } | { notCurrent: number | null };

/** Linha da consulta da organizacao (admin) ou de todas (master). */
export interface TermsAcceptanceListRow extends TermsAcceptanceRow {
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
  profileCode: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface TermsAcceptanceFilter {
  /** `null` = todas as organizacoes (so o master). */
  organizationId: string | null;
  period: { from: string; to: string };
  version?: number;
  userId?: string;
}

export const TERMS_ACCEPTANCES_EMPTY_MESSAGE =
  'Nenhum aceite do termo no período.';

/** Erro atribuido a um campo especifico da requisicao. */
export interface FieldError {
  field: string;
  code: string;
  message?: string;
}

export interface DomainErrorPayload {
  /** Codigo estavel no formato DOMINIO_MOTIVO. E contrato com o frontend. */
  code: string;
  status: number;
  /** Mensagem amigavel, em portugues, exibivel ao usuario final. */
  message: string;
  /**
   * Frase tecnica escrita por nos. Nunca stack, nunca mensagem crua de driver,
   * nunca valor de campo clinico ou de identidade.
   */
  detail?: string | null;
  fields?: FieldError[] | null;
  /** Erro original, usado apenas no log. Nunca chega ao corpo da resposta. */
  cause?: unknown;
}

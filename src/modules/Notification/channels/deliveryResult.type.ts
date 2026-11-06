/**
 * Resultado de um envio. `retry` tenta de novo mais tarde; `failed` encerra;
 * `expired` encerra e revoga a inscricao de push; `disabled` = canal desligado
 * no servidor. O `code` vai para `last_error_code` e para o log, sem dado
 * pessoal.
 */
export type DeliveryResult =
  | { kind: 'sent' }
  | { kind: 'retry'; code: string }
  | { kind: 'failed'; code: string }
  | { kind: 'expired'; code: string }
  | { kind: 'disabled' };

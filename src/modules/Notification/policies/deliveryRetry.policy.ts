/** Depois da quinta tentativa sem sucesso a entrega fica `failed`. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Reserva durante o envio: se o processo cair entre o envio e a gravacao do
 * resultado, a entrega volta a vencer depois disso (pode repetir um envio).
 */
export const DELIVERY_LEASE_SECONDS = 120;

const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200];

/** Espera ate a proxima tentativa depois de `attempts` tentativas feitas. */
export const retryDelaySeconds = (attempts: number): number =>
  RETRY_DELAYS_SECONDS[
    Math.min(Math.max(attempts, 1), RETRY_DELAYS_SECONDS.length) - 1
  ];

import { randomInt } from 'node:crypto';

/** Sem caracteres ambiguos: a senha e lida e digitada por uma pessoa. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const TEMPORARY_PASSWORD_LENGTH = 20;

export const generateTemporaryPassword = (): string =>
  Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join('');

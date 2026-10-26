/** Digitos do CPF, sem pontuacao. */
export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

const checkDigit = (digits: string, weightStart: number): number => {
  const sum = digits
    .split('')
    .reduce(
      (total, digit, index) => total + Number(digit) * (weightStart - index),
      0,
    );

  const remainder = (sum * 10) % 11;

  return remainder === 10 ? 0 : remainder;
};

/**
 * Valida CPF pelos digitos verificadores. Rejeita tambem as sequencias de
 * digito repetido, que passam no calculo mas nao existem como documento.
 */
export const isValidCpf = (value: string): boolean => {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  return (
    checkDigit(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    checkDigit(cpf.slice(0, 10), 11) === Number(cpf[10])
  );
};

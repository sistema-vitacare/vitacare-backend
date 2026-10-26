import { isValidCpf, onlyDigits } from '@/common/validation/cpf';

describe('isValidCpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])(
    'aceita %s com digitos verificadores corretos',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it.each([
    ['digito verificador errado', '52998224726'],
    ['tamanho menor', '5299822472'],
    ['tamanho maior', '529982247250'],
    ['sequencia repetida', '11111111111'],
    ['texto', 'nao-e-cpf'],
    ['vazio', ''],
  ])('recusa %s', (_case, cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });
});

describe('onlyDigits', () => {
  it('remove pontuacao mantendo a ordem', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
  });
});

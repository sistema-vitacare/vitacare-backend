import { parsePlatformSeedArguments } from '@/database/seeds/platformSeed';

const valid = [
  '--organization-code',
  'VitaCare',
  '--trade-name',
  'VitaCare',
  '--admin-name',
  'Master',
  '--admin-email',
  'Master@Example.test',
  '--admin-cpf',
  '529.982.247-25',
];

describe('parsePlatformSeedArguments', () => {
  it('normaliza codigo, e-mail e CPF', () => {
    expect(parsePlatformSeedArguments(valid)).toEqual({
      organizationCode: 'vitacare',
      tradeName: 'VitaCare',
      adminName: 'Master',
      adminEmail: 'master@example.test',
      adminCpf: '52998224725',
    });
  });

  it.each([
    [['--senha', 'x'], 'Argumento nao reconhecido'],
    [valid.slice(0, 8), 'Argumento obrigatorio ausente: --admin-cpf'],
    [[...valid.slice(0, 9), '11111111111'], 'CPF'],
    [['--organization-code', 'Codigo Invalido', ...valid.slice(2)], 'Codigo'],
  ])('recusa argumentos invalidos (%#)', (argv, detail) => {
    expect(() => parsePlatformSeedArguments(argv)).toThrow(
      expect.objectContaining({
        code: 'ORGANIZATION_SEED_INVALID_INPUT',
        detail: expect.stringContaining(detail) as string,
      }) as Error,
    );
  });
});

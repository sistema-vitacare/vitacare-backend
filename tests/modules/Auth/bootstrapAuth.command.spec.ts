import { DomainException } from '@/common/errors/domain.exception';

import {
  BootstrapAuthCommand,
  parseBootstrapArguments,
} from '@/modules/Auth/BootstrapAuth/bootstrapAuth.command';

const validArguments = [
  '--organization-code',
  'clinica-exemplo',
  '--usage-plan-id',
  '11111111-1111-4111-8111-111111111111',
  '--trade-name',
  'Clínica Exemplo',
  '--admin-name',
  'Maria Souza',
  '--admin-email',
  'Maria@Example.Test',
  '--admin-cpf',
  '529.982.247-25',
];

const withArgument = (name: string, value: string): string[] => {
  const argv = [...validArguments];
  const index = argv.indexOf(name);

  argv[index + 1] = value;

  return argv;
};

describe('parseBootstrapArguments', () => {
  it('normaliza codigo, e-mail e CPF informados', () => {
    expect(parseBootstrapArguments(validArguments)).toEqual({
      organizationCode: 'clinica-exemplo',
      usagePlanId: '11111111-1111-4111-8111-111111111111',
      tradeName: 'Clínica Exemplo',
      adminName: 'Maria Souza',
      adminEmail: 'maria@example.test',
      adminCpf: '52998224725',
    });
  });

  it.each([
    ['codigo fora do padrao', withArgument('--organization-code', 'Clinica_1')],
    ['plano que nao e UUID', withArgument('--usage-plan-id', 'plano-1')],
    ['e-mail invalido', withArgument('--admin-email', 'maria.example.test')],
    ['CPF com digito errado', withArgument('--admin-cpf', '52998224726')],
    ['nome vazio', withArgument('--admin-name', '   ')],
  ])('recusa %s', (_case, argv) => {
    expect(() => parseBootstrapArguments(argv)).toThrow(DomainException);
  });

  it('recusa argumento desconhecido e qualquer opcao de senha', () => {
    expect(() =>
      parseBootstrapArguments([...validArguments, '--password', 'segredo']),
    ).toThrow(DomainException);

    expect(() =>
      parseBootstrapArguments([...validArguments, '--admin-password', 'x']),
    ).toThrow(DomainException);
  });

  it('exige todos os argumentos obrigatorios', () => {
    expect(() => parseBootstrapArguments(validArguments.slice(0, 4))).toThrow(
      DomainException,
    );
  });
});

describe('BootstrapAuthCommand', () => {
  const input = parseBootstrapArguments(validArguments);

  const buildManager = (
    rowsByStatement: Array<unknown[]>,
  ): { query: jest.Mock } => {
    const query = jest.fn();

    for (const rows of rowsByStatement) {
      query.mockResolvedValueOnce(rows);
    }

    return { query };
  };

  const buildCommand = (manager: { query: jest.Mock }) => {
    const dataSource = {
      transaction: jest.fn(
        async (runInTransaction: (manager: unknown) => Promise<unknown>) =>
          runInTransaction(manager),
      ),
    };

    const passwords = { hash: jest.fn().mockResolvedValue('hash-temporario') };

    return {
      command: new BootstrapAuthCommand(
        dataSource as never,
        passwords as never,
      ),
      passwords,
    };
  };

  it('cria organizacao, perfil, permissao e administrador em uma transacao', async () => {
    const manager = buildManager([
      [{ id: 'plano-1' }], // plano vigente
      [{ id: 'org-1' }], // organizacao
      [{ id: 'perfil-1' }], // perfil admin
      [{ id: 'permissao-1' }], // permissao users:reset_password
      [], // vinculo perfil/permissao
      [{ id: 'user-1' }], // administrador
      [], // auditoria
    ]);

    const { command, passwords } = buildCommand(manager);
    const result = await command.execute(input);

    expect(result).toEqual({
      organizationId: 'org-1',
      profileId: 'perfil-1',
      userId: 'user-1',
      temporaryPassword: expect.any(String) as string,
    });
    expect(result.temporaryPassword).toHaveLength(20);
    expect(passwords.hash).toHaveBeenCalledWith(result.temporaryPassword);

    const statements = manager.query.mock.calls
      .map((call) => (call as [string])[0])
      .join(' ');

    expect(statements).toContain('INSERT INTO organizations');
    expect(statements).toContain('INSERT INTO access_profiles');
    expect(statements).toContain('INSERT INTO profile_permissions');
    expect(statements).toContain('INSERT INTO users');
    expect(statements).toContain('INSERT INTO audit_events');
    expect(statements).not.toContain(result.temporaryPassword);
  });

  it('marca o administrador como ativo com troca obrigatoria', async () => {
    const manager = buildManager([
      [{ id: 'plano-1' }],
      [{ id: 'org-1' }],
      [{ id: 'perfil-1' }],
      [{ id: 'permissao-1' }],
      [],
      [{ id: 'user-1' }],
      [],
    ]);

    const { command } = buildCommand(manager);

    await command.execute(input);

    const userInsert = manager.query.mock.calls
      .map((call) => call as [string, unknown[]])
      .find(([sql]) => sql.includes('INSERT INTO users'));

    expect(userInsert?.[0]).toContain("'active'");
    expect(userInsert?.[0]).toContain('must_change_password');
    expect(userInsert?.[1]).toContain('hash-temporario');
    expect(userInsert?.[1]).toContain('52998224725');
  });

  it('falha sem criar nada quando o plano nao existe', async () => {
    const manager = buildManager([[]]);
    const { command } = buildCommand(manager);

    await expect(command.execute(input)).rejects.toMatchObject<
      Partial<DomainException>
    >({
      code: 'AUTH_BOOTSTRAP_PLAN_NOT_FOUND',
    });

    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('traduz duplicidade em conflito sem expor o valor duplicado', async () => {
    const manager = { query: jest.fn() };

    manager.query
      .mockResolvedValueOnce([{ id: 'plano-1' }])
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'organizations_code_unique',
          detail: 'Key (code)=(clinica-exemplo) already exists.',
        }),
      );

    const { command } = buildCommand(manager);
    const failure = await command
      .execute(input)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      code: 'AUTH_BOOTSTRAP_CONFLICT',
      detail: expect.stringContaining('organizations_code_unique') as string,
    });
    expect((failure as DomainException).detail).not.toContain(
      'clinica-exemplo',
    );
  });
});

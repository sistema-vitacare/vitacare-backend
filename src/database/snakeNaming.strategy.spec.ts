import { SnakeNamingStrategy } from './snakeNaming.strategy';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('converte o nome da classe em snake_case', () => {
    expect(strategy.tableName('FollowUpAnswer', undefined)).toBe(
      'follow_up_answer',
    );
  });

  it('respeita o nome customizado da tabela', () => {
    expect(strategy.tableName('FollowUpAnswer', 'registros')).toBe('registros');
  });

  it('converte a propriedade em snake_case', () => {
    expect(strategy.columnName('organizationId', undefined, [])).toBe(
      'organization_id',
    );
  });

  it('respeita o nome customizado da coluna', () => {
    expect(strategy.columnName('organizationId', 'org_id', [])).toBe('org_id');
  });

  it('prefixa colunas de embedded', () => {
    expect(strategy.columnName('street', undefined, ['homeAddress'])).toBe(
      'home_address_street',
    );
  });

  it('monta a coluna de juncao a partir da relacao', () => {
    expect(strategy.joinColumnName('patient', 'id')).toBe('patient_id');
  });

  it('mantem siglas legiveis', () => {
    expect(strategy.columnName('patientCPFNumber', undefined, [])).toBe(
      'patient_cpf_number',
    );
  });
});

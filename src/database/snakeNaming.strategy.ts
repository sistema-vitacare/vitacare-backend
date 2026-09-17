import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

/** `followUpAnswer` -> `follow_up_answer`; `patientCPFNumber` -> `patient_cpf_number`. */
const snake = (value: string): string =>
  value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\./g, '_')
    .toLowerCase();

/**
 * Escrita a mao para nao adicionar dependencia. Mantem o codigo em camelCase e
 * o banco em snake_case sem repetir `name:` em cada `@Column`, o que elimina o
 * risco de esquecer um e produzir coluna com grafia divergente.
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(className: string, customName?: string): string {
    return customName ?? snake(className);
  }

  columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const name = customName ?? snake(propertyName);
    const prefix = embeddedPrefixes.map(snake).join('_');

    return prefix ? `${prefix}_${name}` : name;
  }

  relationName(propertyName: string): string {
    return snake(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snake(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return snake(`${firstTableName}_${firstPropertyName}_${secondTableName}`);
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snake(`${tableName}_${columnName ?? propertyName}`);
  }

  classTableInheritanceParentColumnName(
    parentTableName: unknown,
    parentTableIdPropertyName: unknown,
  ): string {
    return snake(
      `${String(parentTableName)}_${String(parentTableIdPropertyName)}`,
    );
  }

  eagerJoinRelationAlias(alias: string, propertyPath: string): string {
    return `${alias}__${propertyPath.replace(/\./g, '_')}`;
  }
}

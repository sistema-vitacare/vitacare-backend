import type {
  DeepPartial,
  EntityManager,
  FindOptionsOrder,
  FindOptionsRelations,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import type { RequestContext } from '../context/requestContext.type';
import { translatePgError } from '../errors/pgError.translator';

/** Toda entidade de dominio pertence a uma organizacao. */
export interface TenantOwned {
  organizationId: string;
}

export interface ScopedFindOptions<T> {
  where?: FindOptionsWhere<T>;
  order?: FindOptionsOrder<T>;
  relations?: FindOptionsRelations<T>;
  skip?: number;
  take?: number;
}

/**
 * Unica via de acesso a dados fora de `repositories/`. O TypeORM nao tem filtro
 * global de tenant, entao o escopo por organizacao e imposto aqui: esquecer o
 * filtro deixa de ser possivel porque o metodo nao aceita consulta sem ele.
 *
 * O `organizationId` vem sempre do contexto autenticado. Quando o input traz um
 * `organizationId`, ele e sobrescrito, nunca respeitado.
 */
export class TenantScopedRepository<T extends ObjectLiteral & TenantOwned> {
  constructor(private readonly repository: Repository<T>) {}

  private get resource(): string {
    return this.repository.metadata.tableName;
  }

  private scoped(
    context: RequestContext,
    where?: FindOptionsWhere<T>,
  ): FindOptionsWhere<T> {
    return {
      ...(where ?? {}),
      organizationId: context.organizationId,
    } as FindOptionsWhere<T>;
  }

  async findManyScoped(
    context: RequestContext,
    options: ScopedFindOptions<T> = {},
  ): Promise<[T[], number]> {
    const { where, ...rest } = options;

    try {
      return await this.repository.findAndCount({
        ...rest,
        where: this.scoped(context, where),
      });
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  async findOneScoped(
    context: RequestContext,
    where: FindOptionsWhere<T>,
  ): Promise<T | null> {
    try {
      return await this.repository.findOne({
        where: this.scoped(context, where),
      });
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  async createScoped(
    context: RequestContext,
    data: DeepPartial<T>,
  ): Promise<T> {
    const entity = this.repository.create({
      ...data,
      organizationId: context.organizationId,
    } as DeepPartial<T>);

    try {
      return await this.repository.save(entity);
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  async updateScoped(
    context: RequestContext,
    where: FindOptionsWhere<T>,
    patch: DeepPartial<T>,
  ): Promise<T | null> {
    const current = await this.findOneScoped(context, where);

    if (current === null) {
      return null;
    }

    const merged = this.repository.merge(current, {
      ...patch,
      organizationId: context.organizationId,
    });

    try {
      return await this.repository.save(merged);
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  /**
   * Escrita atomica de registro, resposta e itens (RF009). O callback recebe o
   * EntityManager da transacao e continua responsavel por filtrar a organizacao.
   */
  async runInTransaction<R>(
    work: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    try {
      return await this.repository.manager.transaction(work);
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }
}

# Banco de dados e migrations

Convencoes decididas em 2026-09-17, registradas no vault em
`14-decisoes-tecnicas/vitacare-decisao-convencoes-backend.md`.

O PostgreSQL e **externo**: `synchronize: false` e `migrationsRun: false` sao
intencionais e nao devem ser alterados. Toda mudanca de schema passa por
migration explicita.

## Processo

1. **Nome:** `<timestamp>-<VerboObjeto>.ts`, ex. `1758042000000-CreateOrganizationAndUser.ts`.
   Uma migration por fatia funcional do backlog, nao uma por tabela.
2. `npm run migration:generate` produz o **rascunho**. O arquivo e sempre lido e
   ajustado antes do commit: o TypeORM erra em `CHECK`, indice parcial,
   `ON DELETE` e FK composta.
3. **`down` sempre funcional**, validado com `npm run migration:revert` em base
   descartavel.
4. **Migration ja aplicada em ambiente compartilhado nunca e editada.** Correcao
   entra como migration nova.
5. Nenhuma migration roda em base real sem validacao previa em ambiente
   controlado. Execucao nao e declarada sem evidencia.

A CLI TypeORM em TypeScript pre-carrega `tsconfig-paths/register` para resolver
os imports `@/` das entidades. `tsconfig-paths` e dependencia de desenvolvimento;
a migration de producao usa o build em `dist/`. Validar `migration:show`,
`migration:run` e `migration:revert` somente em banco descartavel antes de
aplicar qualquer migration no ambiente alvo.

```bash
npm run migration:create -- src/database/migrations/CreateAlgo
npm run migration:generate -- src/database/migrations/CreateAlgo
npm run migration:show
npm run migration:run
npm run migration:revert
```

## Nomenclatura

`SnakeNamingStrategy` (em `snakeNaming.strategy.ts`) mantem o codigo em
`camelCase` e o banco em `snake_case`, sem repetir `name:` em cada `@Column`.
Escrita a mao para nao adicionar dependencia. `organizationId` vira
`organization_id` automaticamente.

## Tipos fisicos

Fecha as pendencias P13 e P14. **Nao copiar os tipos do MER para o PostgreSQL.**

| Uso | Tipo | Motivo |
| --- | --- | --- |
| Chave primaria | `uuid` com `gen_random_uuid()` | Nao revela volume entre tenants. Nativo no PostgreSQL 13+. |
| Data e hora | `timestamptz` | Substitui `DATETIME` e os `INT` de timestamp do MER. |
| Data sem hora | `date` | Nascimento, vigencia. |
| Dinheiro | `numeric(12,2)` | `INT` do MER perde centavos. |
| Dose e valor clinico | `numeric(10,3)` + coluna de unidade | `INT` do MER nao representa 2,5 mg. |
| Status e opcoes | `varchar` + `CHECK` | Aceita valor novo sem `ALTER TYPE` travando a tabela. Substitui os `ENUM` vazios do MER. |
| E-mail | `citext` + indice unico | Resolve case-insensitive no banco. |
| Texto livre | `text` | `VARCHAR` sem tamanho do MER nao tem vantagem no PostgreSQL. |
| Autoria e datas | `created_at`/`updated_at` `timestamptz` + `created_by`/`updated_by` `uuid` | Autoria vem da sessao, nunca do corpo da requisicao. |
| Exclusao logica | `deleted_at timestamptz` nulo em toda tabela | Convencao de Mateus em 2026-09-18; substitui `deactivated_at`. |

`citext` exige `CREATE EXTENSION IF NOT EXISTS citext` na primeira migration que
o usar, e o `down` dessa migration **nao** remove a extensao.
`gen_random_uuid()` e nativo a partir do PostgreSQL 13 e dispensa `pgcrypto`.
`deleted_at` e coluna comum nas entidades (`deletedAt`), sem filtro automatico
do TypeORM. Organizacoes e usuarios vinculam a coluna ao status `inactive`
por `CHECK`; os demais dominios definirao suas regras de exclusao e leitura
quando forem implementados. Preservar historico e autorizacao continua sendo
responsabilidade dos casos de uso e repositorios.

## Isolamento entre organizacoes no schema

Fecha a pendencia P16. Alem do `TenantScopedRepository` na aplicacao, o banco
impede referencia cruzada:

- Tabela pai recebe `UNIQUE (id, organization_id)` alem da PK.
- Tabela filha carrega `organization_id` e usa **FK composta**:
  `(patient_id, organization_id) -> patients (id, organization_id)`.

Assim um registro da organizacao A referenciando paciente da organizacao B e
rejeitado pelo banco, nao pela aplicacao. O `organization_id` redundante nas
filhas e o custo aceito por essa garantia.

## Primeira migration de identidade e auditoria

`migrations/1789674300000-CreateInitialIdentitySchema.ts` cria `usage_plans`,
`organizations`, `access_profiles`, `permissions`, `profile_permissions`,
`users` e `audit_events`. O mapeamento TypeORM fica em
`src/modules/{Plan,Organization,Access,User,Audit}/entities/`. Nao ha endpoints
nem dados iniciais de planos, perfis ou permissoes nesta fatia.

As FKs compostas de usuario/perfil, perfil/permissao e auditoria/ator impedem
referencias a outra organizacao no PostgreSQL. `permissions` e catalogo global;
as concessoes pertencem ao perfil de uma organizacao. Os testes em
`test/initialSchema.e2e-spec.ts` usam PostgreSQL **descartavel** e exigem
`VITACARE_TEST_DATABASE_URL` apontando para `vitacare_schema_test` em
`localhost`/`127.0.0.1`, sem tabela `organizations` preexistente.

`organizations.usage_plan_id` e obrigatorio e referencia `usage_plans.id` com
`ON DELETE RESTRICT`. A tabela de planos oferece somente a estrutura fisica do
catalogo; ofertas, vigencia, troca e aplicacao dos limites continuam pendentes.
`users.cpf` e obrigatorio, armazena 11 digitos e e unico por organizacao;
o banco verifica o formato, nao os digitos verificadores. E-mail de usuario
tambem e unico por organizacao. `organizations.legal_name` e a razao social
opcional. `organizations.document` continua opcional e tem unicidade global
apos converter letras para maiusculas e remover caracteres nao alfanumericos,
inclusive para linhas com `deleted_at` preenchido. Essas escolhas foram
confirmadas por Mateus em 2026-09-18; descoberta do tenant no login e validacao
completa do CPF pertencem aos casos de uso futuros. Esta fatia nao inclui
campos de formulario. P17 bloqueia a futura modelagem de formularios, nao
estas sete tabelas. Ver
`09-sistemas/vitacare/dados/vitacare-comparacao-der-mer.md` e
`vitacare-integridade-dados.md` no vault.

**Auditoria:** `before_values` e `after_values` aceitam apenas objetos JSON;
isso nao mascara dados automaticamente. O caso de uso de gravacao deve usar
lista de campos permitidos e excluir senhas, tokens e dados clinicos
desnecessarios antes de inserir o evento. A tabela existe, mas a gravacao e a
consulta de auditoria ainda dependem dos respectivos modulos.

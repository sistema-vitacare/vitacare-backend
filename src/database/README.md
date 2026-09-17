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
| Inativacao | `deactivated_at timestamptz` nulo | Inativacao preserva registro e historico; nao e `DELETE`. |

`citext` exige `CREATE EXTENSION IF NOT EXISTS citext` na primeira migration que
o usar, e o `down` dessa migration **nao** remove a extensao.
`gen_random_uuid()` e nativo a partir do PostgreSQL 13 e dispensa `pgcrypto`.

## Isolamento entre organizacoes no schema

Fecha a pendencia P16. Alem do `TenantScopedRepository` na aplicacao, o banco
impede referencia cruzada:

- Tabela pai recebe `UNIQUE (id, organization_id)` alem da PK.
- Tabela filha carrega `organization_id` e usa **FK composta**:
  `(patient_id, organization_id) -> patients (id, organization_id)`.

Assim um registro da organizacao A referenciando paciente da organizacao B e
rejeitado pelo banco, nao pela aplicacao. O `organization_id` redundante nas
filhas e o custo aceito por essa garantia.

## Antes da primeira migration

**P15** (chave fisica e unicidade) e **P17** (versao de formulario,
aplicabilidade e frequencia) continuam abertos no vault e ainda bloqueiam o
schema inicial. Conferir `09-sistemas/vitacare/dados/vitacare-comparacao-der-mer.md`
e `vitacare-integridade-dados.md` antes de criar qualquer tabela. DER, MER e
prototipos divergem em campos, FKs, nulabilidade e tipos: nao criar tabela por
suposicao.

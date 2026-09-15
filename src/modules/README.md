# Modulos de dominio

Cada dominio de negocio vira um modulo isolado aqui. Leia `AGENTS.md` (ou
`CLAUDE.md`) antes de implementar: o backlog do VitaCare prefere operacoes
explicitas em `*.useCase.ts`. Crie apenas as pastas e camadas necessarias ao
fluxo, sem gerar arquivos vazios para seguir um modelo fixo.

```
src/modules/<dominio>/
├── dto/                        # entrada e saida da API (class-validator + swagger)
├── entities/<x>.entity.ts      # mapeamento TypeORM (o glob de entidades usa *.entity.ts)
├── <dominio>.controller.ts     # apenas HTTP: rotas, status, documentacao
├── use-cases/<Operacao>.useCase.ts # regras e operacoes do dominio
├── <dominio>.service.ts        # opcional: orquestracao ou integracao reutilizavel
└── <dominio>.module.ts         # TypeOrmModule.forFeature([...]) e providers
```

Regras:

- O controller nao acessa repositorio direto nem concentra regra de negocio;
  ele chama o use case ou, quando fizer sentido, um service de orquestracao.
- Entidades so sao registradas via `TypeOrmModule.forFeature([...])` no modulo
  do dominio (`autoLoadEntities` cuida do resto).
- Toda alteracao de schema entra como migration em `src/database/migrations`.
  Nunca use `synchronize`.
- Toda consulta e escrita de pacientes deve respeitar organizacao, perfil e
  vinculo autorizado, inclusive historico, anexos, agregados e jobs.
- Filas: importe `BullModule.registerQueue({ name: '...' })` no modulo e declare
  o processor com `@Processor('...')`.
- Importe utilitarios compartilhados por alias: `import { PaginationQueryDto } from '@/common'`.

Gere o esqueleto com a CLI do Nest:

```bash
npx nest g module modules/pacientes
npx nest g controller modules/pacientes --flat
npx nest g service modules/pacientes --flat # apenas se um service for util
```

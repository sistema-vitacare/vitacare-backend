# Modulos de dominio

Cada dominio de negocio vira um modulo isolado aqui. Estrutura esperada:

```
src/modules/<dominio>/
├── dto/                        # entrada e saida da API (class-validator + swagger)
├── entities/<x>.entity.ts      # mapeamento TypeORM (o glob de entidades usa *.entity.ts)
├── <dominio>.controller.ts     # apenas HTTP: rotas, status, documentacao
├── <dominio>.service.ts        # regra de negocio
└── <dominio>.module.ts         # TypeOrmModule.forFeature([...]) e providers
```

Regras:

- O controller nao acessa repositorio direto; ele chama o service.
- Entidades so sao registradas via `TypeOrmModule.forFeature([...])` no modulo
  do dominio (`autoLoadEntities` cuida do resto).
- Toda alteracao de schema entra como migration em `src/database/migrations`.
  Nunca use `synchronize`.
- Filas: importe `BullModule.registerQueue({ name: '...' })` no modulo e declare
  o processor com `@Processor('...')`.
- Importe utilitarios compartilhados por alias: `import { PaginationQueryDto } from '@/common'`.

Gere o esqueleto com a CLI do Nest:

```bash
npx nest g module modules/pacientes
npx nest g controller modules/pacientes --flat
npx nest g service modules/pacientes --flat
```

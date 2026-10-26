# Modulos de dominio

Cada dominio de negocio vira um modulo isolado aqui. Leia `AGENTS.md` (ou
`CLAUDE.md`) antes de implementar. As convencoes abaixo foram decididas em
2026-09-17 e estao registradas no vault em
`14-decisoes-tecnicas/vitacare-decisao-convencoes-backend.md`.

## Estrutura

Modulo em **PascalCase e singular**. Pasta por caso de uso em **PascalCase**.
Arquivos em **camelCase** com sufixo de responsabilidade.

```
src/modules/
└── Patient/
    ├── patient.module.ts              # TypeOrmModule.forFeature + providers
    ├── patient.controller.ts          # todas as rotas do dominio
    ├── patient.errors.ts              # catalogo de codigos de erro do modulo
    ├── entities/patient.entity.ts
    ├── enums/patientStatus.enum.ts
    ├── repositories/patient.repository.ts
    │
    ├── CreatePatient/
    │   ├── createPatient.useCase.ts
    │   ├── createPatient.dto.ts
    │   ├── createPatient.parser.ts
    │   ├── createPatient.type.ts
    │   └── createPatient.query.ts
    │
    ├── ListPatients/
    ├── UpdatePatient/
    └── DeactivatePatient/
```

| Sufixo | Papel | Restricao |
| --- | --- | --- |
| `*.useCase.ts` | A regra de negocio. Classe `XUseCase` com `execute(input, ctx)`. | Nao conhece HTTP. Nao injeta `Repository<T>`. |
| `*.controller.ts` | HTTP: rota, status, Swagger, DTO. | Nenhuma regra de dominio, nenhum acesso a repositorio. |
| `*.dto.ts` | Fronteira HTTP. `class-validator` + `@ApiProperty`. | Nunca e entidade. |
| `*.type.ts` | Tipos internos do caso de uso (`Input`, `Result`). | Sem decorator. |
| `*.parser.ts` | Conversao DTO <-> dominio <-> response. Funcoes puras. | Sem I/O, sem injecao. |
| `*.query.ts` | Consultas TypeORM isoladas. | Sempre escopada por organizacao. |
| `*.entity.ts` | Mapeamento TypeORM. O glob `**/*.entity.{ts,js}` ja as encontra. | Registrada via `TypeOrmModule.forFeature([...])`. |
| `*.errors.ts` | Catalogo congelado de codigos do modulo. | Consumido pelo Swagger e por `docs/api/`. |
| `*.service.ts` | Opcional: orquestracao ou integracao reutilizavel. | So quando for camada util de verdade. |

Nenhum `*.spec.ts` mora em `src/`. Ver "Testes" abaixo.

## Regras

1. **Arquivo vira pasta quando passa de um.** `createPatient.parser.ts` ->
   `parsers/createPatient.request.parser.ts` + `parsers/createPatient.response.parser.ts`.
   Nao criar pasta com um arquivo so, nem arquivo vazio para seguir modelo.
2. **Controller mora no modulo, nao no caso de uso.** O mapa de rotas do dominio
   fica legivel num arquivo so.
3. **Rota no plural, pasta no singular.** Modulo `Patient`, rota `/api/v1/patients`.
4. **O nome do caso de uso descreve a acao.** Listagem no plural (`ListPatients`);
   as demais no singular do recurso (`CreatePatient`, `DeactivatePatient`).
5. **Nada compartilhado entre casos de uso fica dentro da pasta de um deles.**
   Sobe para `entities/`, `enums/`, `repositories/`, `parsers/` ou `types/`.

## Testes

**Convencao alterada em 2026-09-22:** teste nao fica ao lado do codigo. Todo
arquivo de teste vive em `tests/`, na raiz do repositorio, em uma pasta por area
de `src/`. Dentro da pasta os arquivos sao planos — a pasta por caso de uso
existe em `src/`, nao em `tests/`.

```
tests/
├── jest-e2e.json                       # config da camada e2e
├── app/app.e2e-spec.ts                 # pipeline HTTP transversal
├── common/*.spec.ts                    # envelope, erros, contexto, validacao
├── database/                           # estrategia de nomes e schema
│   ├── snakeNaming.strategy.spec.ts
│   └── initialSchema.e2e-spec.ts
├── health/ e redis/                    # infraestrutura
└── modules/
    └── Patient/
        ├── createPatient.useCase.spec.ts
        ├── patient.repository.spec.ts
        └── patient.e2e-spec.ts
```

- O nome do arquivo repete o do alvo mais `.spec.ts`; o sufixo de
  responsabilidade (`.useCase`, `.repository`, `.guard`) ja desambigua.
- `*.e2e-spec.ts` roda por `npm run test:e2e`; os demais por `npm test`. A
  separacao e por sufixo, nao por pasta.
- Teste importa producao **sempre pelo alias `@/`**; caminho relativo para
  `src/` quebra assim que o arquivo muda de pasta.
- Teste que exige PostgreSQL descartavel fica atras de
  `VITACARE_TEST_DATABASE_URL` e **pula** quando a variavel nao existe.

## Isolamento por organizacao

`organizationId` vem **sempre** do contexto autenticado, nunca do corpo, da query
ou de um parametro de rota.

```ts
@Post()
create(@Body() dto: CreatePatientDto, @CurrentContext() ctx: RequestContext) {
  return this.createPatient.execute(dto, ctx);   // o controller so faz isso
}
```

- Nenhum caso de uso injeta `Repository<T>`. So `TenantScopedRepository<T>`.
  `@InjectRepository` fora de `repositories/` e bloqueado por regra de ESLint.
- Registro de outra organizacao responde **404**, nunca 403: nao revelar que o
  recurso existe em outro tenant.
- Autorizacao vale em listagem, detalhe, escrita, filtros, agregados,
  exportacoes, arquivos, notificacoes e jobs. Job de fila reconstroi o
  `RequestContext` e passa pelo mesmo repositorio escopado.
- Teste com **duas organizacoes** e criterio de conclusao de todo modulo.

## DTO, type e parser

1. **Entidade nunca sai pela API.** Toda resposta passa por um response parser.
   E o que impede vazar `passwordHash`, identificador interno ou campo clinico.
2. **O parser de resposta recebe o `ctx`.** E onde a visao simplificada e
   somente-leitura do familiar (RF016, UC14) e aplicada.

```ts
export const toPatientResponse = (
  patient: Patient,
  ctx: RequestContext,
): PatientResponseDto => ({
  id: patient.id,
  fullName: patient.fullName,
  ...(ctx.profile === ProfileCode.FAMILY
    ? {}
    : { document: maskDocument(patient.document), notes: patient.notes }),
});
```

## Erros

`try/catch` existe **somente** nas bordas de I/O: `TenantScopedRepository` e
integracoes (S3, e-mail, fila). O caso de uso lanca `DomainException` tipada e
deixa subir. Isso evita erro aninhado, preserva o stack e mantem codigos
especificos em vez de `*_FAILED` genericos.

```ts
throw new DomainException({
  code: PatientErrors.DUPLICATE_DOCUMENT,      // de patient.errors.ts
  status: HttpStatus.CONFLICT,
  message: 'Ja existe um paciente com este documento.',  // amigavel
  detail: 'Documento duplicado na organizacao atual.',   // tecnico, escrito por nos
  fields: [{ field: 'document', code: 'DUPLICATE' }],
});
```

O `detail` nunca carrega stack, mensagem crua de driver, valor de campo clinico
ou de identidade.

## Swagger

Toda rota declara `@ApiEnvelope(Dto)` e `@ApiErrors(...)`. Sem eles o OpenAPI
publica o DTO **sem** o envelope e a documentacao deixa de descrever o
comportamento real.

## Outras regras

- Toda alteracao de schema entra como migration em `src/database/migrations`.
  Ver `src/database/README.md`. Nunca use `synchronize`.
- Toda entidade/tabela inclui `deletedAt`/`deleted_at timestamptz` anulavel;
  nao usar `deactivatedAt`/`deactivated_at`. A coluna nao aplica filtro
  automatico: o caso de uso e o repositorio definem leitura e revogacao.
- Filas: importe `BullModule.registerQueue({ name: '...' })` no modulo e declare
  o processor com `@Processor('...')`.
- Importe utilitarios compartilhados por alias: `import { PaginationQueryDto } from '@/common'`.

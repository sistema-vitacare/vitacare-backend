# BE-32 Termo de uso e aceite obrigatório — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** publicar o termo de uso e privacidade versionado (JSON e página
`/termos`), bloquear com `403 TERMS_ACCEPTANCE_REQUIRED` quem não aceitou a
versão vigente e guardar um aceite imutável e consultável.

**Architecture:** módulo novo `src/modules/Terms/` com duas tabelas globais e
imutáveis por trigger: `terms_versions` e `terms_acceptances`, esta última com
`organization_id`. O guard global recebe `termsAccepted` da mesma consulta que
valida a sessão, e só as rotas marcadas com `@AllowPendingTerms()` passam sem
o aceite. O login e o bloco de sessão do BE-27 ganham o estado e o bloco
`terms`.

**Tech Stack:** NestJS 11, TypeORM (SQL cru nos repositórios), PostgreSQL
(`sha256()`, `inet`, trigger), Jest e supertest.

**Spec:** `docs/superpowers/specs/2026-11-13-be-32-termo-de-uso-design.md`

## Global Constraints

- **Branch:** `feature/terms-of-use`, sem merge. Commitar por tarefa,
  terminando a mensagem com
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Migrations:**
  - `1792200000000-CreateTermsOfUse`: estrutura, sem dados;
  - `1792200000001-PublishTermsOfUseV1`: texto da versão 1, como constante.
- **Arquivo do termo:** `docs/termos/termo-de-uso-v1.md`, com o texto aprovado
  no scratchpad. Usa UTF-8, LF e o subconjunto `#`, `##`, parágrafos, `-`,
  `1.` e `**`. Não tem contato, `[a preencher]` nem menção a HTTPS.
- **Hash:** SHA-256 em hex minúsculo do conteúdo exato do arquivo.
- **Erros:**
  - `TERMS_ACCEPTANCE_REQUIRED` 403, em `AuthErrors`;
  - `TERMS_VERSION_NOT_CURRENT` 422;
  - `TERMS_VERSION_NOT_FOUND` 404;
  - `TERMS_NOT_PUBLISHED` 404.
- **Auditoria:** ação `terms.accepted`, rótulo "Aceitou o termo de uso",
  gravidade `normal`. `entityType` é `terms_version`, e `afterValues` é
  `{ version }`.
- **`user_agent`:** no máximo 512 caracteres, sem caracteres de controle
  (`\p{Cc}`). Vazio vira `null`.
- **Rotas liberadas sem aceite:** `POST /auth/logout`, `GET /profile`,
  `POST /terms/acceptances` e `GET /terms/acceptances/me`.
- **Página:** `GET /termos`, fora do prefixo, da versão, do envelope e do
  OpenAPI, e sempre pública. `?versao=N` mostra uma versão anterior.
- **Consulta da organização:** `audit_events:read`. Para o master, o nome de
  usuário de outra organização sai mascarado com `maskPersonName`.
- **Comandos de validação:**
  - `npm run lint`;
  - `npm run build`;
  - `npm test -- --runInBand`;
  - `VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand`.
- **Documentação:** toda rota nova tem nota em `docs/api/endpoints/` com
  frontmatter `method`/`path` e uma linha no índice `docs/api/README.md`.

## Review Focus

1. **Sessão aberta quando sai a versão 2:** a requisição seguinte recebe
   `403`, e o aceite da 2 libera. Teste: Task 6, caso "versão nova".
2. **`?versao=abc`, `?versao=0` e `?versao=99` na página:** respondem HTML
   `404`, nunca JSON nem `500`. Teste: Task 3.
3. **Texto do termo com `<`, `&` e aspas:** sai escapado na página, sem tag
   crua. Teste: Task 2.
4. **User agent ausente, vazio ou com 2.000 caracteres e quebras de linha:**
   grava `null`, ou o texto truncado e limpo. Teste: Task 5 (unitário) e
   Task 6.
5. **Dois aceites simultâneos da mesma versão:** uma linha só e uma auditoria
   só. Teste: Task 6, com `Promise.all`.

---

### Task 1: Termo no repositório, schema e migrations

**Files:**
- Create: `docs/termos/termo-de-uso-v1.md`, copiado do texto aprovado no
  scratchpad.
- Create: `src/database/migrations/1792200000000-CreateTermsOfUse.ts`
- Create: `src/database/migrations/1792200000001-PublishTermsOfUseV1.ts`
- Create: `src/modules/Terms/entities/termsVersion.entity.ts` e
  `termsAcceptance.entity.ts`.
- Modify: `tests/modules/Automation/automation.fixtures.ts` (`ALL_MIGRATIONS`,
  só a `CreateTermsOfUse`) e as listas próprias das suítes que passam pelo
  `AuthGuard`:
  - `followUpManagement`, `alertManagement`, `attachmentManagement`,
    `medicationManagement`, `accessControl`, `formManagement` e
    `patientManagement`;
  - `userManagement`, `planManagement`, `patientAccessManagement` e
    `organizationSchema`;
  - `userInvitationSchema`;
  - `tests/modules/Auth/authSchema.e2e-spec.ts` (contagem 21).
- Test: `tests/modules/Terms/termsSchema.e2e-spec.ts` e
  `tests/modules/Terms/termsContent.spec.ts`.

**Interfaces:**
- **Produces:**
  - tabelas `terms_versions` e `terms_acceptances`, com as colunas do item 5.1
    da spec;
  - `TERMS_V1_CONTENT: string` e `TERMS_V1_HASH: string`, exportados da
    migration de publicação;
  - título da versão 1: `'Termo de Uso e Privacidade do VitaCare'`.

- [ ] **Step 1: testes que falham.** Em `termsContent.spec.ts`, ler o arquivo
  `docs/termos/termo-de-uso-v1.md` e conferir:
  - o conteúdo é igual a `TERMS_V1_CONTENT`;
  - o SHA-256 do arquivo é igual a `TERMS_V1_HASH`;
  - o arquivo não tem `\r`, `[a preencher]` nem `HTTPS`.

  O `termsSchema.e2e-spec.ts` segue o molde do `auditSchema.e2e-spec.ts` e
  confere:
  - `up` das duas;
  - a versão 1 existe, com o hash certo;
  - `INSERT` com hash errado viola `terms_versions_hash_check`;
  - `UPDATE` e `DELETE` são recusados, com `restrict_violation`, nas duas
    tabelas;
  - aceite duplicado viola `terms_acceptances_user_version_unique`;
  - FK composta: usuário de outra organização é recusado;
  - o `down` da publicação, com aceite gravado, lança erro com a mensagem
    `'terms version 1 already accepted'`;
  - `down`, `down` e `up` voltam ao estado limpo.
- [ ] **Step 2: rodar.** `npm test -- tests/modules/Terms/termsContent.spec.ts`
  e o e2e do schema. Os dois devem falhar, com módulo ausente.
- [ ] **Step 3: implementar as migrations.**
  - Triggers `terms_versions_immutable` e `terms_acceptances_immutable` usam
    funções próprias que fazem
    `RAISE EXCEPTION ... USING ERRCODE = 'restrict_violation'`, como em
    `1791700000000-AuditEventQuery.ts`.
  - A publicação faz um `INSERT` com `published_at = now()`. O `down` dela
    primeiro confere se há aceite (`SELECT 1 ... LIMIT 1`). Depois, dentro
    da transação da migration, faz
    `ALTER TABLE terms_versions DISABLE TRIGGER terms_versions_immutable`,
    `DELETE WHERE version = 1` e `ENABLE TRIGGER`.
  - As entidades só registram as tabelas; os acessos são SQL nos
    repositórios.
- [ ] **Step 4: rodar de novo.** Os dois devem passar, e o `authSchema` e as
  suítes listadas continuam verdes.
- [ ] **Step 5: commit.** `feat(terms): tabelas imutaveis do termo e publicacao da versao 1 (BE-32)`

### Task 2: Conversor do Markdown do termo

**Files:**
- Create: `src/modules/Terms/policies/termsMarkdown.policy.ts`
- Test: `tests/modules/Terms/termsMarkdown.policy.spec.ts`

**Interfaces:**
- **Produces:** `renderTermsMarkdown(markdown: string): string`, que devolve
  um fragmento HTML sem `<html>`.

- [ ] **Step 1: testes.**
  - `# T` vira `<h1>T</h1>`, e `## S` vira `<h2>S</h2>`.
  - Linhas seguidas viram um `<p>`, e uma linha em branco separa parágrafos.
  - `- a` vira `<ul><li>a</li></ul>`, e `1. a` vira `<ol><li>a</li></ol>`.
  - `**x**` vira `<strong>x</strong>`.
  - `<script>&"'` vira `&lt;script&gt;&amp;&quot;&#39;`.
  - O arquivo v1 inteiro renderiza sem `**` nem `<script` no resultado.
- [ ] **Step 2: rodar.** Deve falhar.
- [ ] **Step 3: implementar.** Escapar a linha inteira primeiro e só depois
  aplicar `**` → `<strong>`. Os blocos são processados por linha, com um
  estado de lista aberta.
- [ ] **Step 4: rodar.** Deve passar.
- [ ] **Step 5: commit.** `feat(terms): conversor do markdown do termo para HTML escapado (BE-32)`

### Task 3: Leitura pública (JSON e página `/termos`)

**Files:**
- Create: `src/modules/Terms/terms.module.ts`, `terms.controller.ts`,
  `termsPage.controller.ts` e `terms.errors.ts`.
- Create: `src/modules/Terms/repositories/termsVersion.repository.ts`
- Create: `src/modules/Terms/GetCurrentTerms/getCurrentTerms.useCase.ts`
- Create: `src/modules/Terms/GetTermsVersion/getTermsVersion.useCase.ts`
- Create: `src/modules/Terms/dtos/termsVersion.dto.ts` e
  `parsers/termsVersion.parser.ts`.
- Create: `src/modules/Terms/services/termsPage.renderer.ts`
- Modify: `src/app.module.ts`, para registrar o `TermsModule`.
- Modify: `src/app.setup.ts`:
  - `exclude` do prefixo ganha `{ path: 'termos', method: GET }`;
  - `excludedPaths` ganha `'/termos'`.
- Test: `tests/modules/Terms/termsPage.renderer.spec.ts` e
  `tests/modules/Terms/termsRead.e2e-spec.ts`.

**Interfaces:**
- **Consumes:** `renderTermsMarkdown`.
- **Produces:**
  - `TermsVersionRepository.findCurrent(): Promise<TermsVersionRow | null>`;
  - `TermsVersionRepository.findByVersion(v: number): Promise<TermsVersionRow | null>`;
  - `TermsVersionRow = { id, version, title, content, contentHash, publishedAt: Date }`;
  - `TermsVersionDto = { version, title, content, contentHash, publishedAt: string, pageUrl: string }`,
    com `pageUrl` igual a `/termos?versao=N`;
  - `renderTermsPage(row: TermsVersionRow | null): string`, a página completa.

- [ ] **Step 1: testes.**
  - **Renderer:**
    - tem `<!doctype html>` e `lang="pt-BR"`;
    - tem o título, a versão e a data de publicação em
      `America/Sao_Paulo` (`dd/mm/aaaa`);
    - não tem `<script`;
    - com `null`, mostra "Termo ainda não publicado".
  - **e2e** (app mínimo com `TermsModule`, `setupApp` e as duas migrations;
    usar o molde de `tests/modules/Audit/audit.e2e-spec.ts`):
    - `GET /api/v1/terms/current` responde `200` com o envelope e o
      `contentHash` igual a `TERMS_V1_HASH`;
    - `GET /api/v1/terms/versions/1` responde `200`, e `/versions/2`
      responde `404 TERMS_VERSION_NOT_FOUND`;
    - `GET /termos` e `GET /termos?versao=1` respondem `200`, com
      `text/html; charset=utf-8`, `Cache-Control: no-cache` e um trecho do
      texto;
    - `GET /termos?versao=abc|0|99` responde HTML `404`;
    - nenhuma dessas rotas exige token;
    - sem a migration de publicação, `GET /api/v1/terms/current` responde
      `404 TERMS_NOT_PUBLISHED`.
- [ ] **Step 2: rodar.** Deve falhar.
- [ ] **Step 3: implementar.**
  - **`TermsPageController`:** `@Controller({ path: 'termos', version: VERSION_NEUTRAL })`,
    com `@Public()`, `@ApiExcludeController()`, `@Res()` e
    `res.status(...).type('html').send(...)`. A query `versao` é lida como
    string e validada à mão (`/^[1-9]\d{0,5}$/`), para nunca virar `422`
    JSON.
  - **Controller da API:**
    - `@ApiTags('terms')`, `@Public()`, `@ApiEnvelope(TermsVersionDto)` e
      `@ApiErrors`;
    - o parâmetro de versão usa `ParseIntPipe`, e um erro dele vira `422`
      pelo filtro.
- [ ] **Step 4: rodar.** Deve passar.
- [ ] **Step 5: commit.** `feat(terms): termo vigente em JSON e pagina publica /termos (BE-32)`

### Task 4: Bloqueio no guard, estado do login e bloco `terms` da sessão

**Files:**
- Modify: `src/modules/Auth/types/auth.types.ts`:
  - `AuthenticatedPrincipal` ganha `termsAccepted: boolean`;
  - `SessionProfileRow` ganha `terms: { currentVersion: number | null; acceptedVersion: number | null }`.
- Modify: `src/modules/Auth/repositories/authSession.repository.ts`, para que
  `resolve` devolva `termsAccepted`, pela expressão do item 6 da spec.
- Modify: `src/modules/Auth/repositories/authIdentity.repository.ts`, para que
  `findSessionProfile` leia `currentVersion` (`max(version)`) e
  `acceptedVersion` (a maior versão aceita pelo usuário).
- Modify: `src/modules/Auth/guards/public.decorator.ts`: `ALLOW_PENDING_TERMS_KEY`
  e `AllowPendingTerms()`.
- Modify: `src/modules/Auth/guards/auth.guard.ts`: depois da checagem do tipo
  de sessão, se `sessionType === 'normal'`, `termsAccepted === false` e a rota
  não tiver o metadata, lança
  `DomainException({ ...AuthErrors.TERMS_ACCEPTANCE_REQUIRED })`.
- Modify: `src/modules/Auth/auth.errors.ts`: `TERMS_ACCEPTANCE_REQUIRED`
  (403), com a mensagem "Aceite o termo de uso para continuar."
- Modify: `src/modules/Auth/dtos/sessionProfile.dto.ts`:
  `SessionTermsDto { required: boolean; currentVersion: number | null; acceptedVersion: number | null }`
  e o campo `terms`.
- Modify: `src/modules/Auth/parsers/sessionProfile.parser.ts`:
  - `terms.required = currentVersion !== null && acceptedVersion !== currentVersion`;
  - `permissions` sai `[]` quando `restricted` ou `terms.required`.
- Modify: `src/modules/Auth/Login/login.useCase.ts` e `login.dto.ts`:
  - `state` passa a ser
    `'authenticated' | 'password_change_required' | 'terms_acceptance_required'`;
  - a ordem é `password_change` → `terms.required` → `authenticated`.
- Modify: `src/modules/Auth/auth.controller.ts`: `logout` com
  `@AllowPendingTerms()`.
- Modify: `src/modules/Profile/profile.controller.ts`: `GET /profile` com
  `@AllowPendingTerms()`.
- Modify: `src/app.setup.ts`: a descrição do esquema Bearer cita
  `403 TERMS_ACCEPTANCE_REQUIRED`.
- Modify: os mocks de `AuthenticatedPrincipal` e `SessionProfileRow` nos
  testes que deixarem de compilar. Ponha `termsAccepted: true` e
  `terms: { currentVersion: null, acceptedVersion: null }`.
- Test: `tests/modules/Auth/authGuard.spec.ts`, o existente ou um novo,
  `tests/modules/Auth/sessionProfile.parser.spec.ts` e
  `tests/modules/Auth/login.useCase.spec.ts`.

**Interfaces:**
- **Produces:**
  - `AllowPendingTerms(): ReturnType<typeof SetMetadata>`;
  - `AuthErrors.TERMS_ACCEPTANCE_REQUIRED`;
  - `SessionProfileDto.terms`;
  - `LoginResult.state` com o valor novo.

- [ ] **Step 1: testes.**
  - **Guard:**
    - sessão normal, `termsAccepted: false` e rota sem marca: lança
      `TERMS_ACCEPTANCE_REQUIRED`, com status 403;
    - rota com `AllowPendingTerms`: passa;
    - `@Public()`: passa sem consultar a sessão;
    - sessão `password_change` numa rota liberada para ela (first-access):
      passa, mesmo com `termsAccepted: false`.
  - **Parser:**
    - `{ currentVersion: 1, acceptedVersion: null }` dá `required: true` e
      `permissions: []`;
    - `{1, 1}` dá `required: false` e as permissões ordenadas;
    - `{null, null}` dá `required: false`.
  - **Login:** a sessão normal com termo pendente sai com
    `state: 'terms_acceptance_required'` e com `idleTimeoutSeconds`.
- [ ] **Step 2: rodar.** Deve falhar.
- [ ] **Step 3: implementar** o que a lista de arquivos descreve.
- [ ] **Step 4: rodar.** `npm test -- --runInBand` e `npm run build` devem
  passar.
- [ ] **Step 5: commit.** `feat(auth): sessao sem aceite do termo vigente so le, aceita e sai (BE-32)`

### Task 5: Registro e consulta dos aceites

**Files:**
- Create: `src/modules/Terms/repositories/termsAcceptance.repository.ts`
- Create: `src/modules/Terms/AcceptTerms/acceptTerms.useCase.ts` e
  `acceptTerms.dto.ts`.
- Create: `src/modules/Terms/ListOwnTermsAcceptances/listOwnTermsAcceptances.useCase.ts`
- Create: `src/modules/Terms/ListTermsAcceptances/listTermsAcceptances.useCase.ts`
  e `listTermsAcceptances.dto.ts`.
- Create: `src/modules/Terms/policies/userAgent.policy.ts`
- Create: `src/modules/Terms/dtos/termsAcceptance.dto.ts` e
  `parsers/termsAcceptance.parser.ts`.
- Modify: `src/modules/Terms/terms.controller.ts` e `terms.errors.ts`.
- Modify: `src/modules/Audit/policies/auditCatalog.policy.ts`, para incluir
  `terms.accepted`.
- Test: `tests/modules/Terms/userAgent.policy.spec.ts`,
  `tests/modules/Terms/acceptTerms.useCase.spec.ts` e
  `tests/modules/Audit/auditCatalog.policy.spec.ts` (se ele listar as ações).

**Interfaces:**
- **Consumes:**
  - `TermsVersionRepository.findCurrent`;
  - `insertAuditEvent`;
  - `currentRequestIp()`;
  - `resolveEvolutionPeriod` e `isPlatformContext`;
  - `maskPersonName`;
  - `paginate`.
- **Produces:**
  - `normalizeUserAgent(raw: string | undefined): string | null`;
  - `TermsAcceptanceRepository.accept(input: { ctx: RequestContext; version: number; userAgent: string | null }): Promise<{ row: TermsAcceptanceRow; created: boolean } | { notCurrent: number | null }>`.
    Faz tudo numa transação:
    1. `SELECT ... FOR SHARE` da vigente;
    2. compara a versão;
    3. `INSERT ... ON CONFLICT DO NOTHING RETURNING`, com `profile_code` lido
       por subconsulta;
    4. se inseriu, chama `insertAuditEvent`; se não inseriu, faz um `SELECT`
       da existente.
  - `TermsAcceptanceRepository.listOwn(userId, organizationId)`;
  - `TermsAcceptanceRepository.list(filter, offset, limit): Promise<[TermsAcceptanceListRow[], number]>`;
  - **Rotas:**
    - `POST /api/v1/terms/acceptances`, com `@HttpCode(200)` e
      `@AllowPendingTerms()`; o corpo é
      `{ version: number }` (`@IsInt() @Min(1)`), e a resposta é
      `TermsAcceptanceDto { id, version, contentHash, acceptedAt, alreadyAccepted }`;
    - `GET /api/v1/terms/acceptances/me`, com `@AllowPendingTerms()`; devolve
      `OwnTermsAcceptanceDto[]` (`version`, `contentHash`, `acceptedAt`);
    - `GET /api/v1/terms/acceptances`, com
      `@RequirePermissions(Permissions.AUDIT_EVENTS_READ)`. A query tem
      `page`, `limit`, `from`, `to`, `version`, `userId` e `organizationId`
      (este só para o master). O item é
      `{ id, organization: { id, name }, user: { id, name }, profileCode, version, contentHash, acceptedAt, ipAddress, userAgent, requestId }`,
      ordenado por `accepted_at DESC, id DESC`. Com lista vazia, sai
      `meta.message = 'Nenhum aceite do termo no período.'`.
  - `TermsErrors.VERSION_NOT_CURRENT` traz a vigente no `detail`.

- [ ] **Step 1: testes unitários.**
  - **`normalizeUserAgent`:**
    - `undefined` e `''` dão `null`;
    - 2.000 caracteres dão 512;
    - `"a\r\nb\u0000c"` dá `"abc"`.
  - **Use case:**
    - `notCurrent` vira `422 TERMS_VERSION_NOT_CURRENT`;
    - `created: false` sai com `alreadyAccepted: true`.
  - **Catálogo:** `terms.accepted` existe, com gravidade `normal`.
- [ ] **Step 2: rodar.** Deve falhar.
- [ ] **Step 3: implementar.** O user agent vem de `request.headers['user-agent']`
  no controller. O `organizationId` da consulta segue o
  `resolveAuditFilter`: o master usa o informado ou todas, e o admin, a
  própria.
- [ ] **Step 4: rodar.** Unitários, lint e build devem passar.
- [ ] **Step 5: commit.** `feat(terms): registro imutavel do aceite e consultas do proprio usuario e da organizacao (BE-32)`

### Task 6: e2e de ponta a ponta e fixture da app inteira

**Files:**
- Modify: `tests/app/fullApp.fixtures.ts`: `FullAppOptions.termsPublished?: boolean`,
  com padrão `true`. Com `false`, faz
  `TRUNCATE terms_versions CASCADE` depois das migrations.
- Modify: `tests/modules/Profile/profile.e2e-spec.ts` e
  `tests/modules/User/userInvitation.e2e-spec.ts`, que passam
  `{ termsPublished: false }`, porque testam as permissões do login.
- Create: `tests/modules/Terms/termsAcceptance.e2e-spec.ts` (`bootFullApp`).

**Interfaces:**
- **Consumes:** todas as rotas das Tasks 3 a 5.

- [ ] **Step 1: escrever o e2e.**
  1. **Master bloqueado:** depois do login, sai `terms_acceptance_required`
     com `permissions: []`. `GET /organizations` responde
     `403 TERMS_ACCEPTANCE_REQUIRED`. `GET /terms/acceptances/me` responde
     `200 []`, e `GET /profile` responde `200` com `terms.required: true`.
  2. **Aceite da versão errada:** `POST /terms/acceptances {version: 2}`
     responde `422 TERMS_VERSION_NOT_CURRENT`.
  3. **Aceite:** a versão 1 responde `200` com `alreadyAccepted: false`.
     A linha no banco tem:
     - `ip_address` não nulo;
     - `user_agent = 'vitacare-e2e/1.0'` (header enviado);
     - `profile_code = 'platform_admin'`;
     - `content_hash = TERMS_V1_HASH`;
     - `request_id` igual ao `meta.requestId`.

     Há um único evento `terms.accepted`. Depois disso,
     `GET /organizations` responde `200`.
  4. **Repetição:** dois `POST` em `Promise.all` respondem os dois `200`. Fica
     uma linha só, e o total de `terms.accepted` não muda.
  5. **Organizações A e B:** criar as duas pela HTTP. O primeiro admin de cada
     uma faz o primeiro acesso, o novo login sai `terms_acceptance_required`,
     e ele aceita. Depois, também um cuidador de A.
     - O admin de A em `GET /terms/acceptances` vê só os aceites de A, e
       com `organizationId` de B continua vendo só A.
     - O master vê A e B, com o nome do admin de B mascarado (`/\*/`) e o
       próprio nome completo.
     - O cuidador de A recebe `403 AUTH_FORBIDDEN` nessa rota.
  6. **Versão nova:** com uma sessão do admin de A aberta, inserir a versão 2
     direto no banco (`INSERT` com hash calculado). A próxima requisição
     dessa sessão responde `403 TERMS_ACCEPTANCE_REQUIRED`. O aceite da
     versão 2 libera. `GET /terms/acceptances/me` traz `[2, 1]`, e a linha da
     versão 1 continua lá.
  7. **Página e JSON** mostram o mesmo `title` e o mesmo texto da versão
     vigente.
- [ ] **Step 2: rodar.**
  `VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand tests/modules/Terms`.
  Deve passar. Se falhar, corrigir o código, não o teste.
- [ ] **Step 3: rodar as suítes da fixture.** `profile` e `userInvitation`
  devem continuar verdes.
- [ ] **Step 4: commit.** `test(terms): e2e do aceite obrigatorio com duas organizacoes, versao nova e concorrencia (BE-32)`

### Task 7: Homologação, contrato e scripts de operação

**Files:**
- Modify: `tests/app/homologation.e2e-spec.ts`:
  - o helper de login aceita o termo quando o estado é
    `terms_acceptance_required`;
  - um passo novo mostra bloqueio, aceite e liberação.
- Modify: `tests/app/apiContract.e2e-spec.ts`:
  - a página `/termos` entra na comparação entre o Express e as notas, mas
    fica fora do OpenAPI (como `/health/live`);
  - um caso novo confere que a descrição do Bearer contém
    `TERMS_ACCEPTANCE_REQUIRED`.
- Modify: `scripts/ops/lib/client.mjs`: `signIn(api, code, email, passwords, finalPassword, { acceptTerms = false } = {})`.
  - Com `terms_acceptance_required` e `acceptTerms`, faz `GET /terms/current`
    e `POST /terms/acceptances`.
  - Sem `acceptTerms`, lança `CheckFailed('a conta precisa aceitar o termo de uso pelo frontend antes do smoke')`.
    O modo `read` roda em produção e nunca aceita em nome de uma pessoa.
- Modify: `scripts/ops/smoke.mjs` (os modos `full` e `verify`, que já exigem
  `--allow-writes` ou dados sintéticos, passam `acceptTerms: true`) e
  `scripts/ops/load.mjs` (passa `acceptTerms: true`; a rajada informativa de
  login aceita os estados `200`).

- [ ] **Step 1: ajustar os testes e os scripts.**
- [ ] **Step 2: rodar.**
  `VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand tests/app`
  deve passar.
- [ ] **Step 3: rodar o smoke `full` local** contra a API do compose, se a
  infraestrutura local estiver disponível; senão, reportar que não rodou.
- [ ] **Step 4: commit.** `test(app): homologacao e contrato com o aceite do termo; scripts de operacao aceitam o termo (BE-32)`

### Task 8: Manual, deploy e instruções

**Files:**
- Create em `docs/api/endpoints/`:
  - `terms-vigente.md`;
  - `terms-versao.md`;
  - `terms-pagina.md` (`GET /termos`);
  - `terms-aceitar.md`;
  - `terms-meus-aceites.md`;
  - `terms-aceites-listar.md`.

  Todas seguem `docs/api/padrao-endpoint.md`.
- Modify: `docs/api/endpoints/auth-login.md`, `profile-consultar.md` (nome
  real a conferir) e `auth-logout.md`.
- Modify: `docs/api/README.md`:
  - linhas no índice;
  - `TERMS_ACCEPTANCE_REQUIRED` nos erros transversais;
  - seção "Termo de uso e aceite" no guia de integração, com o fluxo:
    login, `terms_acceptance_required`, termo, aceite e `GET /profile`;
  - tratamento global do `403`;
  - link da página no rodapé e no e-mail.
- Modify: `docs/deploy-vps.md`:
  - o checklist "Antes de dados reais" ganha a P31 resolvida no escopo
    acadêmico (termo + aceite), o HTTPS decidido (2026-11-13) e ainda não
    configurado, e como publicar uma versão nova (arquivo, migration, deploy);
  - a seção "Acesso por IP, sem HTTPS" é revista como decisão substituída.
- Modify: `CLAUDE.md` e `AGENTS.md`, com conteúdo idêntico:
  - parágrafo do BE-32 no "Estado atual";
  - o trecho "Acesso sempre por IP e porta, sem domínio nem HTTPS" é
    atualizado para a decisão de 2026-11-13.

- [ ] **Step 1: escrever as notas** conferindo cada uma com o DTO, o
  controller e `/api/docs-json`.
- [ ] **Step 2: conferir.** `cmp CLAUDE.md AGENTS.md`, `git diff --check` e o
  e2e `apiContract` devem passar.
- [ ] **Step 3: commit.** `docs: termo de uso no manual, guia de integracao, deploy e instrucoes (BE-32)`

### Task 9: Verificação completa e vault

- [ ] **Step 1: verificação completa.**
  - `npm run lint`;
  - `npm run build`;
  - `npm test -- --runInBand`;
  - `VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand`.

  Anotar os números (suítes e testes) e reportar qualquer falha com a saída.
- [ ] **Step 2: vault** (`/mnt/c/Obsidian/mateus-dev`), depois de um
  `git pull --ff-only`.
  - **Tarefa:** `02-projetos/vitacare-backend/tarefas/2026-11-13-be-32-termo-de-uso.md`,
    com as fontes e as URLs (acesso em 2026-11-13), as decisões D1–D5, os
    commits e os testes com números.
  - **Evolução:** `09-sistemas/vitacare/evolucao/2026-11-13-termo-de-uso-e-aceite.md`
    e `2026-11-13-https-decidido.md`, que revê
    `2026-11-10-acesso-por-ip-sem-https`; atualizar o índice
    `vitacare-evolucao.md`.
  - **Alterações** (entradas datadas):
    - `vitacare-rnf006-alteracoes`;
    - `vitacare-seguranca-e-privacidade-alteracoes` (termo, aceite e
      HTTPS);
    - `vitacare-pendencias-prototipos-alteracoes` (P31 resolvida no escopo
      acadêmico);
    - `vitacare-autenticacao-alteracoes` (estado novo da sessão);
    - `vitacare-contratos-api-alteracoes`;
    - `vitacare-dados-auditorias-alteracoes`, ou uma nota de dados nova para
      as tabelas;
    - o índice `vitacare-alteracoes`.
  - **Rastreabilidade:** a linha do RNF006 e do R08.
  - Commit seletivo só dos arquivos da tarefa, seguido de push.
- [ ] **Step 3: commit** dos ajustes finais no repositório, se houver.

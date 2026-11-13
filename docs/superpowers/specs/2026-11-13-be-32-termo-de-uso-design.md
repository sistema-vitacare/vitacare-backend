# BE-32 — Termo de uso e privacidade com aceite obrigatório (design)

Data: 2026-11-13. Card: BE-32 (módulo novo `Terms` + guard do `Auth`).
Requisitos: R08 e RNF006 (LGPD), R04 e R10 (o que o sistema não é), RNF007
(rastreabilidade) e RF017 (auditoria). Resolve a P31 **no escopo acadêmico**.

**Estado: desenho aprovado nos pontos de sessão, primeiro acesso, consulta e
página (Mateus, 2026-11-13). Falta a leitura do texto do termo.**

Fontes conferidas:

- **PDF do TCC:** R04, R08 e R10 (Quadro 1, p. PDF 42–43) e RNF006 (p. PDF 48).
  O TCC exige alinhamento à LGPD e não traz termo de uso, aceite, base legal
  nem retenção.
- **Vault:**
  - `vitacare-rnf006` e `vitacare-seguranca-e-privacidade`, com as alterações
    do BE-25 e do acesso por IP;
  - P30 e P31 em `vitacare-pendencias-prototipos` e na nota de alterações
    dela. **A P31 está nas pendências dos protótipos e da operação, não nas de
    negócio, como diz o card;**
  - tarefa e evolução do BE-25 (retenção técnica) e do BE-23 (IP e perfil na
    auditoria).
- **Código:**
  - `AuthGuard` e `AuthSessionRepository.resolve`;
  - `LoginUseCase`, `CompleteFirstAccessUseCase` e `completeFirstAccess` do
    `AuthTransactionRepository`, o login de novo depois da troca;
  - `ProfileController` (BE-27);
  - `insertAuditEvent`, `currentRequestIp` (`RequestMetadataInterceptor`), o
    catálogo e a máscara do BE-23;
  - `app.setup.ts` (prefixo, rotas excluídas, envelope e Helmet);
  - a migration `1791700000000-AuditEventQuery` (trigger de imutabilidade).
- **Pesquisa web (acesso em 2026-11-13):**
  - LGPD (Lei 13.709/2018), arts. 5, 6, 7, 9, 11, 14, 18, 37, 41, 46 e 48:
    https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
  - Marco Civil (Lei 12.965/2014), arts. 5, VII–VIII; 7, VIII–X; 10; 13; 15 e
    16: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm
  - Estatuto da Pessoa Idosa (Lei 10.741/2003), arts. 1, 3, 10, 17 e 18:
    https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741.htm
  - Estatuto da Pessoa com Deficiência (Lei 13.146/2015), arts. 11, 12, 84 e
    85: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm
  - Código Civil, arts. 1.767, 1.775 e 1.775-A:
    https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm
  - Lei 13.787/2018, prontuário (guarda mínima de 20 anos, art. 6):
    https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13787.htm
  - ANPD, "Guia Orientativo para Definições dos Agentes de Tratamento de Dados
    Pessoais e do Encarregado" (maio/2021), itens 49–52:
    https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-orientativo-sobre-agentes-de-tratamento-e-encarregado
  - ANPD, comunicado de incidente (Resolução CD/ANPD nº 15/2024, 3 dias
    úteis):
    https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
  - **Não lida:** a Resolução CFM 1.821/2007, cuja página mostrou só o
    visualizador vazio. A Lei 13.787/2018 basta para o termo.

## 1. Intenção

O VitaCare trata dados de saúde (dado sensível, LGPD art. 5, II). Mateus fechou
a P31 para o escopo acadêmico: o sistema não promete conformidade plena. Em vez
disso, informa quem usa (LGPD art. 9, Marco Civil art. 7, VIII) e guarda prova
de que a pessoa leu e aceitou o termo. O termo também deixa claro o que o
VitaCare **não** é: emergência, diagnóstico ou prontuário (R04 e R10).

## 2. Decisões de Mateus

**2026-11-12 (card):**

1. Projeto acadêmico, não produto comercial. A P31 se resolve com termo de uso
   e privacidade e com o registro do aceite.
2. Fora: funções de direitos do titular (exportar, anonimizar, excluir),
   encarregado formal e parecer jurídico.
3. O aceite é obrigatório no login, para os quatro perfis e o master. Quem já
   tem conta aceita no próximo acesso.
4. O backend registra data e hora, IP, navegador, versão e os demais dados de
   rastreabilidade.
5. O texto é próprio, simples e publicado numa página web.

**2026-11-13 (pontos do card):**

- **D1, bloqueio:** **checagem no guard.** A sessão continua `normal`, e a
  mesma consulta que valida a sessão diz se a versão vigente foi aceita.
- **D2, primeiro acesso:** **o aceite vem só depois da troca.** O fluxo de
  hoje fica: troca de senha na sessão restrita, novo login e então o aceite.
  A rota de aceite não vale na sessão `password_change`.
- **D3, consulta:** reusa `audit_events:read`. O admin vê a própria
  organização, e o master vê todas, com nomes de outra organização mascarados
  como no BE-23. Há também a rota "meus aceites" para todo usuário.
- **D4, página:** `GET /termos`, na raiz e sempre pública, mesmo com
  `SWAGGER_ENABLED=false`.
- **D5, texto:** sem contato nem `[a preencher]`, e sem a limitação "acesso sem
  HTTPS": Mateus vai configurar HTTPS. **Isso revê a decisão de 2026-11-10**
  (sempre IP e porta, sem HTTPS); a mudança é registrada no vault (evolução e
  `vitacare-seguranca-e-privacidade-alteracoes`), em `docs/deploy-vps.md` e no
  `CLAUDE.md`/`AGENTS.md` como decidida e ainda não configurada.

## 3. Não objetivos

- Não há rota para exportar, anonimizar ou excluir dados do titular. Esses
  pedidos são atendidos à mão, pela organização.
- Não há encarregado nem contato no texto (decisão de Mateus, 2026-11-13): os
  pedidos vão ao administrador da organização.
- Não há rota administrativa para publicar termo: uma versão nova é uma
  migration nova.
- Não há relatório de "quem ainda não aceitou".
- Não há aceite pelo paciente. Ele não é usuário, e a autorização do vínculo
  familiar é colhida pela organização fora do sistema, como o termo explica.
- O sistema não afirma conformidade com a LGPD em lugar nenhum: termo, manual
  e vault dizem "escopo acadêmico".

## 4. O termo

- **Arquivo:** `docs/termos/termo-de-uso-v1.md`, em UTF-8 com quebras LF.
  Usa só títulos `#`/`##`, parágrafos, listas `-` e `1.`, e negrito `**`.
  Não usa tabela, link nem HTML. Esse subconjunto é o que a página renderiza.
- **Identidade:** o número da versão e o SHA-256 em hex do conteúdo exato do
  arquivo.
- **Data:** a data de publicação é a hora em que a migration roda. O texto não
  traz data fixa, só o número da versão, para que o hash não dependa do dia do
  deploy. A página e o JSON mostram `publishedAt`.
- **Rascunho:** está no scratchpad desta sessão até Mateus aprovar. Seções: o
  que é, o que não é, quem é quem, dados e finalidades, perfis e
  responsabilidades, compartilhamento, segurança e guarda (com as limitações:
  retenção técnica e incidente), direitos do art. 18 e como pedir,
  mudanças, registro do aceite e leis consideradas.

## 5. Modelo

### 5.1 Migration `1792200000000-CreateTermsOfUse` (estrutura)

**`terms_versions`** é uma tabela global, sem `organization_id`:

- `id uuid` PK (`gen_random_uuid()`);
- `version integer` `UNIQUE`, com `CHECK (version > 0)`;
- `title varchar(200)`;
- `content text`;
- `content_hash char(64)`, com
  `CHECK (content_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex'))`.
  O banco garante que hash e texto batem;
- `published_at timestamptz`;
- `created_at`, `updated_at` e `deleted_at` pela convenção. `deleted_at` fica
  sempre nulo.
- Trigger `terms_versions_immutable` recusa `UPDATE` e `DELETE`, como o
  `audit_events_immutable`.

**`terms_acceptances`**:

- `id uuid` PK;
- `organization_id uuid` e `user_id uuid`, com FK composta
  `(user_id, organization_id) → users(id, organization_id)`;
- `terms_version_id uuid` FK → `terms_versions`;
- `terms_version integer` e `content_hash char(64)`: cópia que deixa a linha
  legível sozinha como prova;
- `profile_code varchar` do momento do aceite, lido no próprio `INSERT`, como
  em `insertAuditEvent`;
- `accepted_at timestamptz` com `DEFAULT now()`, a hora do servidor;
- `ip_address inet` anulável, pela regra `TRUST_PROXY`, via
  `currentRequestIp()`;
- `user_agent varchar(512)` anulável, truncado em 512 caracteres e sem
  caracteres de controle;
- `request_id varchar(80)`;
- `created_at`, `updated_at` e `deleted_at` (sempre nulo).
- Restrições e índices:
  - `UNIQUE (user_id, terms_version_id)`: aceitar de novo não duplica;
  - índice `(organization_id, accepted_at DESC)`;
  - trigger `terms_acceptances_immutable` recusa `UPDATE` e `DELETE`. O
    `TRUNCATE` dos testes passa.

O `down` derruba triggers, tabelas e funções.

### 5.2 Migration `1792200000001-PublishTermsOfUseV1` (texto)

- Insere a versão 1 com o texto e o hash como constantes na própria migration.
  Assim, a migration é imutável e não lê arquivo em runtime, porque `docs/`
  não vai para a imagem.
- Um teste unitário confere que o SHA-256 de `docs/termos/termo-de-uso-v1.md`
  é igual à constante e que o conteúdo é idêntico.
- O `down` recusa reverter quando já existe aceite da versão 1. Assim não se
  apaga a prova; a mesma regra vale para o `down` do BE-31.
- **Por que separar da estrutura:** os e2e de módulo incluem só a migration
  de estrutura. Sem versão publicada, ninguém é bloqueado, e as suítes
  existentes só ganham uma migration na lista. A homologação, o `apiContract`
  e o e2e do `Terms` rodam com todas.
- **Versão 2 no futuro:** um arquivo `termo-de-uso-v2.md` e uma migration
  `PublishTermsOfUseV2` no mesmo molde.

## 6. Bloqueio no guard (D1)

- **Consulta da sessão:** `AuthSessionRepository.resolve` devolve também
  `termsAccepted`:

  ```sql
  NOT EXISTS (SELECT 1 FROM terms_versions)
  OR EXISTS (SELECT 1 FROM terms_acceptances a
              WHERE a.user_id = t.user_id
                AND a.terms_version_id = (SELECT id FROM terms_versions
                                           ORDER BY version DESC LIMIT 1))
  ```

  A vigente é a de maior número. Sem nenhuma versão, ninguém é bloqueado.
- **Guard:** o `AuthGuard`, depois de checar o tipo de sessão, recusa a sessão
  `normal` com `termsAccepted = false` com
  `403 TERMS_ACCEPTANCE_REQUIRED`, exceto em rota marcada com o decorator
  novo `@AllowPendingTerms()`. A sessão `password_change` não passa por essa
  checagem, porque já é restrita pelo tipo.
- **Rotas liberadas sem aceite:**
  - `POST /auth/logout`;
  - `GET /profile` (BE-27);
  - `POST /terms/acceptances`;
  - `GET /terms/acceptances/me`.
  As rotas públicas não passam pelo guard.
- **Versão nova:** vale já na requisição seguinte de qualquer sessão aberta.
  O frontend trata `403 TERMS_ACCEPTANCE_REQUIRED` em qualquer tela e manda
  para a tela do termo.
- **Login:**
  - `state` ganha `terms_acceptance_required`: sessão normal sem o aceite da
    vigente. A ordem é `password_change_required`, depois
    `terms_acceptance_required`, depois `authenticated`;
  - `idleTimeoutSeconds` sai normalmente;
  - `session.permissions` sai `[]` enquanto o aceite estiver pendente, a mesma
    regra de sessão restrita do BE-27.
- **Bloco de sessão:** `SessionProfileDto` ganha `terms`:
  `{ required: boolean, currentVersion: number | null, acceptedVersion: number | null }`,
  em que `acceptedVersion` é a maior versão aceita. Ele vale no login e no
  `GET /profile`, que também devolve `permissions: []` enquanto houver aceite
  pendente.
- **Fluxo do frontend:** depois do aceite, chama `GET /profile` para receber
  as permissões.
- **Fluxo completo de um convidado:**
  1. login com `password_change_required`;
  2. `POST /auth/password/first-access`;
  3. novo login com `terms_acceptance_required`;
  4. `GET /terms/current`;
  5. `POST /terms/acceptances`;
  6. `GET /profile`.

## 7. Rotas

| Método e caminho | Acesso | Resposta |
| --- | --- | --- |
| `GET /api/v1/terms/current` | pública | `TermsVersionDto` |
| `GET /api/v1/terms/versions/:version` | pública | `TermsVersionDto` ou `404 TERMS_VERSION_NOT_FOUND` |
| `GET /termos` (`?versao=N`) | pública, HTML | página |
| `POST /api/v1/terms/acceptances` | sessão normal, liberada sem aceite | `TermsAcceptanceDto` |
| `GET /api/v1/terms/acceptances/me` | sessão normal, liberada sem aceite | lista dos próprios aceites |
| `GET /api/v1/terms/acceptances` | `audit_events:read` | lista paginada |

- **`TermsVersionDto`:** `version`, `title`, `content` (Markdown),
  `contentHash`, `publishedAt` e `pageUrl` (caminho relativo `/termos?versao=N`).
  Sem versão publicada, o `/current` responde `404 TERMS_NOT_PUBLISHED`.
- **`GET /termos`:**
  - fica fora do prefixo, da versão, do envelope e do OpenAPI (`VERSION_NEUTRAL`,
    entra no `exclude` do prefixo e nos `excludedPaths`), como o `/health`;
  - devolve `text/html; charset=utf-8`, `lang="pt-BR"` e CSS inline, sem
    script, que o CSP padrão do Helmet aceita;
  - o Markdown é renderizado por um conversor próprio do subconjunto da seção
    4, que escapa todo o texto antes de aplicar a marcação;
  - versão inexistente responde HTML `404`, e sem nenhuma versão publicada, HTML
    `404` com a mensagem "Termo ainda não publicado";
  - `Cache-Control: no-cache`;
  - um parâmetro inválido em `?versao` também responde `404`, sem JSON.
- **`POST /terms/acceptances`:**
  - o corpo é `{ version: integer }`;
  - dentro de uma transação, confere que `version` é a vigente; se não for,
    responde `422 TERMS_VERSION_NOT_CURRENT`, com a vigente no `detail`;
  - grava com `INSERT ... ON CONFLICT (user_id, terms_version_id) DO NOTHING`;
  - quando insere, grava a auditoria `terms.accepted` na mesma transação;
  - responde sempre `200` com `TermsAcceptanceDto` (`id`, `version`,
    `contentHash`, `acceptedAt` e `alreadyAccepted`). No repetido,
    `alreadyAccepted: true` e o registro original, sem nova auditoria.
- **`GET /terms/acceptances/me`:** devolve `version`, `contentHash` e
  `acceptedAt`, da mais nova para a mais antiga, sem paginação (uma linha por
  versão).
- **`GET /terms/acceptances`:**
  - filtros: `version`, `userId`, período `from`/`to` pela regra do BE-20
    sobre `accepted_at`, `organizationId` (só para o master; para o admin vale
    a mesma regra da auditoria do BE-23) e paginação padrão;
  - cada item traz:
    - `id`;
    - `organization` (`id`, `name`);
    - `user` (`id`, `name`), com o nome mascarado para o master em outra
      organização, por `maskForeignPersonalData`;
    - `profileCode`, `version`, `contentHash`, `acceptedAt`;
    - `ipAddress`, `userAgent` e `requestId`;
  - período vazio responde `200` com `meta.message`.

## 8. Erros novos

| Código | Status | Quando |
| --- | --- | --- |
| `TERMS_ACCEPTANCE_REQUIRED` | 403 | sessão normal sem aceite da vigente (em `AuthErrors`, porque quem lança é o guard) |
| `TERMS_VERSION_NOT_CURRENT` | 422 | aceite de versão que não é a vigente |
| `TERMS_VERSION_NOT_FOUND` | 404 | `GET /terms/versions/:version` inexistente |
| `TERMS_NOT_PUBLISHED` | 404 | `GET /terms/current` sem versão publicada |

**Documentação do `403`:** ele pode sair em toda rota protegida, então
aparece uma vez, como erro transversal:

- na descrição do esquema Bearer do OpenAPI;
- no manual, na seção de erros.

Ele não entra no `@ApiErrors` de cada uma das ~100 rotas. O `apiContract`
confere que a descrição do Bearer cita o código.

## 9. Auditoria

- **Ação nova no catálogo:** `terms.accepted`, "Aceitou o termo de uso",
  gravidade `normal`.
- **Registro:**
  - `entityType`: `terms_version`;
  - `entityId`: id da versão;
  - `afterValues`: `{ version }`;
  - o IP e o perfil entram pelo `insertAuditEvent`.
- **Leituras:** nenhuma é auditada (regra do BE-23).

## 10. Organização do código

`src/modules/Terms/`:

- **Controllers:**
  - `terms.controller.ts`, rotas `api/v1/terms`;
  - `termsPage.controller.ts`, `GET /termos`.
- **Casos de uso:** `GetCurrentTerms`, `GetTermsVersion`, `AcceptTerms`,
  `ListOwnTermsAcceptances` e `ListTermsAcceptances`.
- **Repositórios:**
  - `termsVersion.repository.ts`;
  - `termsAcceptance.repository.ts`, que é SQL com `organization_id`
    explícito. O acesso do master a todas as organizações segue o molde do
    `Audit`.
- **Policies:** `termsMarkdown.policy.ts`, conversor puro do subconjunto da
  seção 4 para HTML escapado.
- **Services:** `termsPage.renderer.ts`, que monta a página.
- **Parsers e DTOs:** os de sempre; `terms.errors.ts` com os três erros do
  módulo.
- **Fora do módulo:**
  - o decorator `AllowPendingTerms` fica em `Auth/guards/public.decorator.ts`;
  - `termsAccepted` entra em `AuthenticatedPrincipal`;
  - o bloco `terms` entra em `SessionProfileDto`, no parser e em
    `findSessionProfile`.

## 11. Efeitos fora do módulo

- **`scripts/ops/smoke.mjs` e `scripts/ops/load.mjs`:** fazem o aceite logo
  depois do login. Sem isso, o smoke de produção e o
  `ci-homologation.sh` recebem `403` depois do deploy.
- **Listas de migrations dos e2e:** todas as suítes que passam pelo guard
  ganham a `CreateTermsOfUse` em `ALL_MIGRATIONS` e nas listas próprias. A
  `PublishTermsOfUseV1` entra só onde o bloqueio é testado. O `authSchema` e
  o e2e de migration contam 21.
- **Homologação:** `tests/app/homologation.e2e-spec.ts` aceita o termo em cada
  login. Um passo novo mostra o bloqueio, o aceite e a liberação.
- **`devSeed`:** os usuários de desenvolvimento aceitam no primeiro login,
  como todo mundo, sem aceite semeado.

## 12. Testes (critérios de aceite)

- **Unitários:**
  - conversor de Markdown, inclusive o escape de `<script>`, `&` e aspas;
  - hash do arquivo igual ao da migration;
  - truncamento e limpeza do user agent;
  - ordem dos estados do login;
  - guard: rota liberada, rota bloqueada, sessão `password_change` sem a
    checagem e rota pública;
  - catálogo de auditoria com a ação nova.
- **e2e `tests/modules/Terms/termsAcceptance.e2e-spec.ts`**, com PostgreSQL e
  Redis reais, em modo estrito:
  - usuário novo e existente: o login sai `terms_acceptance_required`, uma rota
    de negócio responde `403 TERMS_ACCEPTANCE_REQUIRED`, o aceite passa e a
    mesma rota responde `200`;
  - primeiro acesso: troca de senha, novo login com
    `terms_acceptance_required` e aceite;
  - a linha gravada traz data, IP, user agent, versão, hash, perfil e
    `requestId`;
  - versão errada responde `422`;
  - o repetido não duplica e não gera nova auditoria;
  - `UPDATE` e `DELETE` são recusados nas duas tabelas;
  - publicar a versão 2 com uma migration de teste bloqueia de novo, inclusive
    em sessão aberta, e os aceites da versão 1 continuam guardados;
  - página e JSON abrem sem login e mostram o mesmo texto, e `?versao=1`
    funciona;
  - duas organizações: o admin de A não vê os aceites de B; o master vê os
    dois, com o nome de B mascarado; cuidador e familiar recebem `403` na
    consulta da organização;
  - o master também é bloqueado até aceitar.
- **Migration:** `up`, `down` e `up` em banco descartável. O `down` da
  publicação é recusado quando já há aceite.
- **`apiContract`:** as rotas novas têm nota e linha no índice, e a nota de
  `GET /termos` tem frontmatter `method`/`path`.
- **Execução:** lint, build, unitários e e2e completos, com os números
  reportados.

## 13. Documentação e vault (na implementação)

- **Manual da API:**
  - notas em `docs/api/endpoints/` para as cinco rotas da API e para
    `GET /termos`;
  - as notas alteradas: login, `GET /profile` e logout (liberada sem aceite);
  - no índice, a seção de erros transversais e o guia de integração com o
    fluxo do aceite e o tratamento global do `403`.
- **Deploy:** o checklist de LGPD de `docs/deploy-vps.md` passa a refletir a
  decisão acadêmica:
  - a P31 está resolvida no escopo acadêmico;
  - o checklist mostra o caminho para publicar uma versão nova.
- **Vault:**
  - tarefa `2026-11-13-be-32-termo-de-uso` com as fontes e a data de acesso,
    evolução e índice;
  - alterações em `vitacare-rnf006-alteracoes`,
    `vitacare-seguranca-e-privacidade-alteracoes`,
    `vitacare-pendencias-prototipos-alteracoes` (P31),
    `vitacare-autenticacao-alteracoes`, `vitacare-contratos-api-alteracoes`, a
    nota de dados pertinente e o índice `vitacare-alteracoes`;
  - rastreabilidade;
  - `CLAUDE.md` e `AGENTS.md` idênticos.

## 14. Deixado ao implementador

- O CSS da página, sóbrio e legível em celular, com fonte do sistema.
- O nome exato dos DTOs e dos arquivos, dentro da convenção de
  `src/modules/README.md`.
- A forma da migration de teste da versão 2 no e2e, que pode ser um `INSERT`
  direto na fixture, já que a tabela só recusa `UPDATE` e `DELETE`.

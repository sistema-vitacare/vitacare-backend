# BE-05 — Perfis, permissões e autorização por ação (design)

Data: 2026-10-29. Card: BE-05 (Access). Requisitos: RF005, RF016; RNF004/005; UC03.
Fontes lidas: `vitacare-perfis-e-permissoes`, `vitacare-pendencias-negocio` (P02),
`vitacare-dados-perfis-acesso`, `vitacare-dados-permissoes`,
`vitacare-dados-perfis-permissoes`, `vitacare-diagrama-casos-de-uso` (Figura 28),
UC01–UC14, RF005, RF009, RF016, telas 33, 36–38, 40, 44–46 e as notas de
alterações já existentes.

## 1. Intenção

Fechar a matriz de permissões dos quatro perfis do TCC, provisioná-la em toda
organização cliente, expor o catálogo ao frontend e permitir ao administrador
trocar o perfil de um usuário, com o novo privilégio valendo na requisição
seguinte. É a base que os módulos clínicos (BE-09 em diante) vão consumir.

## 2. Decisões de Mateus (2026-10-29)

1. **Perfis fixos.** A organização usa sempre os quatro perfis do TCC
   (`admin`, `professional`, `caregiver`, `family`). Não há criação de perfil
   nem edição das permissões de um perfil pela API.
2. **Seguir estritamente a documentação.** Herança apenas onde a Figura 28 a
   desenha: **Administrador ⊃ Profissional**. Profissional, Cuidador e Familiar
   são irmãos sob "Usuário"; cada um recebe só o que o seu UC descreve.
   Registrar acompanhamento fica **só com o Cuidador** (UC11).
3. Aceitas as sugestões do agente: medicamentos fora de Cuidador/Familiar;
   escopo por paciente e campos visíveis adiados para BE-10/BE-19; proteções na
   troca de perfil; entregas listadas na seção 5.

## 3. Não objetivos

- Rotas clínicas (pacientes, formulários, registros, medicamentos, alertas,
  relatórios, painel, auditoria). As permissões delas entram no catálogo agora,
  mas cada rota nasce no seu card.
- Escopo por vínculo com paciente, papel do vínculo e prevalência perfil ×
  vínculo (BE-10). Campos visíveis por perfil, incluindo a visão simplificada do
  familiar (BE-09/BE-19).
- CRUD de usuários e convite (BE-06). Aqui entra só a troca de perfil.
- Qualquer mudança no master (`platform_admin`): continua exatamente com as
  permissões de hoje, sem permissão clínica nem as novas de usuários.

**Anti-objetivo:** conceder qualquer acesso que a fonte não descreva.

## 4. Matriz aprovada

Código no formato `recurso:acao` (constraint `permissions_code_check`).

| Permissão | Rótulo | Familiar | Cuidador | Profissional | Admin | Fonte |
| --- | --- | :-: | :-: | :-: | :-: | --- |
| `patients:read` | Consultar pacientes | ✓ | ✓ | ✓ | ✓ | UC14 p.1; UC11 p.1; UC07 |
| `patients:create` | Cadastrar pacientes |  |  | ✓ | ✓ | UC07 |
| `patients:update` | Editar pacientes |  |  | ✓ | ✓ | UC07 |
| `patients:deactivate` | Inativar pacientes |  |  | ✓ | ✓ | UC07 alt. |
| `patient_history:read` | Consultar historico do paciente | ✓ | ✓ | ✓ | ✓ | UC12 (atores) |
| `patient_evolution:read` | Consultar evolucao do paciente | ✓ |  | ✓ | ✓ | UC14 p.3; Fig. 28 "Analisar evolução" |
| `alerts:read` | Consultar alertas | ✓ | ✓ | ✓ | ✓ | UC13; UC14 p.4 |
| `forms:read` | Consultar formularios | | ✓ | ✓ | ✓ | UC11 p.2; UC09 |
| `forms:create` | Criar formularios |  |  | ✓ | ✓ | UC09 |
| `forms:update` | Editar formularios |  |  | ✓ | ✓ | UC09 |
| `forms:deactivate` | Desativar formularios |  |  | ✓ | ✓ | UC09 alt. |
| `alert_rules:manage` | Configurar regras de alerta |  |  | ✓ | ✓ | UC09 p.5 |
| `follow_ups:create` | Registrar acompanhamento |  | ✓ |  |  | UC11 |
| `medications:read` | Consultar medicamentos |  |  | ✓ | ✓ | UC08 |
| `medications:create` | Cadastrar medicamentos |  |  | ✓ | ✓ | UC08 |
| `medications:update` | Editar medicamentos |  |  | ✓ | ✓ | UC08 |
| `medications:deactivate` | Inativar medicamentos |  |  | ✓ | ✓ | UC08 alt. |
| `reports:generate` | Gerar relatorio do paciente |  |  | ✓ | ✓ | UC10 |
| `organization:read` | Consultar a propria organizacao |  |  |  | ✓ | UC03 p.2 (existe) |
| `organization:update` | Editar a propria organizacao |  |  |  | ✓ | UC03 p.2 (existe) |
| `users:read` | Consultar usuarios |  |  |  | ✓ | UC03 |
| `users:create` | Cadastrar usuarios |  |  |  | ✓ | UC03 p.3 |
| `users:update` | Editar usuarios |  |  |  | ✓ | UC03 |
| `users:change_status` | Inativar e reativar usuarios |  |  |  | ✓ | UC03 alt. |
| `users:change_profile` | Alterar perfil de usuario |  |  |  | ✓ | UC03 p.3–4 |
| `users:reset_password` | Redefinir senha de usuario |  |  |  | ✓ | BE-03 (existe) |
| `access_profiles:read` | Consultar perfis de acesso |  |  |  | ✓ | UC03 p.3 |
| `patient_links:manage` | Gerenciar vinculos com pacientes |  |  |  | ✓ | UC03 p.4 |
| `plan:read` | Consultar plano e uso |  |  |  | ✓ | UC04 |
| `plan_change_requests:create` | Solicitar alteracao de plano |  |  |  | ✓ | UC04 p.4–5 |
| `dashboard:read` | Consultar painel operacional |  |  |  | ✓ | UC05 |
| `audit_events:read` | Consultar auditoria |  |  |  | ✓ | UC06 |
| `audit_events:export` | Exportar auditoria |  |  |  | ✓ | UC06 p.5 |

Total: 33 códigos de tenant, mais os 4 `platform_organizations:*` já existentes.

Invariantes que os testes fixam:

- `admin` ⊇ `professional` (herança da Figura 28); `admin` não recebe
  `follow_ups:create`, porque a herança não passa pelo Cuidador.
- `family` só tem ações `read`.
- Nenhum perfil de tenant tem código `platform_*`.
- `platform_admin` = `organization:read`, `organization:update`,
  `users:reset_password` + `platform_organizations:*` (inalterado).

Lacunas mantidas como pendência, sem acesso concedido:
- Medicamentos visíveis ao Familiar na Figura 37 e lembretes ao Cuidador
  (UC13): sem permissão de leitura de medicamentos até haver UC/decisão.
- UC07 p.3 (profissional vincula paciente ao profissional responsável) e UC14
  alt. ("solicitar permissão ao profissional responsável"): se o Profissional
  também gerencia vínculos fica para BE-10.
- UC13 "quando configurado, Administrador": `alerts:read` já vem pela herança; a
  entrega de notificação depende de vínculo/configuração (BE-15/BE-17).

## 5. Entregas

### 5.1 Matriz no código

`src/modules/Access/access.permissions.ts` passa a conter o catálogo completo
(`Permissions`, `PERMISSION_LABELS`) e a matriz:

```ts
export const TENANT_PROFILES = {
  admin:        { name: 'Administrador',          permissions: ADMIN_PERMISSIONS },
  professional: { name: 'Profissional de saude',  permissions: PROFESSIONAL_PERMISSIONS },
  caregiver:    { name: 'Cuidador',               permissions: CAREGIVER_PERMISSIONS },
  family:       { name: 'Familiar',               permissions: FAMILY_PERMISSIONS },
} as const;
```

`ADMIN_PERMISSIONS = [...PROFESSIONAL_PERMISSIONS, ...administrativas]`, de modo
que a herança fique explícita no código. `TENANT_ADMIN_PERMISSIONS` deixa de
existir; `PLATFORM_ADMIN_PERMISSIONS` passa a listar explicitamente os 3 códigos
de tenant de hoje + os 4 de plataforma. A ordem de `TENANT_PROFILES` é a ordem
de exibição (admin, professional, caregiver, family). Se a matriz for
mantida num arquivo à parte (`access.profiles.ts`), é escolha do implementador.

### 5.2 Provisionamento

Novo `provisionTenantProfiles(manager, organizationId)` em
`src/modules/Access/repositories/`: cria (ou reaproveita) os quatro perfis e
deixa as concessões de cada um **exatamente** iguais à matriz — concede o que
falta e marca `deleted_at = now()` nas concessões que sobram. Devolve o mapa
`code → profileId`. Idempotente.

Como os perfis são fixos, a matriz é a fonte de verdade (escolha do agente):
- perfil existente tem `name` e `description` padronizados pelos valores de
  `TENANT_PROFILES` e `deleted_at` limpo;
- código do catálogo existente tem `name` padronizado pelo rótulo e
  `deleted_at` limpo.

Descrições: admin "Administrador da organizacao"; professional "Profissional de
saude responsavel pelo acompanhamento"; caregiver "Cuidador que registra o
acompanhamento"; family "Familiar com acesso somente leitura".

`grantPermissions` passa a usar
`ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`, para
que uma concessão revogada possa voltar (o par é único mesmo com `deleted_at`).

Consumidores: `OrganizationRepository.create` (substitui o insert do perfil
`admin` + `grantPermissions`; o primeiro administrador recebe o id de `admin`)
e `devSeed` (substitui `PERMISSIONS_BY_PROFILE`; os quatro perfis passam a ter
permissões). `platformSeed` não muda.

### 5.3 Migration `SyncTenantAccessProfiles`

Para cada organização `kind = 'tenant'`: garante os quatro perfis, garante os 33
códigos no catálogo `permissions` (com rótulo) e sincroniza as concessões com a
matriz, como no 5.2. SQL literal com a matriz desta data (migration não importa
código da aplicação). Não toca a organização de plataforma. Perfil de tenant
com código fora dos quatro não é esperado; a migration não o altera.

`down` é de melhor esforço (escolha do agente), porque o estado anterior
variava entre ambientes (o `devSeed` já criava os quatro perfis): apaga as
concessões e os códigos de catálogo que não existiam antes desta migration (os
30 novos) e não remove perfis nem restaura textos ou concessões revogadas. Nada
que o código anterior usava é perdido: as 3 permissões antigas do `admin`
continuam concedidas.

Validar `migration:run`/`revert`/`show` em PostgreSQL descartável. Atualizar a
contagem de migrations nos testes que a fixam.

### 5.4 Consulta do catálogo — `GET /api/v1/access-profiles`

- Permissão `access_profiles:read` (só `admin`). Sessão normal; master → 403.
- Devolve os perfis da organização da sessão com `deleted_at IS NULL`, na ordem
  de `TENANT_PROFILES`, cada um com as permissões vivas:

```json
{ "data": [ { "code": "admin", "name": "Administrador", "description": null,
  "permissions": [ { "code": "patients:read", "name": "Consultar pacientes" } ] } ],
  "meta": { "requestId": "…", "timestamp": "…" } }
```

- Sem paginação (conjunto fixo e pequeno); sem filtros. Não expõe ids internos
  de concessão. Leitura via repositório do módulo `Access`, escopada pela
  organização do `ctx`.

### 5.5 Troca de perfil — `PATCH /api/v1/users/:id/profile`

- Módulo `User` ganha `user.controller.ts`, `user.errors.ts` e o caso de uso
  `ChangeUserProfile/` (dto, useCase); BE-06 reutiliza o controller.
- Permissão `users:change_profile`. `:id` validado como UUID.
- Corpo: `{ "profileCode": "admin" | "professional" | "caregiver" | "family" }`;
  valor fora da lista → 422 pelo pipeline de validação.
- Regras, na ordem:
  1. Alvo = usuário da sessão → `409 USER_SELF_PROFILE_CHANGE`.
  2. Alvo inexistente ou de outra organização → `404 USER_NOT_FOUND` (nunca 403).
  3. Mesmo perfil atual → 200 sem gravar nem auditar.
  4. Em transação: trava a linha da organização (`FOR UPDATE`) para serializar
     trocas concorrentes e **relê o ator** sob a trava; se ele já não é `admin`
     ativo (foi rebaixado ou inativado por uma troca concorrente) →
     `403 AUTH_FORBIDDEN`. Como o ator é outro admin ativo e não pode atingir a
     si mesmo, a organização nunca fica sem administrador; por isso não há erro
     de "último admin". Atualiza `users.profile_id` e `updated_at`; grava
     auditoria `user.profile_changed`, entidade `user`,
     `afterValues: { fromProfile, toProfile }` (só códigos), `actor` da sessão,
     `requestId`.
- Status do alvo não importa (pending/active/inactive podem trocar).
- Sessões do alvo **não** são revogadas: o `AuthSessionRepository` relê perfil e
  permissões a cada requisição, então a mudança vale na chamada seguinte. O
  teste prova isso.
- Resposta 200: `{ "id": "…", "name": "…", "profile": { "code": "…", "name": "…" } }`,
  via parser.

Códigos novos em `user.errors.ts`: `USER_NOT_FOUND` (404) e
`USER_SELF_PROFILE_CHANGE` (409); o ator rebaixado em corrida reutiliza
`AUTH_FORBIDDEN`. O texto da mensagem é
amigável em português; `detail` técnico sem dado pessoal.

### 5.6 Verificação reutilizável

`src/modules/Access/policies/access.policy.ts` com `hasPermission(ctx, code)` e
`assertPermission(ctx, code)` (lança `AUTH_FORBIDDEN`). `PermissionsGuard` passa
a usá-la. Use cases e jobs que reconstroem `RequestContext` chamam
`assertPermission` quando não há guard HTTP na frente. `src/modules/README.md`
ganha um parágrafo apontando essa política e a matriz.

### 5.7 Contexto

`ProfileCode` continua com os cinco valores. Nenhuma mudança no `RequestContext`.

## 6. Testes

Unitários (`tests/modules/Access/`, `tests/modules/User/`):
- invariantes da matriz (seção 4), rótulo para todo código, regex do código;
- `provisionTenantProfiles` idempotente e revogando concessão excedente;
- `ChangeUserProfile`: self, 404 cross-tenant, mesmo perfil sem auditoria,
  último admin, sucesso com auditoria;
- `PermissionsGuard`/`assertPermission`.

E2E com PostgreSQL descartável (atrás de `VITACARE_TEST_DATABASE_URL`), duas
organizações A e B, um usuário de cada perfil em cada uma:
- migration provisiona os quatro perfis em organização preexistente; cadastro
  de organização nova também;
- positivos/negativos por perfil nas rotas existentes: `GET/PATCH
  /organizations/me`, `GET /access-profiles`, `PATCH /users/:id/profile`,
  `POST` de redefinição administrativa — só `admin` passa; os outros três
  recebem 403; master recebe 403 em `/access-profiles` e na troca de perfil;
- admin de B tentando trocar perfil de usuário de A → 404;
- **revogação efetiva:** usuário `admin` de A com sessão aberta é rebaixado a
  `family`; a próxima chamada da mesma sessão a `GET /organizations/me` → 403;
  promovido de volta → 200, sem novo login;
- concorrência: dois admins rebaixando um ao outro ao mesmo tempo → uma troca
  passa, a outra recebe 403, e a organização mantém um admin;
- familiar: nenhuma permissão de escrita na sessão resolvida.

Contrato OpenAPI: as duas rotas com envelope, erros e Bearer no
`/api/docs-json`, no teste de contrato do módulo.

Comandos: `npm run build`, `npm run lint`, `npm test -- --runInBand`,
`npm run test:e2e -- --runInBand` (com e sem banco descartável), e subida no
container para conferir `/api/docs-json`.

## 7. Documentação e vault

- `docs/api/endpoints/access-profiles-listar.md` e
  `users-alterar-perfil.md`, no padrão `docs/api/padrao-endpoint.md`; índice em
  `docs/api/README.md`.
- Vault, sem editar notas originais:
  - tarefa `2026-10-29-be-05-access.md` (execução, evidências);
  - evolução `2026-10-29-matriz-perfis-permissoes.md` + índice;
  - alterações: `vitacare-perfis-e-permissoes-alteracoes` (matriz, herança),
    `vitacare-dados-perfis-acesso-alteracoes` (quatro perfis por organização),
    `vitacare-dados-permissoes-alteracoes` (catálogo completo),
    `vitacare-dados-perfis-permissoes-alteracoes` (sincronização/`deleted_at`),
    `vitacare-uc03-alteracoes` (troca de perfil, proteções),
    `vitacare-pendencias-negocio-alteracoes` (P02 parcial) + índice
    `vitacare-alteracoes`;
  - rastreabilidade e backlog.

## 8. Deixado ao implementador

Nomes de arquivos auxiliares e tipos, forma do SQL da migration, organização
interna dos testes e fixtures, texto exato das mensagens de erro.

## 9. Notas de implementacao (2026-10-30)

- (a) A trava da organizacao na troca de perfil usa `FOR NO KEY UPDATE` em vez de
  `FOR UPDATE`. Serializa igualmente as trocas concorrentes, mas nao conflita
  com o `FOR KEY SHARE` tomado por inserts com FK para `organizations`
  (`audit_events`, `auth_sessions`), que gerava deadlock com troca de senha,
  primeiro acesso e redefinicao administrativa do mesmo usuario (teste de
  regressao em `tests/modules/User/userSchema.e2e-spec.ts`). Escolha tecnica
  pendente de confirmacao de Mateus.
- (b) A checagem de troca da propria conta compara os ids sem diferenciar
  maiusculas, pois o `ParseUUIDPipe` aceita UUID em maiusculas.
- (c) A migration passa a matriz literal por parametros `unnest`, e nao por texto
  `VALUES` inline; os dados continuam literais no arquivo da migration.
- (d) `grantPermissions` tambem padroniza o rotulo do catalogo e limpa
  `deleted_at` do codigo no catalogo.

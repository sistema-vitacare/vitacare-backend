---
title: Login em uma organização
status: atual
updated: 2026-11-13
method: POST
path: /api/v1/auth/login
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/login — inicia sessão

## Propósito e acesso

Autentica um usuário dentro de **uma** organização e devolve o token de sessão (RF001, UC01). O e-mail é único por organização, então o cliente informa também o código público da organização; a API nunca descobre o tenant sozinha. Rota **pública**: não exige Bearer nem contexto anterior.

A resposta diz em qual estado a sessão nasceu:

- `authenticated`: sessão normal, válida por 12 horas absolutas e 30 minutos sem atividade. Cada requisição aceita renova a janela de inatividade.
- `password_change_required`: sessão **restrita**, válida por 10 minutos, que só alcança [primeiro acesso](auth-primeiro-acesso.md) e [logout](auth-logout.md). Ela aparece quando o usuário tem troca obrigatória pendente (master criado por `npm run seed:platform`, administrador criado com a organização, senha redefinida por administrador ou **usuário convidado**). O convidado cadastrado por [POST /users](users-criar.md) tem status `pending` e entra **só** por esta sessão, com a senha provisória do convite dentro de 24 h; ele nunca recebe sessão normal antes de concluir o [primeiro acesso](auth-primeiro-acesso.md) (BE-06, 2026-11-03). O convidado **por link** (canal `email`, BE-31) não tem senha até [aceitar o convite](auth-convite-aceitar.md): o login responde `401 AUTH_INVALID_CREDENTIALS`, com o mesmo tempo e a mesma resposta de qualquer credencial inválida. Depois do aceite, ele é `active` e entra direto com sessão normal, sem primeiro acesso.

- `terms_acceptance_required` (BE-32, decisão de Mateus em 2026-11-12/13): sessão **normal** (mesmos prazos de `authenticated`) de quem ainda não aceitou a versão vigente do [termo de uso e privacidade](terms-vigente.md), inclusive o master e quem já tinha conta. Ela só alcança [GET /profile](profile-consultar.md), [POST /terms/acceptances](terms-aceitar.md), [GET /terms/acceptances/me](terms-meus-aceites.md) e [logout](auth-logout.md); as demais rotas protegidas respondem `403 TERMS_ACCEPTANCE_REQUIRED`. O aceite libera a mesma sessão, sem novo login. A troca de senha obrigatória tem prioridade: o termo vem depois do primeiro acesso e do novo login. Sem nenhuma versão publicada, ninguém cai neste estado.

Desde o BE-27 (decisão de Mateus em 2026-11-12) a resposta também traz `data.session`: quem é o usuário, o perfil, as permissões efetivas e a organização. É o que o frontend usa para montar menus e redirecionar ao painel do perfil (UC01, passo 6). O bloco tem o mesmo formato de [GET /profile](profile-consultar.md), exceto o CPF, que no login sai **mascarado**.

O token é opaco: o servidor guarda apenas o SHA-256 dele. Não decodifique, não confie em nada escrito nele e não o persista em armazenamento compartilhado.

## Request

`Content-Type: application/json`. Sem parâmetros de path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação de logs; volta em `meta.requestId`. Sem ele a API gera um UUID. |

| Propriedade do corpo | Tipo | Obrigatória | Limites | Significado |
| --- | --- | --- | --- | --- |
| `organizationCode` | texto | sim | 3–50 caracteres, `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Código público da organização. Maiúsculas são normalizadas para minúsculas. |
| `email` | texto, formato e-mail | sim | até 254 caracteres | E-mail do usuário na organização. Normalizado para minúsculas. |
| `password` | texto | sim | 8–128 **caracteres** | Senha. Espaços e Unicode são preservados: a API não apara, não normaliza e não trunca. |

Nenhuma outra propriedade é aceita: campo desconhecido responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "organizationCode": "clinica-exemplo",
    "email": "ana.souza@example.test",
    "password": "senha de exemplo"
  }'
```

## Resposta de sucesso

`200 OK`, com `Cache-Control: no-store` — o token não pode ficar em cache de proxy ou de navegador.

```json
{
  "data": {
    "state": "authenticated",
    "accessToken": "F3dQ2p...Zc9",
    "tokenType": "Bearer",
    "expiresAt": "2026-09-23T00:00:00.000Z",
    "idleTimeoutSeconds": 1800,
    "session": {
      "user": {
        "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
        "name": "Ana Souza",
        "email": "ana.souza@example.test",
        "cpf": "***.982.247-**",
        "phone": "(11) 99999-0000",
        "status": "active",
        "createdAt": "2026-09-01T12:00:00.000Z"
      },
      "profile": { "code": "family", "name": "Familiar" },
      "permissions": [
        "alerts:read",
        "medications:read",
        "patient_evolution:read",
        "patient_history:read",
        "patients:read",
        "profile:manage"
      ],
      "organization": {
        "id": "3c9e1b7a-5d2f-4e8a-9b6c-7d1e2f3a4b5c",
        "code": "clinica-exemplo",
        "name": "Clinica Exemplo",
        "legalName": "Clinica Exemplo Ltda",
        "kind": "tenant",
        "status": "active",
        "plan": {
          "code": "enterprise",
          "name": "Enterprise",
          "features": [
            "patient_management",
            "health_records",
            "patient_history",
            "automatic_alerts",
            "responsive_access",
            "extended_registration",
            "management_reports",
            "operational_dashboard",
            "custom_deployment"
          ],
          "termStatus": "active"
        }
      },
      "terms": {
        "required": false,
        "currentVersion": 1,
        "acceptedVersion": 1
      }
    }
  },
  "meta": {
    "requestId": "9d0f5b28-0f62-4a3a-8c3d-1f6c0f0f1a11",
    "timestamp": "2026-09-22T12:00:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data.state` | texto | sim | `authenticated`, `password_change_required` ou `terms_acceptance_required` (BE-32). |
| `data.accessToken` | texto base64url | sim | Token opaco de 256 bits. Exemplo truncado de propósito. |
| `data.tokenType` | texto | sim | Sempre `Bearer`. |
| `data.expiresAt` | texto ISO 8601, UTC | sim | Prazo **absoluto** da sessão: 12h na sessão normal, 10min na restrita. |
| `data.idleTimeoutSeconds` | inteiro, segundos | não | `1800` na sessão normal; **ausente** na sessão restrita, que não tem janela de inatividade própria. |
| `data.session` | objeto | sim | Sessão do usuário (BE-27). Mesmo formato de [GET /profile](profile-consultar.md); propriedades abaixo. |
| `data.session.user.id` | texto UUID | sim | Usuário autenticado. |
| `data.session.user.name` | texto, até 180 | sim | Nome. |
| `data.session.user.email` | texto, e-mail | sim | E-mail de acesso, em minúsculas. |
| `data.session.user.cpf` | texto | sim | CPF **mascarado** no formato `***.982.247-**` (minimização; decisão de Mateus em 2026-11-12). O completo só sai em [GET /profile](profile-consultar.md). |
| `data.session.user.phone` | texto ou `null` | sim | Telefone; `null` sem telefone. |
| `data.session.user.status` | texto | sim | `active` na sessão normal; `pending` aparece na sessão restrita do convidado. |
| `data.session.user.createdAt` | texto ISO 8601, UTC | sim | Data do cadastro. |
| `data.session.profile.code` | texto | sim | `admin`, `professional`, `caregiver`, `family` ou `platform_admin` (master). |
| `data.session.profile.name` | texto | sim | Nome do perfil para exibição. |
| `data.session.permissions` | lista de texto | sim | Permissões efetivas, em ordem alfabética, lidas da **mesma fonte que a API aplica** em cada requisição; as `platform_*` só aparecem na organização de plataforma. **Vazia** na sessão restrita e enquanto o termo vigente não for aceito (`terms.required`). |
| `data.session.organization.id` | texto UUID | sim | Organização da sessão. |
| `data.session.organization.code` | texto | sim | O mesmo `organizationCode` enviado no login. |
| `data.session.organization.name` | texto | sim | Nome fantasia. |
| `data.session.organization.legalName` | texto ou `null` | sim | Razão social. |
| `data.session.organization.kind` | texto | sim | `tenant` (organização cliente) ou `platform` (administração master). |
| `data.session.organization.status` | texto | sim | `active` (o login só é aceito em organização ativa). |
| `data.session.organization.plan` | objeto ou `null` | sim | Plano corrente; `null` na plataforma. Limites, uso e preço **não** saem aqui (ficam em [GET /organizations/me/plan](plans-consultar-proprio.md), só para o admin). |
| `data.session.organization.plan.code` | texto | sim | `basic` ou `enterprise` (ou plano `legacy-*`). |
| `data.session.organization.plan.name` | texto | sim | Nome do plano. |
| `data.session.organization.plan.features` | lista de texto | sim | Recursos do Quadro 2. Sem `operational_dashboard`, o [painel](dashboard-resumo.md) responde `403`: o frontend esconde o item do menu. |
| `data.session.organization.plan.termStatus` | texto | sim | `active` ou `expired`; vencido bloqueia novos cadastros, nunca a leitura. Sem termo corrente, `active`. |
| `data.session.terms.required` | booleano | sim | `true` quando falta aceitar a versão vigente do termo de uso (BE-32). |
| `data.session.terms.currentVersion` | inteiro ou `null` | sim | Versão vigente (a maior publicada); `null` sem versão publicada. |
| `data.session.terms.acceptedVersion` | inteiro ou `null` | sim | Maior versão aceita pelo usuário; `null` sem aceite. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

Na **sessão restrita** (`password_change_required`), `session` traz `user`, `profile` e `organization` para a tela de primeiro acesso exibir nome e organização, com `permissions: []`. Nenhum dado clínico entra no bloco. O bloco é lido só **depois** de o login ser aceito: a falha continua com o mesmo tempo e a mesma resposta em todos os casos.

Efeitos da chamada bem-sucedida: cria a sessão, atualiza `users.last_access_at` e grava auditoria (`auth.login_succeeded` ou `auth.first_access_started`) na organização do usuário. Nada disso vaza na resposta.

A tentativa **recusada** também é auditada, como `auth.login_failed`, desde que o código informado corresponda a uma organização existente. Quando o e-mail pertence a uma conta daquela organização, o evento sai com autor (`actor_type = 'user'`); quando não pertence, sai como evento de sistema, sem autor e sem entidade. Código de organização inexistente não gera evento, porque `audit_events.organization_id` é obrigatório e referencia a tabela. Nenhum dado digitado na tentativa — e-mail ou senha — é copiado para a auditoria; o `request_id` liga o evento ao log da requisição. Desde o BE-23 todo evento guarda o IP do cliente (pela regra `TRUST_PROXY`, não por um campo da requisição) e, quando há autor, o perfil dele no instante da ação; ver [auditoria](audit-events-listar.md). Nada disso muda a resposta, que continua idêntica em todos os casos.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_INVALID_CREDENTIALS` | Organização inexistente ou inativa, conta inexistente, inativa ou excluída, conta sem senha definida, senha errada, **senha temporária de redefinição administrativa ou de convite vencida** (24 h), senha provisória substituída por reemissão do convite. **Todos** respondem igual. |
| `422` | `VALIDATION_FAILED` | Campo ausente, fora do formato ou fora dos limites; propriedade desconhecida no corpo. |
| `429` | `AUTH_TEMPORARILY_BLOCKED` | Cinco falhas na mesma combinação organização/e-mail ou no mesmo IP dentro de 15 minutos. O bloqueio dura 15 minutos e não altera `users.status`. |
| `503` | `AUTH_DEPENDENCY_UNAVAILABLE` | Redis indisponível: sem o contador de abuso a tentativa é recusada, nunca liberada. |

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Credenciais inválidas.",
    "detail": "Organização, conta, estado ou senha inválidos.",
    "fields": null
  },
  "meta": {
    "requestId": "9d0f5b28-0f62-4a3a-8c3d-1f6c0f0f1a11",
    "timestamp": "2026-09-22T12:00:00.000Z",
    "path": "/api/v1/auth/login",
    "method": "POST",
    "status": 401
  }
}
```

`fields` só é preenchido em `422`, e nunca repete o valor enviado:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      { "field": "organizationCode", "code": "MATCHES", "message": "Informe o codigo da organizacao em minusculas, com hifens." },
      { "field": "email", "code": "IS_EMAIL", "message": "Informe um e-mail valido." }
    ]
  },
  "meta": {
    "requestId": "2f2f9e10-2f9e-4a10-9e10-2f9e4a109e10",
    "timestamp": "2026-09-22T12:00:00.000Z",
    "path": "/api/v1/auth/login",
    "method": "POST",
    "status": 422
  }
}
```

## Notas de integração

- O limite de abuso usa o IP resolvido pelo Express. `trust proxy` está desligado, então `X-Forwarded-For` enviado pelo cliente **não** decide a contagem. Publicar atrás de proxy exige decidir essa configuração antes (pendência aberta).
- Datas sempre em ISO 8601 UTC. Não há `0`, `false` ou `null` com significado especial nesta rota.
- Sessão restrita: enviar seu token em qualquer outra rota responde `401 AUTH_UNAUTHENTICATED`.
- **`session` como cache:** guarde o bloco com o token e recarregue-o por [GET /profile](profile-consultar.md) depois de editar o próprio cadastro, depois de o admin trocar o seu perfil e ao receber um `403` inesperado. Depois de trocar o e-mail pelo [PATCH /profile](profile-atualizar.md), o login seguinte já usa o e-mail novo.
- **Mudança durante o login (BE-06, 2026-11-03):** a senha é verificada fora da transação; antes de abrir a sessão, a linha do usuário é travada e relida com o hash verificado. Se nesse intervalo a senha foi substituída (convite reemitido, redefinição administrativa) ou a conta foi inativada, a resposta é o mesmo `401 AUTH_INVALID_CREDENTIALS` e nenhuma sessão é criada. Uma revogação posterior sempre alcança a sessão aberta.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/Login/login.dto.ts`; caso de uso `src/modules/Auth/Login/login.useCase.ts`; catálogo `src/modules/Auth/auth.errors.ts`; prazos em `src/config/auth.config.ts`; migration `src/database/migrations/1790000000000-CreateAuthSchema.ts`. Testes: `tests/modules/Auth/login.useCase.spec.ts`, `tests/modules/Auth/auth.e2e-spec.ts` (envelope, `no-store`, 401 uniforme, 422, `X-Forwarded-For`) e `tests/modules/Auth/authSchema.e2e-spec.ts` (duas organizações com o mesmo e-mail e os três desfechos de auditoria da tentativa falha, em PostgreSQL real). Login do convidado pendente: `tests/modules/Auth/login.useCase.spec.ts` (pendente dentro do prazo → sessão `password_change`; vencido → 401) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL real). Bloco `session` (BE-27): `src/modules/Auth/dtos/sessionProfile.dto.ts`, `src/modules/Auth/parsers/sessionProfile.parser.ts`, leitura em `AuthIdentityRepository.findSessionProfile` e permissões em `src/modules/Auth/repositories/effectivePermissions.query.ts` (a mesma do guard); testes `tests/modules/Auth/sessionProfile.parser.spec.ts`, `tests/modules/Auth/login.useCase.spec.ts` e `tests/modules/Profile/profile.e2e-spec.ts` (cinco tipos de conta, permissões iguais às que o guard aplica, CPF mascarado). Conferido contra o OpenAPI gerado em 2026-09-22; texto de convidado revisto em 2026-11-03; bloco `session` conferido em 2026-11-12. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]], [[2026-09-22-auditoria-de-acesso]], [[2026-11-03-usuarios-e-convite-por-senha-provisoria]], [[2026-11-12-sessao-no-login-e-proprio-perfil]].

BE-31: login do pendente por link antes do aceite (`401`) e depois dele (`200`, `authenticated`) em `tests/modules/User/userInvitation.e2e-spec.ts` e `tests/app/homologation.e2e-spec.ts`. Vault: [[2026-11-12-convite-por-email]].

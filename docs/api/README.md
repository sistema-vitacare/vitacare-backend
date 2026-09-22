---
title: Manual de integração da API VitaCare
status: atual
updated: 2026-09-22
---

# Manual de integração da API VitaCare

Este diretório descreve **as rotas que existem no backend**, em Markdown legível por integradores e por agentes de IA. O [padrão de endpoint](padrao-endpoint.md) exige uma nota por método e caminho; nenhuma rota planejada deve aparecer como disponível. O contrato OpenAPI gerado pela aplicação complementa estas notas e deve concordar com elas.

## Endereço e convenções

Nos exemplos, `https://api.example.com` representa a origem do ambiente onde a API for publicada; não é um servidor VitaCare configurado. O prefixo (`API_PREFIX`, padrão `api`) e a versão URI (`API_VERSION`, padrão `1`) são configuráveis. Assim, as rotas de negócio atuais usam `/api/v1`; as rotas `/health/*` ficam fora do prefixo e da versão. O servidor usa HTTPS na arquitetura prevista, mas o ambiente local pode usar HTTP.

O corpo das rotas de negócio é JSON quando aplicável. Autenticação usa Bearer opaco e stateful: o token bruto só sai no login e seu hash é persistido; sessão revogada, expirada, inativa ou com senha alterada não continua válida. Não envie dados pessoais reais em exemplos de documentação.

| Método e caminho padrão | Finalidade | Nota |
| --- | --- | --- |
| `GET /api/v1` | Identificação do serviço | [identificacao-servico.md](endpoints/identificacao-servico.md) |
| `GET /health/live` | Processo HTTP disponível | [health-live.md](endpoints/health-live.md) |
| `GET /health/ready` | PostgreSQL e Redis disponíveis | [health-ready.md](endpoints/health-ready.md) |
| `GET /api/docs` | Interface Swagger, se habilitada | [swagger-ui.md](endpoints/swagger-ui.md) |
| `GET /api/docs-json` | Documento OpenAPI, se habilitado | [openapi-json.md](endpoints/openapi-json.md) |
| `POST /api/v1/auth/login` | Inicia sessão | [auth-login.md](endpoints/auth-login.md) |
| `POST /api/v1/auth/password/first-access` | Conclui troca obrigatória | [auth-primeiro-acesso.md](endpoints/auth-primeiro-acesso.md) |
| `POST /api/v1/auth/logout` | Revoga a sessão atual | [auth-logout.md](endpoints/auth-logout.md) |
| `PUT /api/v1/auth/password` | Troca a própria senha | [auth-alterar-senha.md](endpoints/auth-alterar-senha.md) |
| `POST /api/v1/auth/password-recovery/request` | Solicita recuperação | [auth-solicitar-recuperacao.md](endpoints/auth-solicitar-recuperacao.md) |
| `POST /api/v1/auth/password-recovery/reset` | Redefine com token | [auth-redefinir-senha.md](endpoints/auth-redefinir-senha.md) |
| `POST /api/v1/auth/users/:userId/temporary-password` | Redefinição administrativa | [auth-redefinir-senha-usuario.md](endpoints/auth-redefinir-senha-usuario.md) |

Os caminhos de Swagger usam `SWAGGER_PATH=docs` e só existem com `SWAGGER_ENABLED=true`. O documento OpenAPI é gerado em runtime; consulte a rota JSON do ambiente para conferir a versão publicada. `/health/live` é excluída do OpenAPI de propósito, mas permanece documentada aqui.

## Autenticação

Sessão stateful com token **opaco**: o login devolve o valor bruto uma única vez e o banco guarda apenas o SHA-256 dele. Não há JWT, não há nada legível dentro do token e o cliente não deve tentar interpretá-lo.

```http
Authorization: Bearer <token devolvido em data.accessToken>
```

Cada requisição recompõe o contexto no banco, então revogação, expiração, inativação do usuário e inativação da organização valem **na chamada seguinte**, sem esperar o token expirar.

| Tipo de sessão | Origem | Validade | Alcance |
| --- | --- | --- | --- |
| `normal` | Login de conta sem troca pendente | 12 horas absolutas e 30 minutos sem atividade | Todas as rotas autenticadas |
| `password_change` | Login de conta com troca obrigatória | 10 minutos absolutos | Apenas [primeiro acesso](endpoints/auth-primeiro-acesso.md) e [logout](endpoints/auth-logout.md) |

Cada requisição aceita renova a janela de inatividade da sessão normal; o prazo absoluto não é renovado. A organização efetiva **sempre** vem da sessão: nenhuma rota aceita `organizationId` do cliente como prova de autorização. Autorização por permissão nomeada usa o formato `recurso:acao`; falta de permissão responde `403 AUTH_FORBIDDEN`.

Rotas públicas de autenticação: login, solicitação de recuperação e redefinição por token. Todo o resto exige Bearer, e o OpenAPI marca isso no esquema `bearer`.

> **Não existe SMTP configurado em nenhum ambiente** (decisão de 2026-09-22). A solicitação de recuperação responde `202`, mas não cria token nem envia mensagem; quem perdeu a senha depende da [redefinição administrativa](endpoints/auth-redefinir-senha-usuario.md). O contrato da rota descreve o comportamento que passa a valer quando houver servidor de e-mail.

A senha tem de 8 a 128 **caracteres**, aceita espaços e Unicode e não tem regra de composição. O armazenamento usa Argon2id.

### Auditoria de acesso

Todo evento de acesso é gravado em `audit_events`, sempre dentro de uma organização e na mesma transação da escrita que o originou. A consulta e a exportação desses registros são objeto da tarefa 14 (RF017, UC06); hoje eles apenas são gravados e **nenhuma rota os devolve**.

| `action` | Origem |
| --- | --- |
| `auth.login_succeeded` | Login aceito em conta sem troca pendente. |
| `auth.login_failed` | Login recusado, quando o código corresponde a uma organização existente. Com autor se o e-mail é de uma conta dela; como evento de sistema se não é. |
| `auth.first_access_started` | Login aceito em conta com troca obrigatória. |
| `auth.first_access_completed` | Senha definitiva gravada pela sessão restrita. |
| `auth.logout` | Sessão encerrada pelo próprio usuário. |
| `auth.password_changed` | Troca da própria senha. |
| `auth.password_recovered` | Senha redefinida por token de recuperação. |
| `auth.admin_password_reset` | Senha temporária emitida por administrador. |
| `auth.bootstrap_completed` | Primeira organização e primeiro administrador criados por `npm run auth:bootstrap`. |

O evento guarda organização, autor, ação, entidade, `request_id` e o momento. **Nada digitado na requisição entra ali**: nem e-mail, nem senha, nem IP. Para investigar uma tentativa, correlacione o `request_id` do evento com o log estruturado da mesma requisição.

## Contrato transversal

Toda rota sob `/api` compartilha o mesmo envelope de sucesso e o mesmo formato de erro. As exceções estão listadas adiante.

### Envelope de sucesso

```json
{
  "data": { "id": "7f3a", "fullName": "Ana Souza" },
  "meta": { "requestId": "01J8X", "timestamp": "2026-09-17T12:00:00.000Z" }
}
```

Listagem paginada acrescenta `meta.pagination`:

```json
{
  "data": [{ "id": "7f3a" }, { "id": "91bd" }],
  "meta": {
    "requestId": "01J8Y",
    "timestamp": "2026-09-17T12:00:01.000Z",
    "pagination": { "page": 2, "limit": 20, "total": 143, "totalPages": 8 }
  }
}
```

Escrita pode acrescentar `meta.message`:

```json
{
  "data": { "id": "c40e" },
  "meta": {
    "requestId": "01J8Z",
    "timestamp": "2026-09-17T12:00:02.000Z",
    "message": "Paciente cadastrado com sucesso."
  }
}
```

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `data` | objeto, lista ou `null` | Conteúdo da operação. Operação sem conteúdo devolve `200` com `data: null`, não `204`. |
| `meta.requestId` | texto | Identificador de correlação com o log. Sempre presente. |
| `meta.timestamp` | texto ISO 8601 | Momento em que a resposta foi construída. Sempre presente. |
| `meta.message` | texto, opcional | Confirmação amigável definida pelo caso de uso. |
| `meta.pagination` | objeto, opcional | `page`, `limit`, `total` e `totalPages`. Só em resultado paginado. |

### Rotas fora do envelope

| Rota | Motivo |
| --- | --- |
| `GET /health/live` | Mantém o formato do indicador de saúde. |
| `GET /health/ready` | Mantém o relatório de dependências, com `status`, `info`, `error` e `details`. |
| `GET /api/docs` | HTML da interface Swagger. |
| `GET /api/docs-json` | Documento OpenAPI, formato fixado pela especificação. |

### Formato de erro

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      { "field": "email", "code": "IS_EMAIL", "message": "Informe um e-mail valido." },
      { "field": "idade", "code": "MIN", "message": "idade must not be less than 0" }
    ]
  },
  "meta": {
    "requestId": "01J8Y",
    "timestamp": "2026-09-17T12:00:01.000Z",
    "path": "/api/v1/pacientes",
    "method": "POST",
    "status": 422
  }
}
```

Erro inesperado suprime o `detail` e não expõe a causa:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Nao foi possivel concluir a operacao. Tente novamente.",
    "detail": null,
    "fields": null
  },
  "meta": {
    "requestId": "01J8Z",
    "timestamp": "2026-09-17T12:00:02.000Z",
    "path": "/api/v1/pacientes",
    "method": "GET",
    "status": 500
  }
}
```

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `error.code` | texto | Código estável no formato `DOMINIO_MOTIVO`, em SCREAMING_SNAKE. É contrato com o frontend: trate por `code`, nunca comparando `message`. |
| `error.message` | texto | Mensagem amigável, em português, exibível ao usuário final. |
| `error.detail` | texto ou `null` | Frase técnica escrita pela aplicação. Nunca stack, nunca mensagem crua de driver, nunca valor de campo clínico ou de identidade. `null` em erro inesperado. |
| `error.fields` | lista ou `null` | Um item por restrição violada, com `field`, `code` e `message` opcional. Campo aninhado aparece como `pai.filho`. |
| `meta.requestId` | texto | Correlação com o log do servidor. Cite-o ao reportar um erro. |
| `meta.timestamp` | texto ISO 8601 | Momento em que o filtro construiu a resposta. |
| `meta.path` | texto | URL requisitada, incluindo query string. |
| `meta.method` | texto | Método HTTP da requisição. |
| `meta.status` | inteiro | Código HTTP retornado, repetido no corpo. |

### Códigos HTTP

| Status | Uso |
| --- | --- |
| `202` | Pedido aceito sem afirmar o efeito, como a solicitação de recuperação de senha. |
| `400` | Corpo malformado ou JSON inválido. Parâmetro de rota fora do formato responde `422`. |
| `401` | Não autenticado: token ausente, expirado, revogado ou de tipo incompatível com a rota. |
| `403` | Autenticado sem permissão de perfil ou sem vínculo com o paciente. |
| `404` | Recurso inexistente **ou** pertencente a outra organização. A API não distingue os dois casos de propósito. |
| `409` | Conflito de estado: duplicidade, transição inválida, limite de plano atingido. |
| `422` | Validação de campo. O JSON está correto; os valores não. |
| `429` | Limite de requisições excedido. |
| `500` | Erro inesperado. `detail` é `null`. |
| `503` | Dependência indisponível, como Redis fora do ar na proteção contra abuso. |

Códigos transversais de `error.code`: `BAD_REQUEST`, `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`. Cada módulo declara os seus em `<modulo>.errors.ts` e a nota do endpoint lista os possíveis por status.

### Paginação

`PaginationQueryDto` vale para toda rota de listagem: `page` inteiro mínimo 1, padrão 1; `limit` inteiro de 1 a 100, padrão 20. O resultado alimenta `meta.pagination`. **Nenhuma rota atual recebe esses parâmetros.** Cada rota futura documenta seus próprios filtros, ordenação e limites antes de ser publicada.

## Manutenção do manual

Ao criar ou alterar um endpoint, atualize controller/DTO/Swagger, a nota em `endpoints/`, esta tabela e exemplos de request/response na mesma tarefa. Valide exemplos contra o código e teste HTTP; registre no vault a tarefa e qualquer alteração frente a requisitos ou contratos anteriores em `09-sistemas/vitacare/evolucao/`. A tarefa só tem documentação alinhada quando o manual, OpenAPI e notas do vault descrevem o comportamento executado.

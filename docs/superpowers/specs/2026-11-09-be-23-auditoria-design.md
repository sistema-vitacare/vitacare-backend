# BE-23 — Auditoria de negócio, consulta e exportação (design)

Data: 2026-11-09. Card: BE-23 (Audit). Requisitos: RF017; UC06 (passos 1–5 e
os dois fluxos alternativos); RNF007. Fontes lidas: PDF do TCC aprovado, p. 47
(RF017), 48–49 (RNF007), 52 (UC01 passo 5), 56–57 (Quadro 15, UC06) e 80
(Figura 45, lida como imagem), com pdf.js; notas `vitacare-auditoria`,
`vitacare-uc06`, `vitacare-dados-auditorias`, `vitacare-tela-45-auditoria`,
`vitacare-auditoria-alteracoes`, pendência P22 e a evolução
`2026-09-22-auditoria-de-acesso`; código de `Audit`, `Access`, `Auth`,
`Organization`, `Plan`, `Report` e de todos os repositórios que chamam
`insertAuditEvent`.

O texto do PDF confere com as notas; não há divergência entre nota e PDF. O
UC06 pede consulta por período, tipo de ação e usuário; cada entrada com data,
hora, responsável, tipo de ação e item relacionado; detalhe; exportação; lista
vazia com mensagem; erro na exportação com nova tentativa. A Figura 45
acrescenta busca, perfil, IP, gravidade, ator "Sistema/Automação",
paginação e "Exportar CSV".

## 1. Intenção

O administrador abre a auditoria e vê quem fez o quê, quando, de onde e sobre
qual item da sua organização, filtra, abre o detalhe e exporta em CSV. O master
da plataforma faz o mesmo sobre qualquer organização. A trilha não pode ser
alterada nem apagada, e nem a consulta nem o CSV expõem senha, token ou valor
clínico.

## 2. Estado de partida

- A gravação já existe em todos os módulos entregues (cerca de 70 ações, na
  mesma transação da escrita; falha ao gravar desfaz a ação). `after_values`
  guarda só ids, nomes de campos alterados e códigos — nenhum valor clínico,
  senha ou token.
- `audit_events:read` e `audit_events:export` existem e são só do admin; o
  `platform_admin` não tem nenhuma das duas.
- Não há IP, perfil nem gravidade no schema; não há rota de leitura.

## 3. Decisões de Mateus (2026-11-09)

1. **Perfil e IP gravados no momento da ação.** Colunas novas
   `actor_profile_code` (perfil do autor naquele instante, não o atual) e
   `ip_address` (`inet`, IP do cliente pela regra `TRUST_PROXY`; nulo em evento
   de sistema e nos eventos anteriores à migration).
2. **Gravidade por catálogo fixo por ação** (`info`, `normal`, `warning`,
   `critical` = info, normal, atenção, crítico da Figura 45), com filtro. Sem
   coluna: é calculada na consulta a partir do catálogo.
3. **Exportação CSV gerada na hora**, com os mesmos filtros da consulta, nada
   guardado, nova tentativa = repetir o pedido, limite de linhas (422 acima) e a
   própria exportação vira evento auditado.
4. **Trilha imutável e sem prazo.** Nenhuma rota edita ou apaga; trigger no
   PostgreSQL recusa `UPDATE` e `DELETE` em `audit_events`; retenção indefinida
   até uma política LGPD futura (BE-25). Falha ao gravar a auditoria continua
   desfazendo a ação.
5. **Leituras não são auditadas.** Ficam escritas, acesso/login, eventos de
   sistema e exportações (PDF do BE-21 e o CSV novo). O exemplo "Acessou painel
   do paciente" da Figura 45 fica como divergência registrada.
6. **Master consulta a auditoria de todas as organizações; o admin, só a da
   própria.** O `platform_admin` ganha `audit_events:read` e
   `audit_events:export`.
7. **Item relacionado = tipo + id + nome legível** quando o item tem nome.

## 4. Chamadas do agente (pendentes de confirmação)

- **Nome do item para o master em outra organização:** resolve só nomes de
  usuário e de organização; nome de paciente, formulário e medicamento sai
  `null` quando o evento não é da organização da sessão, porque o alcance do
  master sobre dados clínicos de outras organizações segue pendente
  (pendências de identidade e acesso). Tipo e id saem sempre.
- **Perfil:** gravado por subconsulta no próprio `INSERT`
  (`users` → `access_profiles` do autor), na mesma transação; nenhum chamador
  muda. Nome do perfil na resposta vem do código (`Administrador`,
  `Profissional de saude`, …, `Administrador master`).
- **IP:** capturado por um interceptor global que guarda o IP do pedido num
  `AsyncLocalStorage` enquanto o handler roda; `insertAuditEvent` lê de lá.
  Jobs (alertas, automação, entrega) não têm pedido e gravam `null`. Valor que
  não é IP válido (`net.isIP`) vira `null`. O IP aparece na lista, no detalhe e
  no CSV, só para quem tem `audit_events:read|export`.
- **Catálogo de ações** em `src/modules/Audit/policies/auditCatalog.policy.ts`:
  código → rótulo em português e gravidade. Ação desconhecida sai com o próprio
  código como rótulo e gravidade `normal`. Gravidade fixa:
  - `warning`: `auth.login_failed`, `auth.admin_password_reset`,
    `user.deactivated`, `user.profile_changed`, `organization.deactivated`,
    `patient.deactivated`, `patient_link.revoked`, `follow_up.annulled`,
    `follow_up_attachment.removed`, `form.deactivated`,
    `medication.deactivated`, `alert_rule.deactivated`, `plan.assigned`,
    `plan_change_request.approved`, `plan_change_request.rejected`,
    `patient_report.exported`, `audit_events.exported`;
  - `alert.generated`: a severidade do alerta gravada no evento
    (`critical`/`warning`/`info`);
  - `info`: `organization.platform_seeded`, `push_subscription.*`,
    `notification_preferences.updated`;
  - demais: `normal`.
- **Rota do catálogo** `GET /api/v1/audit-events/actions` para o seletor
  "Ação" da tela (código, rótulo, gravidade padrão), com `audit_events:read`.
- **Período** = regra do BE-20/BE-22 (`from`/`to` em dias `AAAA-MM-DD`
  inclusivos no fuso `America/Sao_Paulo`, padrão nos últimos 30 dias até hoje,
  máximo 366, `422 VALIDATION_FAILED` com o campo `PERIOD_TOO_LONG`), aplicado a `occurred_at`.
- **Busca** (`search`, até 100 caracteres, sem diferenciar maiúsculas): nome
  do autor (`ILIKE`) **ou** ações cujo código ou rótulo contém o termo
  (resolvido no catálogo, sem diferenciar acento, vira `action = ANY(...)`).
- **Filtro de usuário:** `actorUserId` (uuid) e `actorType` (`user|system`,
  para "Sistema/Automação").
- **Master:** `organizationId` opcional (sem ele, todas as organizações); para
  o admin, o parâmetro é ignorado e vale a organização da sessão, como em
  `GET /plan-change-requests`.
- **Ordem:** `occurred_at DESC, id DESC`; paginação padrão do projeto.
- **Vazio:** `200`, `data: []` e `meta.message` = "Nenhum evento de auditoria
  para os filtros selecionados." (UC06 alternativo).
- **Detalhe** traz `beforeValues` e `afterValues` como gravados; o parser
  ainda troca por `********` o valor de qualquer chave com `password`,
  `token`, `secret` ou `hash` no nome (defesa em profundidade; a gravação já
  não grava esses dados). Fora do alcance = `404 AUDIT_EVENT_NOT_FOUND`.
- **CSV:** UTF-8 com BOM, separador `;` (abre direto no Excel pt-BR), CRLF,
  aspas RFC 4180; célula iniciada por `=`, `+`, `-`, `@`, tab ou CR recebe `'`
  na frente (injeção de fórmula). Colunas: data/hora (ISO 8601 com fuso),
  organização, usuário, perfil, ação, código da ação, gravidade, tipo do item,
  id do item, item, IP, request id. Sem `before/after` (minimização; ficam no
  detalhe). Arquivo `auditoria-<from>-a-<to>.csv`. Período vazio gera CSV só
  com o cabeçalho, `200`.
- **Limite do CSV:** 10.000 eventos; acima, `422 AUDIT_EXPORT_TOO_MANY_EVENTS`
  (contado antes de gerar) para o usuário estreitar o filtro.
- **Falha ao gerar:** `500 AUDIT_EXPORT_FAILED`, sem evento de exportação;
  nova tentativa = repetir.
- **Evento da exportação:** `audit_events.exported`, gravado depois de o CSV
  ficar pronto, na organização da sessão, com `{ from, to, total, filters }`;
  `filters` guarda `action`, `severity`, `actorUserId`, `actorType`,
  `organizationId` e só `hasSearch: true|false` (o termo digitado pode ser um
  nome e não é copiado).
- **Imutabilidade:** trigger `audit_events_immutable` (`BEFORE UPDATE OR
  DELETE ... FOR EACH ROW`) levanta erro. `TRUNCATE` dos testes descartáveis
  não é afetado. `deleted_at` fica sem uso, como prevê P22.
- **Índice novo** `audit_events (occurred_at DESC, id DESC)` para a lista do
  master sem filtro de organização; os três índices por organização já
  cobrem o admin.
- **Migration** `1791700000000-AuditEventQuery`: colunas, check
  (`actor_type = 'system'` ⇒ `actor_profile_code IS NULL`), trigger, índice e
  concessão de `audit_events:read|export` aos perfis `platform_admin`
  existentes; `down` desfaz tudo.

## 5. Contrato

Todas as rotas: Bearer, envelope `{ data, meta }` (o CSV não tem envelope).

`GET /api/v1/audit-events` — `audit_events:read`. Query: `from`, `to`,
`action`, `severity`, `actorUserId`, `actorType`, `search`,
`organizationId` (só master), `page`, `limit`.

```json
{
  "data": [{
    "id": "…",
    "occurredAt": "2026-11-09T12:42:00.000Z",
    "organization": { "id": "…", "name": "Clínica Exemplo" },
    "actor": {
      "type": "user",
      "user": { "id": "…", "name": "Carla Mendes" },
      "profile": { "code": "admin", "name": "Administrador" }
    },
    "action": "follow_up.created",
    "actionLabel": "Registrou acompanhamento",
    "severity": "normal",
    "entity": { "type": "patient", "id": "…", "label": "Paciente Exemplo" },
    "ipAddress": "192.0.2.10",
    "requestId": "…"
  }],
  "meta": { "requestId": "…", "timestamp": "…", "pagination": { … } }
}
```

Evento de sistema: `actor = { "type": "system", "user": null, "profile": null }`.

`GET /api/v1/audit-events/:eventId` — `audit_events:read`; o item da lista +
`beforeValues` e `afterValues` (objeto ou `null`).

`GET /api/v1/audit-events/export` — `audit_events:export`; mesmos filtros sem
paginação; `200 text/csv; charset=utf-8`, `Content-Disposition: attachment`.

`GET /api/v1/audit-events/actions` — `audit_events:read`; lista
`{ action, label, severity }` do catálogo (para `alert.generated`, a gravidade
listada é `null`: depende do alerta).

Erros: `401`, `403 AUTH_FORBIDDEN`, `404 AUDIT_EVENT_NOT_FOUND`,
`422 VALIDATION_FAILED` (inclusive período longo),
`422 AUDIT_EXPORT_TOO_MANY_EVENTS`, `500 AUDIT_EXPORT_FAILED`.

## 6. Estrutura

`src/modules/Audit/`: `audit.controller.ts`, `audit.errors.ts`,
`ListAuditEvents/`, `GetAuditEvent/`, `ExportAuditEvents/`,
`ListAuditActions/`, `dtos/`, `parsers/`, `policies/auditCatalog.policy.ts`,
`repositories/auditEventQuery.repository.ts` (leitura; o repositório de
escrita existente só ganha perfil e IP), `services/auditCsv.service.ts`.
`src/common/context/requestMetadata.ts` (AsyncLocalStorage) e o interceptor em
`src/common/http/`.

## 7. Testes

- Unitários: catálogo e gravidade (inclusive `alert.generated`), CSV (BOM,
  `;`, aspas, injeção de fórmula, vazio), parser (máscara de chaves sensíveis,
  rótulo nulo para master fora da organização), período.
- E2E em PostgreSQL descartável: perfil e IP gravados num login e numa escrita
  real; evento de job sem IP; filtros por período/ação/usuário/sistema/
  gravidade/busca; vazio com mensagem; detalhe; `404` de outra organização;
  admin de duas organizações isolados; master vê as duas e filtra por
  `organizationId`; profissional/cuidador/familiar `403`; CSV com conteúdo e
  cabeçalhos, repetição gera o mesmo conteúdo e dois `audit_events.exported`;
  limite `422`; falha simulada `500` sem evento; `UPDATE`/`DELETE` recusados
  pelo trigger; nenhum evento contém senha provisória ou token após os fluxos
  de convite, login e recuperação; contrato OpenAPI.

## 8. Fora do escopo

Auditoria de leitura, retenção/expurgo e backup (BE-25), XLSX, rota para
apagar ou corrigir evento, assinatura/hash encadeado da trilha.

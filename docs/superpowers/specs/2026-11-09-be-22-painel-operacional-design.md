# BE-22 — Painel operacional da organização (design)

Data: 2026-11-09. Card: BE-22 (Dashboard). Requisitos: RF015; UC05 (passos
1–4 e os dois fluxos alternativos). Fontes lidas: PDF do TCC aprovado, p. 31–32
(Quadro 2), 47 (RF015), 55–56 (Quadro 14, UC05) e 68 (Figura 33, lida como
imagem), com pdf.js; notas `vitacare-uc05`, `vitacare-rf015`,
`vitacare-relatorios-e-indicadores`, `vitacare-tela-33-dashboard`, pendência
P10 e as alterações de relatórios, pendências e planos; tarefas BE-07, BE-20 e
BE-21; código de `Access`, `Plan`, `Patient`, `PatientAccess`, `User`,
`FollowUp`, `Alert`, `Indicator` e `History`.

O texto do PDF confere com as notas; não há divergência nota × PDF. O UC05 pede
"total de pacientes ativos, registros realizados no período, alertas emitidos
e usuários ativos", filtro por período, detalhe ao selecionar um indicador,
zeros com mensagem quando não há registro e erro com nova tentativa. A Figura
33 mostra ainda alertas **pendentes**, "registros hoje", variações, gráfico de
registros por período, alertas prioritários e últimos registros. O Quadro 2
lista o "Painel de controle operacional" entre os recursos do Enterprise.

## 1. Intenção

O administrador abre o painel e vê, para o período escolhido, quanto cuidado a
organização registrou e quantos alertas surgiram, ao lado da foto atual de
pacientes e usuários ativos e dos alertas ainda pendentes. Ao tocar num
indicador, vê de onde vem o número (por dia, por formulário, por cuidador, por
severidade, por profissional, por perfil). Só contagens e listas curtas da
própria organização; nenhum número atravessa organizações.

## 2. Decisões de Mateus (2026-11-09)

1. **Só Enterprise.** O painel aplica o recurso `operational_dashboard` do
   catálogo (Quadro 2). Organização cujo plano corrente não o tem recebe
   `403 DASHBOARD_PLAN_FEATURE_UNAVAILABLE`, em todas as rotas do painel.
2. **Alertas emitidos e pendentes.** Emitidos = alertas gerados no período
   (todas as origens: `reading`, `absence`, `medication_reminder`). Pendentes
   = alertas com `status = open` agora, independentemente do período.
3. **Data dos registros = visita**, só registros válidos (anulado fora), pela
   regra `from`/`to` do histórico e da evolução: dias inclusivos no fuso
   `America/Sao_Paulo`, padrão nos últimos 30 dias até hoje, máximo 366.
   "Registros hoje" da Figura 33 = `from = to = hoje`.
4. **Detalhe por indicador:** uma rota por indicador, só contagens, sem dado
   clínico além do que o resumo já mostra.
5. **Variação = contra o período anterior de mesmo tamanho** (ex.: 1–30/out
   contra 1–30/set), diferença absoluta, sem percentual, para registros e
   alertas emitidos. Para pacientes, "novos cadastrados no período".
6. **Listas da Figura 33, 5 itens cada:** alertas prioritários (abertos, por
   severidade `critical > warning > info` e depois os mais recentes) e últimos
   registros válidos do período (sem respostas).
7. **Usuário ativo = `status = active`** (já fez o primeiro acesso); convidados
   `pending` aparecem à parte no detalhe. Difere do uso do plano, que conta
   `pending + active`.
8. **Pacientes e usuários ativos são a foto de agora**, como no plano; o
   período vale para registros, alertas emitidos e novos cadastros.

## 3. Chamadas do agente (pendentes de confirmação)

- **Permissão:** a existente `dashboard:read` (só admin pela matriz do BE-05;
  profissional, cuidador e familiar recebem `403 AUTH_FORBIDDEN`). Master da
  plataforma não tem a permissão. Ordem das checagens: sessão (401),
  permissão (403 `AUTH_FORBIDDEN`), validação da query (422), plano (403
  `DASHBOARD_PLAN_FEATURE_UNAVAILABLE`).
- **Vigência vencida não bloqueia o painel:** pela política do BE-07, o termo
  vencido bloqueia só crescimento; vale o recurso do plano corrente.
- **Período anterior:** os `n` dias imediatamente antes de `from`
  (`n` = dias do período); pode ultrapassar o limite de 366 dias somados.
- **"Novos no período":** pacientes com `created_at` no período (dia local),
  em qualquer situação atual.
- **Alertas e registros de paciente inativo contam** (aconteceram); pendente de
  paciente inativo continua pendente até alguém resolver.
- **Alertas prioritários:** id, paciente (id, nome), origem, severidade,
  título, hora de geração e, para `reading`, campo, unidade, valor, operador,
  referência e o autor do registro (o "Cuid." da figura); para as demais
  origens esses blocos saem `null`. Lista própria (não o `AlertDto`), para
  não carregar notificação, resolução e blocos de agenda num card.
- **Últimos registros:** id, paciente (id, nome), formulário (id, nome),
  autor (id, nome) e data da visita, ordem `visited_at DESC, created_at DESC,
  id`.
- **Gráfico do resumo:** registros válidos por dia do período, com todos os
  dias presentes (zero onde não houve), para o gráfico "por período".
- **Aviso sem dados:** quando o período não tem nenhum registro válido, a
  resposta é `200` com os números zerados e `meta.message` = "Nenhum registro
  de acompanhamento no período selecionado." (os números que são foto, como
  pacientes ativos, continuam com o valor real).
- **Falha ao carregar:** erro do banco segue a tradução existente (sem
  `detail` do driver; 500 com `detail: null`). Nada é guardado nem mantido em
  memória: a nova tentativa é repetir a requisição.
- **Desempenho:** migration só de índices, para as agregações por organização
  não dependerem dos índices por paciente:
  `follow_up_records (organization_id, visited_at) WHERE status = 'valid'`,
  `alerts (organization_id, generated_at)` e
  `alerts (organization_id, severity, generated_at DESC) WHERE status = 'open'`.
- **Sem auditoria** (leitura agregada, como evolução e histórico), sem cache,
  sem fila, sem permissão nova.

## 4. Contrato

Todas as rotas: `dashboard:read`, Bearer, envelope `{ data, meta }`.

`GET /api/v1/dashboard?from&to` — resumo (UC05 passos 1–3, Figura 33)

```json
{
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-30", "timeZone": "America/Sao_Paulo" },
    "previousPeriod": { "from": "2026-09-01", "to": "2026-09-30" },
    "patients": { "active": 128, "newInPeriod": 12 },
    "users": { "active": 23 },
    "followUps": { "inPeriod": 340, "previousPeriod": 335, "change": 5,
                   "byDay": [{ "date": "2026-10-01", "total": 11 }] },
    "alerts": { "issuedInPeriod": 41, "previousPeriod": 38, "change": 3, "pending": 7 },
    "priorityAlerts": [{
      "id": "…", "patient": { "id": "…", "name": "…" }, "source": "reading",
      "severity": "critical", "title": "…", "generatedAt": "…",
      "reading": { "fieldName": "Saturação", "fieldUnit": "%", "value": "91",
                   "operator": "lt", "referenceValue": 94,
                   "author": { "id": "…", "name": "…" } }
    }],
    "latestFollowUps": [{
      "id": "…", "patient": { "id": "…", "name": "…" },
      "form": { "id": "…", "name": "…" }, "author": { "id": "…", "name": "…" },
      "visitedAt": "…"
    }]
  },
  "meta": { "requestId": "…", "timestamp": "…" }
}
```

Detalhes (UC05 passo 4):

- `GET /api/v1/dashboard/patients?from&to` → `active`, `inactive`,
  `newInPeriod`, `byResponsible` (`professional { id, name }`, `active`) dos
  pacientes ativos pelo vínculo vigente `responsible_professional`, do maior
  para o menor.
- `GET /api/v1/dashboard/users` (sem query) → `active`, `pending`,
  `inactive`, `byProfile` (`profile { code, name }`, `active`, `pending`,
  `inactive`) nos quatro perfis de tenant, sempre presentes.
- `GET /api/v1/dashboard/follow-ups?from&to` → `inPeriod`, `previousPeriod`,
  `change`, `byDay`, `byForm` (`form { id, name }`, `total`), `byAuthor`
  (`user { id, name }`, `total`), do maior para o menor.
- `GET /api/v1/dashboard/alerts?from&to` → `issuedInPeriod`,
  `previousPeriod`, `change`, `byDay`, `bySeverity` e `bySource` (os três e
  as três chaves sempre presentes, zero quando não houver), `issuedStillOpen`
  (dos emitidos no período, quantos seguem abertos) e `pending` (`total`,
  `bySeverity`).

Com período: `period`/`previousPeriod` no corpo, como no resumo; o aviso de
período sem dados vale também para os detalhes de registros e alertas.

Erros: `401 AUTH_UNAUTHENTICATED`; `403 AUTH_FORBIDDEN`;
`403 DASHBOARD_PLAN_FEATURE_UNAVAILABLE`; `422 VALIDATION_FAILED` (data
inválida, invertida, `from` futuro sem `to`, mais de 366 dias, query
desconhecida).

## 5. Desenho interno

- `src/modules/Dashboard/` — `dashboard.controller.ts` (cinco rotas, Swagger),
  `dashboard.module.ts`, `dashboard.errors.ts`.
- Casos de uso: `GetDashboard/`, `GetDashboardPatients/`, `GetDashboardUsers/`,
  `GetDashboardFollowUps/`, `GetDashboardAlerts/`; cada um resolve o período
  com `resolveEvolutionPeriod` (BE-20), checa o recurso do plano e chama o
  repositório.
- `repositories/dashboard.repository.ts` — SQL agregado sempre filtrado por
  `organization_id` do contexto, consultas independentes em paralelo.
- `Plan/repositories/planFeature.query.ts` — `hasPlanFeature(manager,
  organizationId, feature)`, o primeiro uso de recurso de plano.
- `policies/dashboardPeriod.policy.ts` — período anterior e lista de dias.

## 6. Testes

- Unitários: período anterior, preenchimento de dias, montagem do resumo e do
  aviso; plano sem o recurso; falha do repositório sobe sem ser engolida.
- HTTP com repositório simulado: envelope, `meta.message` sem dados, 403 por
  perfil e por plano, 422 de período, 500 sem `detail` seguido de nova
  tentativa `200`, contrato OpenAPI das cinco rotas.
- E2E com PostgreSQL descartável: duas organizações Enterprise com dados
  conhecidos, números conferidos um a um (anulado fora, inativo conta,
  período anterior, fuso na virada do dia, ordem dos prioritários), período
  vazio zerado com aviso, organização Basic `403`, nenhuma contagem da outra
  organização, perfis sem permissão `403`.
- Imagem Docker: as rotas respondendo por HTTP real.

## 7. Fora do escopo

Busca global e logout da Figura 33; percentuais e metas; painel por plano
Basic; exportação do painel; cache; relatórios gerenciais da Figura 43 (P27).

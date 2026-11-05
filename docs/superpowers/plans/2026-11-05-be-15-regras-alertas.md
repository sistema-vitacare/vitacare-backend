# BE-15 Alerts — plano de implementação

> Execução nativa nesta sessão (Mateus autorizou seguir). Desenho aprovado no chat em 2026-11-05.

**Goal:** regras de alerta por campo numérico (+ paciente opcional) e geração deduplicada de alertas a partir dos registros de acompanhamento, com consulta.

**Architecture:** módulo `src/modules/Alert/` (um controller com rotas `alert-rules` e `alerts`), SQL cru via `DataSource` em `repositories/` como os demais módulos. A avaliação é um serviço exportado (`AlertEvaluator`) chamado pelo `CreateFollowUpUseCase` depois do commit e por um job BullMQ de varredura.

## Decisões fixadas
- Operadores `gt|gte|lt|lte`; referência `numeric(12,3)`, |x| ≤ 999999999.999, até 3 casas.
- Severidade `critical|warning|info`.
- Regra: `form_id` + `field_key` (campo number/scale na versão publicada vigente), `patient_id` opcional (ativo, formulário aplicável). Regra própria ativa do paciente no mesmo campo substitui as gerais. Só regra criada até o envio do registro vale para ele.
- Alerta: `source='reading'`, origem regra+registro+item, cópia de campo/valor/unidade/operador/referência, `status='open'`, `UNIQUE(rule_id, response_item_id)`.
- Avaliação: `FOR UPDATE SKIP LOCKED` no registro com `alerts_evaluated_at IS NULL`; anulado → só marca; insert `ON CONFLICT DO NOTHING`; marca avaliado. Falha não derruba o 201.
- Migration marca os registros existentes como avaliados (antes do BE-15 não havia regra).
- Varredura: job scheduler BullMQ `alerts`/`sweep` a cada 60 s, até 100 registros pendentes com mais de 1 min.

## Tarefas
1. Migration `1791300000000-CreateAlerts` + entidades `AlertRule`, `Alert`; teste de schema (constraints, FKs de tenant, unique, down/up).
2. Regras: types, errors, DTOs, parser, repository, 6 casos de uso, rotas, módulo; testes de DTO/use case e HTTP/OpenAPI.
3. Avaliação: `AlertEvaluationRepository`, `AlertEvaluator`, gancho no `CreateFollowUpUseCase`, processor da varredura; testes em banco (limites dos 4 operadores na igualdade, `0`, precedência, repetição, anulado, valor salvo).
4. Consulta: `GET /alerts`, `GET /alerts/:alertId` no alcance do paciente.
5. e2e com guards/login reais e duas organizações (perfis, vínculo revogado).
6. Manual `docs/api/endpoints/alert-rules-*.md`, `alerts-*.md`, índice; vault (tarefa, evolução, alterações, índices, backlog, rastreabilidade); CLAUDE.md/AGENTS.md.

---
title: Identificação do serviço
status: atual
updated: 2026-09-15
method: GET
path: /api/v1
source: src/app.controller.ts
---

# GET /api/v1 — identificação do serviço

## Propósito e acesso

Confirma que a API responde e identifica o processo VitaCare. É uma rota **pública**, sem autenticação, tenant ou dados clínicos. Não é a checagem de PostgreSQL/Redis; para isso use `/health/ready`. O prefixo e a versão podem mudar via `API_PREFIX` e `API_VERSION`.

## Request

`Accept: application/json` é apropriado. Headers obrigatórios: nenhum. Parâmetros de path: nenhum. Query: nenhuma. Corpo: nenhum. A rota não aceita filtros nem paginação.

```bash
curl -i -H 'Accept: application/json' 'https://api.example.com/api/v1'
```

## Respostas

`200 OK`, `Content-Type: application/json`:

```json
{
  "name": "vitacare-backend",
  "status": "running"
}
```

| Propriedade JSON | Tipo | Obrigatória | Significado |
| --- | --- | --- | --- |
| `name` | texto | sim | Identificador fixo do serviço neste checkout: `vitacare-backend`. |
| `status` | texto | sim | Estado do processo HTTP: `running`. Não representa readiness. |

Caminho inexistente ou versão incorreta retorna `404` no envelope global descrito no [manual](../README.md). Erro interno não tratado retorna `500` genérico. Esses códigos não fazem parte do sucesso desta operação.

## Origem e validação

Implementação: `src/app.controller.ts`; Swagger: `ServiceIdentityDto`; teste HTTP: `test/app.e2e-spec.ts` (roteamento e resposta). Conferido em 2026-09-15. Sem RF/UC de domínio; é rota transversal de infraestrutura.

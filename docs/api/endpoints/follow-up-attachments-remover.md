---
title: Remover anexo de registro de acompanhamento
status: atual
updated: 2026-11-05
method: DELETE
path: /api/v1/follow-ups/{followUpId}/attachments/{attachmentId}
source: src/modules/Attachment/attachment.controller.ts
---

# DELETE /api/v1/follow-ups/{followUpId}/attachments/{attachmentId} — remove o anexo e apaga o arquivo

## Propósito e acesso

Corrige um anexo enviado por engano (foto errada, paciente errado). Decisão de Mateus de 2026-11-05: **remoção lógica + arquivo apagado**. A linha recebe `deleted_at` e sai da listagem e do download; o arquivo é apagado do volume; a auditoria guarda quem, quando e o nome do arquivo. A remoção é **final**: não há reativação. BE-13, RF009, UC11, RNF007.

Autenticação: `Authorization: Bearer <token>` com `follow_ups:annul` **ou** `follow_ups:create`:

- `admin` e `professional` (`follow_ups:annul`): removem qualquer anexo da organização;
- `caregiver` (`follow_ups:create`): só anexos **que ele enviou**, de paciente com vínculo de cuidador vigente; anexo de outro → `403 ATTACHMENT_NOT_AUTHOR`; paciente fora do alcance → `404`;
- `family` e master: `403 AUTH_FORBIDDEN`.

Registro **anulado** ou paciente **inativo** não impedem a remoção: corrigir a exposição de um dado não depende do cadastro (chamada do agente, aceita por Mateus na implementação).

## Request

Headers: `Authorization: Bearer <token>` (sim); `X-Request-Id` (não; vai para a auditoria). Sem corpo.

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `followUpId` | UUID | sim | Registro do anexo. |
| `attachmentId` | UUID | sim | Anexo a remover; precisa pertencer a esse registro. |

Query: nenhum.

```bash
curl -i -X DELETE 'https://api.example.com/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments/7c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`204 No Content`, **sem corpo** (e portanto sem envelope).

## Regras, na ordem

1. Guard: sessão (`401`) e `follow_ups:annul` ou `follow_ups:create` (`403`).
2. Transação com trava `FOR UPDATE` do anexo **ativo** daquele registro; inexistente, já removido ou de outra organização → `404 ATTACHMENT_NOT_FOUND`.
3. Sem `follow_ups:annul`: paciente fora do alcance → `404 ATTACHMENT_NOT_FOUND`; sessão não enviou o anexo → `403 ATTACHMENT_NOT_AUTHOR`.
4. Grava `deleted_at` e audita `follow_up_attachment.removed` com `{ followUpId, fileName, contentType, sizeBytes, ownAttachment }`.
5. Depois do COMMIT, apaga o arquivo do volume. Se isso falhar, a linha já está removida (o arquivo fica inacessível) e a API registra `warn` no log com a chave; a resposta continua `204`.

Repetir a remoção responde `404`. A vaga no limite de 5 anexos é liberada.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sem `follow_ups:annul` nem `follow_ups:create` (familiar, master). |
| `403` | `ATTACHMENT_NOT_AUTHOR` | Cuidador tentando remover anexo enviado por outro. |
| `404` | `ATTACHMENT_NOT_FOUND` | Anexo inexistente, já removido, de outro registro, de outra organização ou (para o cuidador) de paciente fora do alcance. |
| `422` | `VALIDATION_FAILED` | Algum id do path não é UUID. |

```json
{
  "error": {
    "code": "ATTACHMENT_NOT_AUTHOR",
    "message": "Só quem fez o registro pode anexar ou remover arquivos dele.",
    "detail": "Sem follow_ups:annul, so quem enviou remove o anexo.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T13:40:00.020Z",
    "path": "/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments/7c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    "method": "DELETE",
    "status": 403
  }
}
```

## Origem e validação

Controller `src/modules/Attachment/attachment.controller.ts`; caso de uso `src/modules/Attachment/RemoveAttachment/removeAttachment.useCase.ts`; repositório `src/modules/Attachment/repositories/attachment.repository.ts`. Testes: `attachmentManagement.e2e-spec.ts` (autor remove e o arquivo some do disco, repetição 404, outro cuidador 403, profissional remove em registro anulado, familiar 403, outra organização 404, auditoria com o nome), `attachmentUseCases.spec.ts` (falha ao apagar o arquivo não desfaz a remoção), `attachment.e2e-spec.ts` (204 sem corpo e OpenAPI). Conferido em 2026-11-05, inclusive no container. Vault: [[2026-10-29-be-13-files]]. Versão `v1`, criada no BE-13.

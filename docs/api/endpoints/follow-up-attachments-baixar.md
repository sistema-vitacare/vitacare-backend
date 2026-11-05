---
title: Baixar anexo de registro de acompanhamento
status: atual
updated: 2026-11-05
method: GET
path: /api/v1/follow-ups/{followUpId}/attachments/{attachmentId}/content
source: src/modules/Attachment/attachment.controller.ts
---

# GET /api/v1/follow-ups/{followUpId}/attachments/{attachmentId}/content — baixa o arquivo

## Propósito e acesso

Entrega o conteúdo do anexo **pela própria API** (proxy autenticado). O arquivo fica num volume privado do container e não tem URL pública. Cada chamada é autorizada de novo a partir do banco, e o caminho interno nunca vale como autorização (P22; decisão de Mateus de 2026-11-05). Vínculo revogado vale já na requisição seguinte. BE-13, RF009/RF016, UC11, RNF004.

Autenticação: `Authorization: Bearer <token>` com `patient_history:read`, no mesmo alcance da [listagem](follow-up-attachments-listar.md). Qualquer anexo inexistente, removido, de outro registro, de outra organização ou de paciente fora do alcance → `404 ATTACHMENT_NOT_FOUND`, sem distinguir os casos. Anexo de registro anulado ou de paciente inativo continua baixável.

Como a rota exige o header `Authorization`, um `<img src>` ou link direto não funciona. O frontend baixa com `fetch` autenticado e exibe ou salva o `Blob`.

## Request

Headers: `Authorization: Bearer <token>` (sim). Sem corpo.

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `followUpId` | UUID | sim | Registro do anexo. |
| `attachmentId` | UUID | sim | Anexo. Precisa pertencer a esse registro. |

Query: nenhum.

```bash
curl -sS -o curativo-perna.jpg \
  'https://api.example.com/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments/7c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d/content' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK` **binário, fora do envelope `{ data, meta }`**: o corpo é o arquivo.

| Header | Valor | Significado |
| --- | --- | --- |
| `Content-Type` | `image/jpeg`, `image/png`, `image/webp` ou `application/pdf` | Tipo detectado no envio. |
| `Content-Length` | inteiro, bytes | Igual a `sizeBytes`. |
| `Content-Disposition` | `attachment; filename="<nome ASCII>"; filename*=UTF-8''<nome codificado>` | Sempre `attachment`: o navegador baixa e não interpreta. No `filename`, caractere fora do ASCII, aspas e barra invertida viram `_`; o nome exato vai em `filename*`. |
| `Cache-Control` | `private, no-store` | Nenhum cache compartilhado ou local guarda o arquivo. |
| `X-Content-Type-Options` | `nosniff` | O navegador não adivinha o tipo. |

Exemplo de cabeçalho real (validado no container em 2026-11-05):

```http
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
Cache-Control: private, no-store
Content-Type: image/png
Content-Disposition: attachment; filename="curativo.png"; filename*=UTF-8''curativo.png
Content-Length: 4096
```

## Erros

Os erros saem no formato JSON normal (`{ error, meta }`).

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sem `patient_history:read` (master). |
| `404` | `ATTACHMENT_NOT_FOUND` | Anexo inexistente, removido, de outro registro, de outra organização ou de paciente fora do alcance. |
| `404` | `ATTACHMENT_CONTENT_MISSING` | A linha do anexo é válida, mas o arquivo não está no volume (perda de volume ou restauração incompleta). A API registra `error` no log com o id do anexo. |
| `422` | `VALIDATION_FAILED` | Algum id do path não é UUID. |

```json
{
  "error": {
    "code": "ATTACHMENT_NOT_FOUND",
    "message": "Anexo não encontrado.",
    "detail": "Anexo inexistente, removido ou de paciente fora do alcance.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T13:35:00.020Z",
    "path": "/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments/7c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d/content",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Attachment/attachment.controller.ts`; caso de uso `src/modules/Attachment/DownloadAttachment/downloadAttachment.useCase.ts`; `Content-Disposition` em `src/modules/Attachment/policies/attachmentContent.policy.ts`; armazenamento `src/storage/fileStorage.service.ts`; envelope liberado para `StreamableFile` em `src/common/http/responseEnvelope.interceptor.ts`. Testes: `attachmentManagement.e2e-spec.ts` (bytes idênticos, headers, admin/profissional/familiar, vínculo revogado, outra organização, outro registro, removido, arquivo ausente → `ATTACHMENT_CONTENT_MISSING`), `attachment.e2e-spec.ts` (headers e OpenAPI `string/binary`). Conferido em 2026-11-05, inclusive no container com volume recriado. Vault: [[2026-10-29-be-13-files]]. Versão `v1`, criada no BE-13.

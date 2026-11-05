---
title: Enviar anexo de registro de acompanhamento
status: atual
updated: 2026-11-05
method: POST
path: /api/v1/follow-ups/{followUpId}/attachments
source: src/modules/Attachment/attachment.controller.ts
---

# POST /api/v1/follow-ups/{followUpId}/attachments — anexa um arquivo ao registro

## Propósito e acesso

O cuidador anexa ao registro de acompanhamento que **ele mesmo** enviou uma foto ou documento (curativo, receita, exame). BE-13, RF009/RF016, UC11 e RNF004/RNF007. O TCC prevê anexos (MER `anexos_registro`; arquitetura com S3, p. 50), mas não tem UC de upload: o fluxo abaixo são **decisões de Mateus de 2026-11-05**:

- o anexo entra **depois** do registro, um arquivo por requisição, **sem prazo**; o `POST /follow-ups` não muda;
- formatos **JPEG, PNG, WEBP e PDF**, reconhecidos pelo **conteúdo** (assinatura de bytes) e nunca pela extensão ou pelo `Content-Type` enviado;
- até **10 MB** (10 485 760 bytes) por arquivo e **5 anexos ativos** por registro (removidos não contam);
- o arquivo fica num **volume Docker privado** da API (`vitacare-storage`), não no S3; não existe URL pública nem caminho exposto.

Autenticação: `Authorization: Bearer <token>` com `follow_ups:create` — só o perfil `caregiver`. `admin`, `professional`, `family` e o master recebem `403 AUTH_FORBIDDEN` (e nada é gravado: a permissão é checada antes de o corpo ser lido). O cuidador precisa:

- ter vínculo de cuidador **vigente** com o paciente do registro (senão `404 FOLLOW_UP_NOT_FOUND`, como registro de outra organização);
- ser o **autor** do registro (senão `403 ATTACHMENT_NOT_AUTHOR`);
- e o registro deve estar **válido** (não anulado) e o paciente **ativo**.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Content-Type: multipart/form-data; boundary=...` (sim; o cliente HTTP monta); `Accept: application/json` (não); `X-Request-Id` (não; vai para a auditoria).

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `followUpId` | UUID | sim | Registro que recebe o anexo. Não UUID → `422 VALIDATION_FAILED`. |

Query: nenhum.

Corpo `multipart/form-data` com **exatamente uma parte**:

| Parte | Tipo | Obrigatória | Limites | Significado |
| --- | --- | --- | --- | --- |
| `file` | arquivo binário | sim | 1 a 10 485 760 bytes; JPEG, PNG, WEBP ou PDF pelo conteúdo | O arquivo. O nome original (`filename` da parte) vira `fileName` depois de saneado: só o nome final (sem diretório), sem caracteres de controle, até 255 caracteres; vazio vira `anexo.<ext>`. |

Outra parte de arquivo, parte com outro nome, segunda parte `file` ou campo de texto extra → `422 ATTACHMENT_FILE_REQUIRED`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -F 'file=@curativo-perna.jpg'
```

## Resposta de sucesso

`201 Created`:

```json
{
  "data": {
    "id": "7c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    "followUpId": "f0e1d2c3-b4a5-4968-8776-655443322110",
    "fileName": "curativo-perna.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 482133,
    "uploadedBy": { "id": "1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "Ana Cuidadora" },
    "uploadedAt": "2026-11-05T13:23:17.492Z"
  },
  "meta": {
    "requestId": "d16db1d6-b504-4f1b-bd85-f1075b954b16",
    "timestamp": "2026-11-05T13:23:17.630Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `id` | UUID | não | Anexo. Usado no [download](follow-up-attachments-baixar.md) e na [remoção](follow-up-attachments-remover.md). |
| `followUpId` | UUID | não | Registro a que pertence. |
| `fileName` | texto, até 255 | não | Nome original saneado. Só rótulo: não participa do caminho do arquivo. |
| `contentType` | `image/jpeg` \| `image/png` \| `image/webp` \| `application/pdf` | não | Tipo **detectado** pelo conteúdo. |
| `sizeBytes` | inteiro, bytes | não | Tamanho do arquivo, 1 a 10 485 760. |
| `uploadedBy.id` | UUID | não | Quem enviou (sempre o autor do registro). |
| `uploadedBy.name` | texto | não | Nome de quem enviou. |
| `uploadedAt` | ISO 8601 UTC | não | Momento do envio (`data_anexo` do MER). |

O caminho interno do arquivo nunca sai pela API.

## Regras, na ordem

1. Guard: sessão (`401`) e `follow_ups:create` (`403`). Só então o corpo é lido, gravado num temporário do próprio volume.
2. Corpo: acima de 10 MB → `413`; sem a parte `file` ou com partes a mais → `422 ATTACHMENT_FILE_REQUIRED`; `followUpId` não UUID → `422 VALIDATION_FAILED`.
3. Conteúdo: 0 byte → `422 ATTACHMENT_EMPTY`; assinatura fora dos quatro tipos → `415 ATTACHMENT_UNSUPPORTED_TYPE`. Nada tocou o banco.
4. Transação: trava `FOR UPDATE` do registro (serializa a contagem e conflita com a [anulação](follow-ups-anular.md)) e `FOR SHARE` do paciente (conflita com a inativação). Registro inexistente, de outra organização ou de paciente fora do alcance → `404 FOLLOW_UP_NOT_FOUND`; não autor → `403 ATTACHMENT_NOT_AUTHOR`; anulado → `409 ATTACHMENT_FOLLOW_UP_ANNULLED`; paciente inativo → `409 ATTACHMENT_PATIENT_INACTIVE`; já há 5 ativos → `409 ATTACHMENT_LIMIT_REACHED`.
5. Com tudo aprovado, ainda na transação: o temporário é movido para a chave definitiva (`attachments/<organização>/<id do anexo>`, gerada no servidor), a linha é gravada e a auditoria `follow_up_attachment.created` registra `{ followUpId, fileName, contentType, sizeBytes }`. O **nome do arquivo** entra na auditoria por decisão de Mateus (2026-11-05), mesmo sendo texto livre.
6. Se a transação falhar depois de mover o arquivo, ele é apagado (compensação). O temporário é sempre apagado antes da resposta. Não sobra arquivo para envio recusado; um arquivo que sobrasse por falha da própria compensação seria inacessível, porque o download parte sempre de uma linha válida do banco.

Envios simultâneos para a última vaga: só um entra; os demais recebem `409 ATTACHMENT_LIMIT_REACHED`. O envio não é idempotente: repetir cria outro anexo.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Perfil sem `follow_ups:create` (admin, profissional, familiar, master). |
| `403` | `ATTACHMENT_NOT_AUTHOR` | Cuidador vinculado que não é o autor do registro. |
| `404` | `FOLLOW_UP_NOT_FOUND` | Registro inexistente, de outra organização ou de paciente sem vínculo vigente. |
| `409` | `ATTACHMENT_FOLLOW_UP_ANNULLED` | Registro anulado. |
| `409` | `ATTACHMENT_PATIENT_INACTIVE` | Paciente inativo. |
| `409` | `ATTACHMENT_LIMIT_REACHED` | O registro já tem 5 anexos ativos. |
| `413` | `ATTACHMENT_TOO_LARGE` | Arquivo acima de 10 485 760 bytes. |
| `415` | `ATTACHMENT_UNSUPPORTED_TYPE` | Conteúdo não é JPEG, PNG, WEBP nem PDF (ex.: texto renomeado para `.jpg`). |
| `422` | `ATTACHMENT_FILE_REQUIRED` | Corpo não multipart, sem a parte `file`, com outra parte de arquivo, com duas partes `file` ou com campo extra. |
| `422` | `ATTACHMENT_EMPTY` | Arquivo com 0 byte. |
| `422` | `VALIDATION_FAILED` | `followUpId` não UUID. |

```json
{
  "error": {
    "code": "ATTACHMENT_UNSUPPORTED_TYPE",
    "message": "Envie uma imagem JPEG, PNG ou WEBP, ou um PDF.",
    "detail": "Assinatura do conteudo nao corresponde a JPEG, PNG, WEBP ou PDF.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T13:25:00.020Z",
    "path": "/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments",
    "method": "POST",
    "status": 415
  }
}
```

## Origem e validação

Controller `src/modules/Attachment/attachment.controller.ts`; interceptor `src/modules/Attachment/http/attachmentUpload.interceptor.ts`; caso de uso `src/modules/Attachment/UploadAttachment/uploadAttachment.useCase.ts`; detecção e nome em `src/modules/Attachment/policies/attachmentContent.policy.ts`; repositório `src/modules/Attachment/repositories/attachment.repository.ts`; armazenamento `src/storage/fileStorage.service.ts`; migration `src/database/migrations/1791100000000-CreateFollowUpAttachments.ts`. Testes: `tests/modules/Attachment/attachmentManagement.e2e-spec.ts` (PostgreSQL: autor, não autor, sem vínculo, vínculo revogado, outra organização, anulado, inativo, limite, concorrência, 413/415, compensação), `attachment.e2e-spec.ts` (HTTP e OpenAPI), `attachmentUseCases.spec.ts`, `attachmentContent.policy.spec.ts`. Conferido com o OpenAPI gerado em 2026-11-05. Vault: [[2026-10-29-be-13-files]], [[2026-11-05-anexos-registro-volume-local]]. Versão `v1`, criada no BE-13 (2026-11-05).

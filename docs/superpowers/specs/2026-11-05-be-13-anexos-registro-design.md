# BE-13 — Anexos e downloads privados de registros (design)

Data: 2026-11-05. Card: BE-13 (Files). Requisitos: RF009, RF016; UC11;
RNF004, RNF007. Fontes lidas: PDF do TCC aprovado, p. 24 (Figura 12, "registro
com foto ou anotação rápida"), 50 (arquitetura: "Amazon S3 será utilizado para
armazenamento de arquivos, como anexos, imagens e relatórios"), 64–65
(Figuras 29/30, DER/MER) e 78 (Figura 43, relatórios — fora deste card); notas
`vitacare-arquivos`, `vitacare-dados-anexos-registro`,
`vitacare-infraestrutura`, `vitacare-uc11` e suas alterações, P22; molde da VPS
(`vps-hostinger-novo-sistema-compose-prod`, `vps-hostinger-backup`); design e
código do BE-12 (`src/modules/FollowUp`), `findPatientInScope`.

O texto das páginas confere com as notas; não há divergência nota × PDF. A
fonte não tem UC de upload/download: todo o fluxo abaixo é decisão posterior.

## 1. Intenção

O cuidador, depois de enviar um registro de acompanhamento, anexa a ele fotos
ou documentos (ferida, receita, exame). Quem pode ler o registro pode listar e
baixar os anexos; nada é público e o caminho do arquivo nunca é autorização.
Um anexo enviado por engano pode ser removido, e o arquivo some do disco.

## 2. Decisões de Mateus (2026-11-05)

1. **Armazenamento local, não S3:** volume Docker persistente do próprio
   container, no molde `<sistema>-storage` da VPS. Diverge da arquitetura do
   TCC (p. 50); vai para a evolução e para `vitacare-infraestrutura-alteracoes`.
2. **Envio depois do registro, pelo autor:** `POST /follow-ups/{id}/attachments`,
   um arquivo por requisição; só o cuidador autor do registro, com vínculo
   vigente, paciente ativo e registro válido (não anulado); **sem prazo**. O
   `POST /follow-ups` do BE-12 não muda.
3. **Download por quem lê o registro:** `patient_history:read` com o paciente
   no alcance (admin/profissional: organização inteira; cuidador/familiar: só
   com vínculo vigente no papel do perfil). Familiar baixa até o BE-19, mesmo
   precedente do BE-12.
4. **Remoção lógica + arquivo apagado:** o autor, ou admin/profissional com
   `follow_ups:annul`, remove. A linha recebe `deleted_at`, some das listagens
   e do download; o arquivo é apagado do volume; a auditoria guarda quem,
   quando e o nome do arquivo.
5. **Formatos e limites:** JPEG, PNG, WEBP e PDF, identificados pelo conteúdo
   (assinatura de bytes), não pela extensão nem pelo `Content-Type` enviado;
   até **10 MiB** (10 485 760 bytes) por arquivo; até **5 anexos ativos** por
   registro (removidos não contam).
6. **Nome do arquivo na auditoria:** sim, completo, no envio e na remoção
   (confirmado por Mateus mesmo com o alerta de que o nome é texto livre e pode
   conter identidade ou dado clínico).
7. **Rota de remoção:** `DELETE /follow-ups/{followUpId}/attachments/{attachmentId}`
   com `204` sem corpo.

Consequência de P22 ("URL assinada/proxy/upload direto"): **proxy pela API**.
Não há URL assinada nem upload direto: o volume não é exposto, e o download é
uma rota autenticada que reautoriza a cada requisição. Revogação de vínculo vale
na requisição seguinte.

## 3. Não objetivos

- Relatórios gerados e seu catálogo (BE-21); visão simplificada do familiar
  (BE-19); anexos fora de registro de acompanhamento.
- Integração S3, antivírus, miniaturas, conversão de HEIC, compressão.
- Cota de armazenamento por plano; reconciliação automática de órfãos (ver §8).
- Backup do volume: procedimento operacional documentado em
  `docs/deploy-vps.md`, não executado pelo agente.

## 4. Armazenamento (`src/storage/`)

Infraestrutura transversal, como `src/redis/`: `storage.module.ts` (global) e
`fileStorage.service.ts`, com configuração `storage.config.ts`.

- `STORAGE_PATH` (Joi, padrão `./storage`): raiz do armazenamento. Na imagem,
  `/app/storage`, criado no Dockerfile com dono `node` antes do `USER node`
  (volume nomeado novo herda o dono do diretório da imagem).
- Produção (`docker-compose.prod.yml`): `STORAGE_PATH: /app/storage` e volume
  nomeado `vitacare-storage:/app/storage`, declarado em `volumes:`. Desenvolvimento
  (`compose.yaml`): mesmo volume, nome `vitacare-storage-dev`. `storage/` entra no
  `.gitignore` e no `.dockerignore`.
- **Chave do objeto:** `attachments/<organizationId>/<attachmentId>`, os dois
  UUID gerados no servidor; sem nome original nem extensão. O serviço recusa
  chave que, resolvida, saia da raiz (defesa adicional; nenhuma chave vem do
  cliente).
- **Recepção em disco, não em memória:** o upload é gravado pelo multer em
  `<STORAGE_PATH>/tmp/<uuid>` (o container tem `mem_limit` de 512 MB; dez envios
  de 10 MiB simultâneos em memória o pressionariam). O temporário é sempre
  apagado ao fim da requisição, com sucesso ou erro.
- **Promoção atômica:** o arquivo aprovado passa do temporário para a chave
  final por `rename` (mesmo sistema de arquivos, dentro do volume), criando o
  diretório da organização se preciso; permissão `0o640`.
- **Leitura:** abre o arquivo antes de responder (arquivo ausente vira erro de
  domínio, não 500 no meio do stream) e devolve um stream.
- **Remoção:** `unlink` que ignora `ENOENT`.
- **Inicialização:** `onModuleInit` cria a raiz (`mkdir -p`) e confere escrita
  (`access W_OK`); sem escrita, a API não sobe e o erro sai no log. O
  `/health/ready` **não** muda (CLAUDE.md: só PostgreSQL e Redis).

## 5. Modelo de dados (migration `1791100000000-CreateFollowUpAttachments`)

### `follow_up_attachments` (MER `anexos_registro`)

| Coluna | Tipo | Regra / MER |
| --- | --- | --- |
| `id` | uuid PK | gerado no servidor antes de gravar o arquivo (vira a chave) |
| `organization_id` | uuid NOT NULL | FK → `organizations` |
| `record_id` | uuid NOT NULL | FK `(record_id, organization_id)` → `follow_up_records (id, organization_id)`. MER `id_registro_acompanhamento` |
| `uploaded_by_user_id` | uuid NOT NULL | FK composta → `users`. **Acréscimo ao MER** (autoria, RNF007; base de quem remove) |
| `file_name` | varchar(255) NOT NULL | MER `nome_arquivo`; nome saneado (§6.2); `btrim <> ''` |
| `content_type` | varchar(64) NOT NULL | MER `tipo_arquivo`; tipo **detectado**; CHECK nos 4 tipos |
| `storage_key` | varchar(255) NOT NULL UNIQUE | MER `caminho_arquivo`; **nunca sai pela API** |
| `size_bytes` | integer NOT NULL | MER `tamanho_arquivo`, unidade **bytes**; CHECK `> 0` |
| `created_at` | timestamptz | MER `data_anexo` (INT no MER) e `criado_em` |
| `updated_at` | timestamptz | MER `atualizado_em` |
| `deleted_at` | timestamptz NULL | remoção (convenção de 2026-09-18) |

Índice parcial `(organization_id, record_id, created_at, id) WHERE deleted_at IS NULL`.
`ON DELETE RESTRICT` em todas as FKs. Sem coluna de quem removeu: a auditoria
guarda o ator (chamada do agente). Entidade TypeORM
`followUpAttachment.entity.ts` registrada no módulo.

## 6. Módulo `Attachment` (`src/modules/Attachment/`)

Rotas aninhadas no registro: controller `@Controller('follow-ups/:followUpId/attachments')`,
tag Swagger `follow-up-attachments`. Casos de uso: `UploadAttachment`,
`ListAttachments`, `DownloadAttachment`, `RemoveAttachment`. Repositório
`attachment.repository.ts` no padrão do `FollowUpRepository` (SQL com
`PATIENT_SCOPE_WHERE`, transações, `translatePgError`, `insertAuditEvent`).

### 6.1 Envio — `POST /follow-ups/{followUpId}/attachments`

`multipart/form-data` com uma parte de arquivo `file`. Guard
`follow_ups:create` (só o cuidador). Resposta `201` com `AttachmentDto`.

Recepção: interceptor próprio sobre o `multer` já presente
(`@nestjs/platform-express`), em disco (§4), limites `fileSize = 10 MiB`, `files = 1`,
`fields = 0`, `parts = 1`. Os erros do multer viram `DomainException`:

| Situação | Resposta |
| --- | --- |
| Arquivo acima de 10 MiB | `413 ATTACHMENT_TOO_LARGE` |
| Requisição não multipart, sem a parte `file`, parte com outro nome, mais de uma parte | `422 ATTACHMENT_FILE_REQUIRED` |
| Arquivo com 0 byte | `422 ATTACHMENT_EMPTY` |
| Conteúdo fora de JPEG/PNG/WEBP/PDF | `415 ATTACHMENT_UNSUPPORTED_TYPE` |

Detecção (função pura `detectAttachmentType`, sobre os primeiros 12 bytes lidos
do temporário): JPEG `FF D8 FF`; PNG
`89 50 4E 47 0D 0A 1A 0A`; WEBP `RIFF????WEBP`; PDF `%PDF-`. O tipo gravado é o
detectado.

Regras, nesta ordem (caso de uso + uma transação no repositório):

1. Conteúdo validado (tabela acima) **antes** de tocar banco ou disco.
2. Transação: trava `FOR SHARE` do paciente e `FOR UPDATE` do registro
   (serializa a contagem e conflita com a anulação, que também usa
   `FOR UPDATE`).
   - registro inexistente ou paciente fora do alcance do cuidador
     (`findPatientInScope`): `404 FOLLOW_UP_NOT_FOUND`;
   - cuidador que não é o autor: `403 ATTACHMENT_NOT_AUTHOR`;
   - registro anulado: `409 ATTACHMENT_FOLLOW_UP_ANNULLED`;
   - paciente inativo: `409 ATTACHMENT_PATIENT_INACTIVE`;
   - já há 5 anexos ativos: `409 ATTACHMENT_LIMIT_REACHED`.
3. Ainda na transação, com as checagens aprovadas: promove o temporário para a
   chave final (§4),
   insere a linha e a auditoria `follow_up_attachment.created`
   (`{ followUpId, fileName, contentType, sizeBytes }`).
4. **Compensação:** se qualquer passo depois da gravação falhar (INSERT,
   auditoria, COMMIT), o caso de uso apaga o arquivo e relança o erro. Se a
   própria remoção falhar, o arquivo fica órfão **e inacessível** (o download só
   parte de uma linha válida do banco) e um `warn` sai no log com a chave. Não
   há caminho em que exista linha sem arquivo por causa do envio.

### 6.2 Nome do arquivo

`file_name` = nome original saneado: só a parte final (corta em `/` e `\`), sem
caracteres de controle, espaços aparados, até 255 caracteres (preservando a
extensão se couber). Vazio após saneamento → `anexo.<ext do tipo detectado>`.
É apenas rótulo; nunca participa do caminho.

### 6.3 Listagem — `GET /follow-ups/{followUpId}/attachments`

Guard `patient_history:read`. Registro fora do alcance: `404 FOLLOW_UP_NOT_FOUND`.
Devolve os anexos **ativos** (inclusive de registro anulado e de paciente
inativo), ordem `created_at, id`, sem paginação (no máximo 5). `200` com
`AttachmentDto[]`.

**`AttachmentDto`:** `id`, `followUpId`, `fileName`, `contentType`,
`sizeBytes`, `uploadedBy` (`{ id, name }`), `uploadedAt`. Não traz
`storage_key`.

### 6.4 Download — `GET /follow-ups/{followUpId}/attachments/{attachmentId}/content`

Guard `patient_history:read`. Reautoriza a cada chamada pelo mesmo alcance da
leitura do registro.

- anexo inexistente, removido, de outro registro, de outra organização ou de
  paciente fora do alcance: `404 ATTACHMENT_NOT_FOUND`;
- linha válida mas arquivo ausente no volume: `404 ATTACHMENT_CONTENT_MISSING`
  e `error` no log com o id do anexo (sinal de perda de volume/backup).

Resposta `200` **binária, fora do envelope** (`StreamableFile`; o
`ResponseEnvelopeInterceptor` passa a deixar `StreamableFile` intacto), com:
`Content-Type` = tipo gravado; `Content-Length`; `Content-Disposition:
attachment; filename="<ascii>"; filename*=UTF-8''<nome codificado>`;
`Cache-Control: private, no-store`. O `nosniff` e o CSP já vêm do Helmet.
Erros continuam no envelope de erro JSON.

### 6.5 Remoção — `DELETE /follow-ups/{followUpId}/attachments/{attachmentId}`

Guard `follow_ups:annul` **ou** `follow_ups:create`. Resposta `204`, sem corpo.

Transação com `FOR UPDATE` do anexo:

- com `follow_ups:annul` (admin, profissional): qualquer anexo da organização;
- só com `follow_ups:create` (cuidador): paciente no alcance (senão
  `404 ATTACHMENT_NOT_FOUND`) e ter enviado o anexo (senão
  `403 ATTACHMENT_NOT_AUTHOR`);
- já removido ou inexistente: `404 ATTACHMENT_NOT_FOUND`;
- registro anulado ou paciente inativo **não** impedem remover (corrigir
  exposição de dado não depende do cadastro; mesmo raciocínio da anulação);
- `deleted_at = now()` e auditoria `follow_up_attachment.removed`
  (`{ followUpId, fileName, contentType, sizeBytes, ownAttachment }`).

Depois do COMMIT, o arquivo é apagado do volume. Se o `unlink` falhar, a linha
já está removida (inacessível) e sai um `warn` com a chave. Removido não volta.

## 7. Efeitos em fluxos existentes

- Anulação de registro (BE-12): anexos ficam, legíveis; não entram novos.
- Inativação de paciente: anexos ficam, legíveis; não entram novos.
- Revogação de vínculo e troca de perfil: o alcance de `findPatientInScope`
  corta listagem, download, envio e remoção na requisição seguinte.
- Inativação de usuário: sessões revogadas (BE-06); anexos que enviou ficam.
- `FollowUpDto` **não** muda: o frontend lista anexos pela rota própria.

## 8. Falhas e consistência banco × volume

| Falha | Estado final |
| --- | --- |
| Validação de conteúdo/limite | nada gravado |
| Checagem de acesso/estado | nada gravado (arquivo só é escrito depois) |
| Escrita do arquivo | transação desfeita; temporário apagado |
| INSERT/auditoria/COMMIT após escrita | transação desfeita; arquivo apagado (compensação) |
| Compensação falha | arquivo órfão inacessível + `warn` |
| `unlink` após remoção falha | linha removida; arquivo órfão inacessível + `warn` |
| Arquivo some do volume | `404 ATTACHMENT_CONTENT_MISSING` + `error` no log |

Órfãos não dão acesso a nada; limpeza periódica fica para o BE-25 (operação),
registrada como pendência.

## 9. Erros (catálogo `attachment.errors.ts`)

| Código | Status | Mensagem |
| --- | --- | --- |
| `ATTACHMENT_FILE_REQUIRED` | 422 | Envie um arquivo no campo `file`. |
| `ATTACHMENT_EMPTY` | 422 | O arquivo enviado está vazio. |
| `ATTACHMENT_TOO_LARGE` | 413 | O arquivo passa do limite de 10 MB. |
| `ATTACHMENT_UNSUPPORTED_TYPE` | 415 | Envie uma imagem JPEG, PNG ou WEBP, ou um PDF. |
| `ATTACHMENT_NOT_AUTHOR` | 403 | Só quem fez o registro pode anexar ou remover arquivos dele. |
| `ATTACHMENT_FOLLOW_UP_ANNULLED` | 409 | O registro foi anulado e não recebe anexos. |
| `ATTACHMENT_PATIENT_INACTIVE` | 409 | O paciente está inativo e não recebe novos anexos. |
| `ATTACHMENT_LIMIT_REACHED` | 409 | Este registro já tem 5 anexos. |
| `ATTACHMENT_NOT_FOUND` | 404 | Anexo não encontrado. |
| `ATTACHMENT_CONTENT_MISSING` | 404 | O arquivo deste anexo não está disponível. |

Mais `FOLLOW_UP_NOT_FOUND` (registro), `AUTH_UNAUTHENTICATED`, `AUTH_FORBIDDEN`
e `VALIDATION_FAILED` (UUID inválido no path).

## 10. Swagger e manual

- Envio: `@ApiConsumes('multipart/form-data')`, `@ApiBody` com `file`
  `string/binary`, `@ApiEnvelope(AttachmentDto, 201)`.
- Download: `@ApiProduces` dos 4 tipos e resposta `200` `string/binary`; sem
  `@ApiEnvelope` (binário, exceção documentada, como as rotas de docs).
- Remoção: `204` sem corpo; sem `@ApiEnvelope`.
- Todas com `@ApiErrors` e Bearer. Teste de contrato OpenAPI do módulo.
- Manual: quatro notas em `docs/api/endpoints/` + índice + seção de variáveis
  (`STORAGE_PATH`) e volume em `docs/deploy-vps.md` (inclui a linha de backup
  do volume no molde `vps-hostinger-backup`, marcada como a configurar).

## 11. Testes

- **Unitários:** `detectAttachmentType` (4 tipos, texto disfarçado de `.jpg`,
  arquivo curto); saneamento do nome; `FileStorageService` em diretório
  temporário (grava/lê/remove, escrita atômica, chave fora da raiz recusada,
  `ENOENT` ignorado); caso de uso de envio com repositório dublado
  (falha após escrita → arquivo apagado; checagem negativa → nada escrito);
  interceptor (erros do multer → códigos).
- **e2e em PostgreSQL descartável** (atrás de `VITACARE_TEST_DATABASE_URL`, com
  `STORAGE_PATH` temporário): envio feliz e bytes idênticos no download;
  cuidador não autor (403); cuidador sem vínculo e vínculo revogado (404 no
  envio, lista e download); **outra organização com ids conhecidos** (404);
  familiar vinculado baixa, não vinculado 404; profissional/admin não enviam
  (403) mas removem; limite de 5 (409) e removido libera vaga; 10 MiB + 1
  (413); texto com extensão `.jpg` (415); vazio (422); sem arquivo (422);
  registro anulado e paciente inativo (409 no envio, leitura segue); remoção
  apaga o arquivo do disco e o download vira 404; arquivo apagado à mão →
  `ATTACHMENT_CONTENT_MISSING`; falha de INSERT forçada não deixa arquivo no
  volume; CHECK/FK da migration (anexo de registro de outra organização
  recusado); `migration:run`/`revert`.
- **Timeout:** o envio segue o `HTTP_REQUEST_TIMEOUT_MS` (60 s); 10 MiB nesse
  prazo exige ~1,4 Mbit/s. Sem ajuste nesta entrega (chamada do agente).
- **Runtime em container:** imagem buildada com o volume nomeado; envio,
  recriação do container e download do mesmo arquivo (persistência), conferindo
  dono/permissão em `/app/storage`.

## 12. Chamadas do agente (pendentes de confirmação)

1. Módulo `Attachment` com rotas aninhadas em `follow-ups`; armazenamento em
   `src/storage/` como infraestrutura transversal.
2. `uploaded_by_user_id` acrescentado ao MER; sem coluna de quem removeu
   (auditoria guarda).
3. Upload bufferizado em disco no próprio volume, não em memória; timeout de
   60 s mantido.
4. Remoção permitida com registro anulado e paciente inativo.
5. Download como anexo (`Content-Disposition: attachment`), nunca `inline`.
6. Arquivo ausente → `404 ATTACHMENT_CONTENT_MISSING`, distinto de
   `ATTACHMENT_NOT_FOUND`.
7. Sem auditoria de download/listagem (leituras não são auditadas no BE-12).
8. 10 MB = 10 MiB (10 485 760 bytes).
9. A API não sobe sem escrita em `STORAGE_PATH`; `/health/ready` não muda.
10. Sem limpeza automática de órfãos nesta entrega.

# BE-13 Anexos de registro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anexos privados (JPEG/PNG/WEBP/PDF) em registros de acompanhamento, gravados num volume Docker persistente e baixados só por quem lê o registro.

**Architecture:** `src/storage/` (infra global, como `src/redis/`) guarda arquivos sob `STORAGE_PATH` com chaves geradas no servidor. O módulo `src/modules/Attachment/` expõe quatro rotas em `follow-ups/:followUpId/attachments`; o repositório SQL reaproveita `PATIENT_SCOPE_WHERE`/`findPatientInScope` e grava o arquivo dentro da transação, com compensação no caso de uso. Download é `StreamableFile` fora do envelope.

**Tech Stack:** NestJS 11, TypeORM 0.3 (SQL cru como no BE-12), multer 2 (transitivo de `@nestjs/platform-express`), PostgreSQL, Jest/supertest.

**Spec:** `docs/superpowers/specs/2026-11-05-be-13-anexos-registro-design.md`

## Global Constraints

- Tipos aceitos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, detectados por bytes.
- Tamanho máximo: `10_485_760` bytes; arquivo de 0 byte recusado.
- No máximo 5 anexos ativos (`deleted_at IS NULL`) por registro.
- Chave: `attachments/<organizationId>/<attachmentId>`; temporários em `<STORAGE_PATH>/tmp/`.
- `storage_key` nunca sai pela API nem em log de erro ao cliente.
- Auditoria: `follow_up_attachment.created` e `.removed` com `{ followUpId, fileName, contentType, sizeBytes }` (+ `ownAttachment` na remoção). `entityType: 'follow_up_attachment'`.
- Sem dependência nova no `package.json`. Sem `*.spec.ts` em `src/`; testes importam por `@/`.
- Mensagens de erro: as da tabela §9 do spec, literalmente.
- `organizationId` e autor sempre da sessão. Outro tenant → 404.

## Review Focus

1. Nome de arquivo com `../`, `\`, só espaços ou caracteres de controle → rótulo saneado, nunca afeta o caminho (Task 3 testa `sanitizeFileName`).
2. Upload multipart com a parte `file` duplicada ou com campo extra de texto → `422 ATTACHMENT_FILE_REQUIRED`, sem temporário largado (Task 5, e2e).
3. Dois uploads simultâneos no registro com 4 anexos → só um passa (trava `FOR UPDATE`; Task 6, e2e com `Promise.all`).
4. Download depois de revogar o vínculo do familiar → 404 na requisição seguinte (Task 6, e2e).
5. Temporários: após upload recusado (415/409/404), `<STORAGE_PATH>/tmp` fica vazio (Task 6, e2e confere o diretório).

---

### Task 1: Armazenamento em volume (`src/storage/`) e configuração

**Files:**
- Create: `src/config/storage.config.ts`, `src/storage/fileStorage.service.ts`, `src/storage/storage.module.ts`
- Modify: `src/config/env.validation.ts` (`STORAGE_PATH: Joi.string().trim().default('./storage')`), `src/app.module.ts` (load `storageConfig`, import `StorageModule`), `.env.example`, `.gitignore` e `.dockerignore` (`storage/`), `Dockerfile` (runtime: `RUN mkdir -p /app/storage && chown node:node /app/storage` antes de `USER node`; `ENV STORAGE_PATH=/app/storage`), `docker-compose.prod.yml` (`STORAGE_PATH: /app/storage`, volume `vitacare-storage:/app/storage`, bloco `volumes: vitacare-storage:` com comentário do backup), `compose.yaml` (volume `vitacare-storage-dev:/app/storage`)
- Test: `tests/storage/fileStorage.service.spec.ts`

**Interfaces:**
- Produces:
  - `registerAs('storage', () => ({ path: process.env.STORAGE_PATH ?? './storage' }))`
  - `class FileStorageService implements OnModuleInit` (construtor recebe `ConfigService`, lê `storage.path`, resolve absoluto):
    - `onModuleInit(): Promise<void>` — `mkdir -p` da raiz e de `tmp/`, `access(W_OK)`; lança se falhar.
    - `get tempDir(): string`
    - `promote(tempPath: string, key: string): Promise<void>` — `mkdir -p dirname`, `rename`, `chmod 0o640`.
    - `open(key: string): Promise<{ stream: Readable; size: number } | null>` — `null` em `ENOENT`.
    - `remove(key: string): Promise<void>` — ignora `ENOENT`.
    - `discard(path: string): Promise<void>` — apaga temporário, ignora `ENOENT`.
  - Toda chave passa por `resolveKey(key)` privado: lança `Error` se o caminho resolvido não começar por `root + sep`.
  - `@Global() StorageModule` exporta `FileStorageService`.

- [ ] **Step 1: testes falhando** em diretório de `fs.mkdtemp(os.tmpdir())`: `onModuleInit` cria raiz e `tmp`; `promote` move o temporário para `attachments/org/id` e o temporário some; `open` devolve stream com os mesmos bytes e `size`; `open` de chave ausente → `null`; `remove` duas vezes não lança; `promote(tmp, '../fora')` rejeita; `onModuleInit` com raiz sem escrita (`chmod 0o500`) rejeita.
- [ ] **Step 2:** `npx jest tests/storage` → FAIL (módulo inexistente).
- [ ] **Step 3:** implementar config, serviço, módulo e as mudanças de Docker/compose/env.
- [ ] **Step 4:** `npx jest tests/storage` → PASS; `npm run build` limpo; `docker compose -f docker-compose.prod.yml config >/dev/null` com `DB_PASSWORD=x REDIS_PASSWORD=x` → sem erro.
- [ ] **Step 5:** commit `feat(storage): volume persistente para arquivos privados`.

### Task 2: Envelope deixa `StreamableFile` passar

**Files:**
- Modify: `src/common/http/responseEnvelope.interceptor.ts`
- Test: `tests/common/responseEnvelope.interceptor.spec.ts`

- [ ] **Step 1:** teste `mantem StreamableFile fora do envelope`: handler devolve `new StreamableFile(Buffer.from('x'))`; o resultado do observable é a mesma instância.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** no `map`, `result instanceof StreamableFile ? result : buildEnvelope(result, requestId)`.
- [ ] **Step 4:** `npx jest tests/common` → PASS.
- [ ] **Step 5:** commit `feat(http): resposta binaria fora do envelope`.

### Task 3: Migration, entidade, catálogo de erros e funções puras

**Files:**
- Create: `src/database/migrations/1791100000000-CreateFollowUpAttachments.ts` (tabela do spec §5; CHECKs `btrim(file_name) <> ''`, `content_type IN (...)`, `size_bytes > 0`; `UNIQUE (storage_key)`; FKs compostas `(record_id, organization_id)` → `follow_up_records`, `(uploaded_by_user_id, organization_id)` → `users`; índice parcial `follow_up_attachments_record_active_idx`; `down` derruba a tabela), `src/modules/Attachment/entities/followUpAttachment.entity.ts`, `src/modules/Attachment/attachment.errors.ts` (§9 do spec), `src/modules/Attachment/types/attachment.types.ts`, `src/modules/Attachment/policies/attachmentContent.policy.ts`
- Test: `tests/modules/Attachment/attachmentContent.policy.spec.ts`

**Interfaces:**
- Produces (em `attachment.types.ts`):
  - `ATTACHMENT_CONTENT_TYPES = ['image/jpeg','image/png','image/webp','application/pdf'] as const`; `type AttachmentContentType`
  - `ATTACHMENT_MAX_BYTES = 10_485_760`; `ATTACHMENT_MAX_PER_RECORD = 5`
  - `interface AttachmentRow { id; followUpId; fileName; contentType: AttachmentContentType; sizeBytes: number; uploadedBy: UserRef; uploadedAt: Date }` (`UserRef` de `FollowUp/types`)
- Produces (em `attachmentContent.policy.ts`):
  - `detectAttachmentType(head: Buffer): AttachmentContentType | null`
  - `sanitizeFileName(original: string | undefined, type: AttachmentContentType): string` — fallback `anexo.jpg|png|webp|pdf`.
  - `contentDisposition(fileName: string): string` — `attachment; filename="<ascii, aspas e não-ASCII viram _>"; filename*=UTF-8''<encodeURIComponent>`.
- `AttachmentErrors` com chaves `FILE_REQUIRED, EMPTY, TOO_LARGE, UNSUPPORTED_TYPE, NOT_AUTHOR, FOLLOW_UP_ANNULLED, PATIENT_INACTIVE, LIMIT_REACHED, NOT_FOUND, CONTENT_MISSING`.

- [ ] **Step 1:** testes: assinaturas dos 4 tipos → tipo; `Buffer.from('hello world.jpg')` → `null`; buffer de 3 bytes → `null`; `RIFF....WAVE` → `null`; `sanitizeFileName('../../etc/passwd', 'image/png')` → `'passwd'`; `'C:\\fotos\\ferida.jpg'` → `'ferida.jpg'`; `'  \u0000\u001f '` → `'anexo.png'`; nome de 300 chars terminado em `.pdf` → 255 chars terminando em `.pdf`; `contentDisposition('ferida "nova" ç.jpg')` contém `filename="ferida _nova_ _.jpg"` e `filename*=UTF-8''ferida%20%22nova%22%20%C3%A7.jpg`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar migration, entidade (`deletedAt` mapeado), erros, tipos e policy.
- [ ] **Step 4:** `npx jest tests/modules/Attachment` → PASS; `npm run build`.
- [ ] **Step 5:** commit `feat(attachment): schema de anexos, catalogo de erros e deteccao de conteudo`.

### Task 4: Repositório

**Files:**
- Create: `src/modules/Attachment/repositories/attachment.repository.ts`

**Interfaces:**
- Consumes: `findPatientInScope`, `PATIENT_SCOPE_WHERE`, `insertAuditEvent`, `translatePgError`, `FollowUpActor` (de `FollowUp/types`).
- Produces (tipos em `attachment.types.ts`):
  - `interface UploadAttachmentCommand extends FollowUpActor { followUpId; attachmentId; fileName; contentType; sizeBytes; storageKey }`
  - `type UploadAttachmentOutcome = { kind: 'follow_up_not_found'|'not_author'|'follow_up_annulled'|'patient_inactive'|'limit_reached' } | { kind: 'created'; attachment: AttachmentRow }`
  - `interface RemoveAttachmentCommand extends FollowUpActor { followUpId; attachmentId; removeAny: boolean }`
  - `type RemoveAttachmentOutcome = { kind: 'not_found'|'not_author' } | { kind: 'removed'; storageKey: string }`
  - `AttachmentRepository`:
    - `upload(command, store: () => Promise<void>): Promise<UploadAttachmentOutcome>` — transação: `SELECT ... FROM follow_up_records WHERE organization_id=$1 AND id=$2 FOR UPDATE`; `FOR SHARE` do paciente; `findPatientInScope`; autor; status; paciente ativo; `count(*)` ativos `>= ATTACHMENT_MAX_PER_RECORD`; então `await store()`, INSERT com o `id` dado, auditoria, devolve a linha relida.
    - `list(scope: PatientScope, followUpId): Promise<AttachmentRow[] | null>` — `null` se o registro está fora do alcance.
    - `findForDownload(scope, followUpId, attachmentId): Promise<(AttachmentRow & { storageKey: string }) | null>`
    - `remove(command): Promise<RemoveAttachmentOutcome>` — `FOR UPDATE` do anexo ativo com `record_id = followUpId`; sem `removeAny`: alcance + `uploaded_by_user_id = actor`; `deleted_at = now()`, auditoria com `ownAttachment`.
  - Erros não-domínio passam por `translatePgError(error, 'follow_up_attachments')`, como `FollowUpRepository.write`.

Sem teste próprio: coberto pelo e2e da Task 6. Commit junto da Task 5.

### Task 5: Casos de uso, upload interceptor, controller e módulo

**Files:**
- Create: `src/modules/Attachment/UploadAttachment/uploadAttachment.useCase.ts`, `src/modules/Attachment/ListAttachments/listAttachments.useCase.ts`, `src/modules/Attachment/DownloadAttachment/downloadAttachment.useCase.ts`, `src/modules/Attachment/RemoveAttachment/removeAttachment.useCase.ts`, `src/modules/Attachment/http/attachmentUpload.interceptor.ts`, `src/modules/Attachment/dtos/attachment.dto.ts`, `src/modules/Attachment/parsers/attachment.parser.ts`, `src/modules/Attachment/attachment.controller.ts`, `src/modules/Attachment/attachment.module.ts`
- Modify: `src/app.module.ts` (import `AttachmentModule`)
- Test: `tests/modules/Attachment/attachmentUseCases.spec.ts`

**Interfaces:**
- `type UploadedTempFile = { path: string; originalName: string; size: number }` (em `attachment.types.ts`).
- `AttachmentUploadInterceptor` (Nest `NestInterceptor`, injeta `FileStorageService`): `multer({ storage: diskStorage({ destination: tempDir, filename: randomUUID }), limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1, fields: 0, parts: 1 } }).single('file')`; `MulterError LIMIT_FILE_SIZE` → `TOO_LARGE`; demais `MulterError` e content-type não multipart → `FILE_REQUIRED`; põe `req.attachmentFile: UploadedTempFile | undefined`; no `finalize` do observable chama `discard(path)` (rename já moveu o aprovado, então `ENOENT` é o caso normal).
- `UploadAttachmentUseCase.execute(followUpId, file: UploadedTempFile | undefined, ctx): Promise<AttachmentDto>` — sem arquivo → `FILE_REQUIRED`; `size === 0` → `EMPTY`; lê os 12 primeiros bytes, `detectAttachmentType` → `UNSUPPORTED_TYPE`; gera `attachmentId = randomUUID()`, `storageKey`; chama `repository.upload(command, () => storage.promote(file.path, key))` marcando `promoted = true`; em exceção com `promoted` → `storage.remove(key)` (falha da remoção: `Logger.warn` com a chave) e relança; mapeia outcomes para `AttachmentErrors` / `FollowUpErrors.NOT_FOUND`.
- `DownloadAttachmentUseCase.execute(followUpId, attachmentId, ctx): Promise<{ file: StreamableFile }>` — linha ausente → `NOT_FOUND`; `storage.open` `null` → `Logger.error` com o id e `CONTENT_MISSING`; `new StreamableFile(stream, { type, length: size, disposition: contentDisposition(fileName) })`.
- `RemoveAttachmentUseCase.execute(followUpId, attachmentId, ctx): Promise<void>` — `removeAny = hasPermission(ctx, FOLLOW_UPS_ANNUL)`; após `removed`, `storage.remove(storageKey)` com `warn` se falhar.
- `ListAttachmentsUseCase.execute(followUpId, ctx): Promise<AttachmentDto[]>` — `null` → `FollowUpErrors.NOT_FOUND`.
- `toAttachmentResponse(row: AttachmentRow, ctx: RequestContext): AttachmentDto` — campos do spec §6.3.
- Controller conforme spec §6/§10: guards `FOLLOW_UPS_CREATE` (POST), `PATIENT_HISTORY_READ` (GET lista e `/content`), `RequireAnyPermission(FOLLOW_UPS_ANNUL, FOLLOW_UPS_CREATE)` (DELETE `@HttpCode(204)`); download com `@Header('Cache-Control', 'private, no-store')`; `UuidParam` nos dois ids.

- [ ] **Step 1:** testes com repositório e storage dublados: upload feliz chama `promote` com a chave `attachments/<org>/<id>`; outcome `limit_reached` → `ATTACHMENT_LIMIT_REACHED` e `promote` não chamado; repositório chama `store()` e depois lança → `storage.remove(key)` chamado e erro original relançado; `remove` também falha → erro original relançado; arquivo de texto → `ATTACHMENT_UNSUPPORTED_TYPE` sem tocar o repositório; `size 0` → `ATTACHMENT_EMPTY`; download com `open` `null` → `ATTACHMENT_CONTENT_MISSING`; remoção `removed` → `storage.remove` chamado depois.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar Tasks 4 e 5.
- [ ] **Step 4:** `npx jest tests/modules/Attachment` → PASS; `npm run build && npm run lint`.
- [ ] **Step 5:** commit `feat(attachment): envio, listagem, download e remocao de anexos`.

### Task 6: e2e em PostgreSQL e contrato OpenAPI

**Files:**
- Create: `tests/modules/Attachment/attachment.e2e-spec.ts` (contrato OpenAPI com guard stub e repositório dublado, molde `tests/modules/FollowUp/followUp.e2e-spec.ts`), `tests/modules/Attachment/attachmentManagement.e2e-spec.ts` (PostgreSQL, molde `followUpManagement.e2e-spec.ts`, com a migration nova em `MIGRATIONS`, `follow_up_attachments` no `TRUNCATE`, `FileStorageService` real sobre `mkdtemp` e `AttachmentUploadInterceptor` no módulo de teste)

- [ ] **Step 1: contrato:** as 4 rotas existem com `security` Bearer; POST tem `multipart/form-data` com `file` binário e 201 com envelope de `AttachmentDto`; `/content` 200 `string/binary`; DELETE 204; `AttachmentDto` exige `id, followUpId, fileName, contentType, sizeBytes, uploadedBy, uploadedAt` e não tem `storageKey`.
- [ ] **Step 2: cenários PostgreSQL** (cada um um `it`): envio feliz pelo cuidador autor e download com bytes idênticos, `content-type`, `content-disposition` e `cache-control: private, no-store`; lista com 1 item; cuidador2 vinculado não autor → 403 `ATTACHMENT_NOT_AUTHOR`; cuidador sem vínculo → 404 `FOLLOW_UP_NOT_FOUND` (envio/lista) e 404 `ATTACHMENT_NOT_FOUND` (download); tenant B com os ids de A → 404 nas 4 rotas; familiar vinculado baixa e, após `UPDATE user_patients SET deleted_at = now()`, recebe 404; profissional/admin POST → 403 `AUTH_FORBIDDEN`; 6º anexo → 409 `ATTACHMENT_LIMIT_REACHED`, remover um libera; dois uploads simultâneos com 4 ativos → um 201 e um 409; 10 485 761 bytes → 413; texto com nome `foto.jpg` → 415; 0 byte → 422 `ATTACHMENT_EMPTY`; sem arquivo e parte `file` duplicada → 422 `ATTACHMENT_FILE_REQUIRED`; registro anulado → 409 `ATTACHMENT_FOLLOW_UP_ANNULLED` e download segue 200; paciente inativo → 409 `ATTACHMENT_PATIENT_INACTIVE`; remoção pelo autor → 204, arquivo some do disco, download 404, auditoria `follow_up_attachment.removed` com `fileName`; remoção pelo profissional → 204; arquivo apagado à mão → 404 `ATTACHMENT_CONTENT_MISSING`; INSERT forçado a falhar (`ALTER TABLE ... ADD CONSTRAINT ... CHECK (false) NOT VALID` temporário) → 500 e nenhum arquivo em `attachments/`; após cada recusa `tmp/` vazio; INSERT direto com `record_id` de B e `organization_id` de A → violação de FK; migration revert/run.
- [ ] **Step 3:** subir PostgreSQL 16 descartável (`docker run --rm -d --name vitacare-be13-pg -e POSTGRES_PASSWORD=... -p 55432:5432 postgres:16`, criar `vitacare_schema_test`) e rodar `VITACARE_TEST_DATABASE_URL=postgres://...@127.0.0.1:55432/vitacare_schema_test npx jest --config tests/jest-e2e.json tests/modules/Attachment --runInBand` → PASS. Corrigir o que falhar.
- [ ] **Step 4:** suíte completa: `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` (com o banco descartável) → PASS.
- [ ] **Step 5:** commit `test(attachment): isolamento, limites, compensacao e contrato openapi dos anexos`.

### Task 7: Runtime no container com volume

- [ ] **Step 1:** `docker build -t vitacare-backend:be13 .`; rede descartável com PostgreSQL 16 e Redis 7; `docker run` da imagem com `RUN_MIGRATIONS=true`, volume `vitacare-be13-storage:/app/storage`; `docker exec -e NODE_ENV=development <container> node dist/cli/seed-dev.js` para ter usuários; paciente, vínculo, formulário e registro criados via HTTP (fluxo do BE-12).
- [ ] **Step 2:** enviar um PNG, `docker rm -f` e subir de novo o container com o mesmo volume; baixar o anexo e comparar `sha256sum` → iguais; `docker exec ... stat -c '%U %a' /app/storage/attachments/<org>/<id>` → `node 640`.
- [ ] **Step 3:** derrubar tudo (containers, rede, volume de teste). Anotar comandos e saídas para a nota da tarefa.

### Task 8: Documentação do repositório e do vault

**Files:**
- Create: `docs/api/endpoints/follow-up-attachments-upload.md`, `follow-up-attachments-list.md`, `follow-up-attachments-download.md`, `follow-up-attachments-remove.md` (estrutura de `docs/api/padrao-endpoint.md`)
- Modify: `docs/api/README.md` (índice + erros + nota sobre resposta binária e 204), `docs/deploy-vps.md` (volume, `STORAGE_PATH`, linha de backup semanal do volume `vitacare_vitacare-storage` no molde `vps-hostinger-backup`, marcada como a configurar), `src/modules/README.md` se citar módulos, `CLAUDE.md` e `AGENTS.md` (idênticos; parágrafo BE-13 em "Estado atual"), `README.md` se listar variáveis.
- Vault (`/mnt/c/Obsidian/mateus-dev`): tarefa `02-projetos/vitacare-backend/tarefas/2026-10-29-be-13-files.md` (molde da BE-12), evolução nova `09-sistemas/vitacare/evolucao/2026-11-05-anexos-registro-volume-local.md` + índice `vitacare-evolucao.md`, alterações `vitacare-arquivos-alteracoes.md`, `vitacare-dados-anexos-registro-alteracoes.md`, `vitacare-infraestrutura-alteracoes.md`, `vitacare-uc11-alteracoes.md` (nova entrada) + índice `vitacare-alteracoes.md`, `vitacare-backend.md`, backlog (`vitacare-backlog-backend-base-e-acompanhamento.md`), `vitacare-rastreabilidade.md`. Originais (`source: [[vitacare-fonte-tcc]]`) não são editados.

- [ ] **Step 1:** escrever as notas do manual conferindo com o `/api/docs-json` gerado (subir a app de teste ou serializar o documento do teste de contrato).
- [ ] **Step 2:** atualizar `CLAUDE.md`/`AGENTS.md`; `diff CLAUDE.md AGENTS.md` vazio; `git diff --check` limpo.
- [ ] **Step 3:** commit `docs(attachment): manual das rotas de anexos, volume e estado do BE-13`.
- [ ] **Step 4:** escrever as notas do vault com as evidências reais das Tasks 6–7.

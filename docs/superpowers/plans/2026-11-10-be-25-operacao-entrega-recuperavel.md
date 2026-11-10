# BE-25 — Operação e entrega recuperável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os alertas de erro da VPS passam a valer para a API, e os workers ganham heartbeat. Entram também smoke por HTTP, backup e restore de banco + anexos, revert de migration, homologação efêmera no CI publicando a imagem testada, medição de carga e listagem de órfãos, todos com evidência local.

**Architecture:** As mudanças de runtime são pequenas e ficam em `src/common/http/` (opções do pino-http), `src/health/heartbeat/` (fila `operations`), `src/storage/` + `src/cli/` (órfãos) e no entrypoint. A operação fica em scripts sem dependência nova: `scripts/ops/*.mjs` (Node 22 com `fetch`) e `scripts/ops/*.sh` (POSIX). O CI ganha o job `homologacao`, que absorve o `imagem`.

**Tech Stack:** NestJS 11, nestjs-pino/pino-http, BullMQ, TypeORM/PostgreSQL 17, Redis 8, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-10-be-25-operacao-entrega-recuperavel-design.md`

## Global Constraints

- Nenhuma rota nova ou alterada; Swagger e `docs/api/` sem mudança; sem migration.
- Nenhuma dependência nova em `package.json`.
- Metas: p95 ≤ 500 ms leitura, ≤ 1 s escrita, ≤ 5 s PDF/CSV, 0 respostas 5xx, 50 usuários simultâneos, 1.000 pacientes, container `--memory 512m --cpus 1`.
- RPO 24 h / RTO 4 h; backup diário único (banco + volume), retenção 14 dias.
- Nada de senha, token, URL de push ou valor clínico em log, saída de script ou arquivo de estado.
- Testes em `tests/<area>/`, import pelo alias `@/`; e2e atrás de `VITACARE_TEST_DATABASE_URL`/`VITACARE_TEST_REDIS_URL`.
- Mensagens e textos em português; código no estilo do arquivo vizinho.

## Review Focus

- O Kuma fica fora do ar ou lento: o heartbeat não pode travar o worker nem lançar exceção (timeout de 5 s e aviso no máximo 1 vez por hora). Teste em Task 2.
- O banco cai enquanto Redis e worker continuam vivos: não pode sair pulso. Teste em Task 2.
- Um upload está em andamento quando o CLI de órfãos roda: o arquivo com menos de 24 h nunca é listado. Teste em Task 5.
- O restore é disparado com a API ligada ou sobre um backup corrompido: recusa antes de tocar em qualquer coisa. Verificação em Task 4.
- Smoke `full` apontado para produção por engano: sem `--allow-writes` sai com código 2 antes de qualquer escrita. Verificação em Task 3.

---

### Task 1: Logs com `level_name` e nome de arquivo mascarado

**Files:**
- Create: `src/common/http/httpLogger.options.ts`
- Modify: `src/app.module.ts` (o `pinoHttp` do `LoggerModule.forRootAsync` passa a vir da função)
- Test: `tests/common/httpLogger.options.spec.ts`

**Interfaces:**
- Produces: `monologLevelName(label: string): string` e `buildHttpLoggerOptions(input: { level: string; environment: string }): Options` (tipo `Options` de `pino-http`), com `genReqId`, `serializers.req`, `autoLogging` e `transport` iguais aos de hoje, `formatters.level` → `{ level: number, level_name }` e `redact` com `res.headers["content-disposition"]` acrescentado.

- [ ] **Step 1: Write the failing test.** Trace e debug → `DEBUG`, info → `INFO`, warn → `WARNING`, error → `ERROR`, fatal → `CRITICAL`. Um `pino(options-sem-transport, stream em memória)` com `logger.error({ res: { headers: { 'content-disposition': 'attachment; filename="exame-joao.pdf"' } } }, 'x')` grava uma linha JSON com `level === 50`, `level_name === 'ERROR'`, `res.headers['content-disposition'] === '[Redacted]'`, e a linha não contém `joao`. `authorization` continua mascarado.
- [ ] **Step 2:** `npm test -- tests/common/httpLogger.options.spec.ts`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar e trocar o uso em `app.module.ts`.
- [ ] **Step 4:** `npm test -- tests/common` e `npm run test:e2e -- tests/app/app.e2e-spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(logs): level_name para o Loki e nome de arquivo fora do log (BE-25)`.

### Task 2: Heartbeat dos workers no Uptime Kuma

**Files:**
- Create: `src/config/operations.config.ts`, `src/health/heartbeat/heartbeat.processor.ts`, `src/health/heartbeat/sendHeartbeat.ts`
- Modify: `src/config/env.validation.ts` (`UPTIME_KUMA_PUSH_URL: Joi.string().uri({ scheme: ['http','https'] }).allow('').optional()`), `src/app.module.ts` (carrega `operationsConfig`), `src/health/health.module.ts` (`BullModule.registerQueue({ name: OPERATIONS_QUEUE })` e o processor), `.env.example`, `.env.production.example`, `docker-compose.prod.yml` (`UPTIME_KUMA_PUSH_URL: ${UPTIME_KUMA_PUSH_URL:-}`)
- Test: `tests/health/heartbeat.spec.ts`, `tests/health/heartbeat.e2e-spec.ts`

**Interfaces:**
- Produces: `OPERATIONS_QUEUE = 'operations'`, `HEARTBEAT_JOB = 'heartbeat'`, `HEARTBEAT_EVERY_MS = 300_000`. `sendHeartbeat(deps: { pushUrl: string; pingDatabase(): Promise<void>; fetch: typeof fetch; timeoutMs?: number }): Promise<'sent' | 'database_down' | 'push_failed'>`, que nunca lança. Config `operations.uptimeKumaPushUrl: string | undefined` (string vazia → `undefined`).
- O processor (`@Processor(OPERATIONS_QUEUE)`) registra o scheduler no `onApplicationBootstrap` só com a URL, sem `await` (padrão do `AutomationProcessor`); sem URL, loga um `info` e não registra. O ping é `dataSource.query('SELECT 1')`. Em `database_down`/`push_failed`, um `warn` por hora no máximo, sem a URL.

- [ ] **Step 1: Write the failing unit tests.** `sent`: o fetch é chamado uma vez com `?status=up&msg=OK` e `AbortSignal`. `database_down`: o ping rejeita, o fetch não é chamado. `push_failed`: o fetch rejeita ou responde 500, sem lançar. Um fetch que nunca resolve termina em `push_failed` dentro de `timeoutMs` (50 no teste). A config com `UPTIME_KUMA_PUSH_URL=''` dá `undefined`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar `sendHeartbeat`, a config e a validação.
- [ ] **Step 4: Write the e2e** (Redis descartável e PostgreSQL). Um módulo com `QueueModule`, `DatabaseModule`, `HealthModule` e um servidor HTTP local fazendo o papel do Kuma, `UPTIME_KUMA_PUSH_URL` apontando para ele: o scheduler `heartbeat` existe em `getJobSchedulers()`, e um job adicionado à mão gera um GET no servidor. Sem a URL, a lista de schedulers da fila fica vazia.
- [ ] **Step 5:** Implementar o processor e o módulo; `npm test -- tests/health` e `npm run test:e2e -- tests/health tests/app`. Expected: PASS. A homologação continua exigindo os quatro schedulers de negócio: conferir que a asserção dela não quebrou.
- [ ] **Step 6:** Commit `feat(ops): heartbeat dos workers no Uptime Kuma (BE-25)`.

### Task 3: Smoke por HTTP

**Files:**
- Create: `scripts/ops/smoke.mjs`, `scripts/ops/lib/client.mjs`
- Modify: `docker-entrypoint.sh` (`revert` desfaz uma migration e sai: `migration:revert` com as mesmas variáveis do `run_migrations`)

**Interfaces:**
- `client.mjs`: `createClient(baseUrl)` → `{ request(method, path, { token, json, form, headers }) → { status, headers, body, bytes } }`; `check(name, fn)` acumula o resultado e imprime `ok  <nome>` ou `FALHOU <nome>: <motivo sem corpo>`; `finish()` sai com código 1 se algo falhou.
- CLI: `node scripts/ops/smoke.mjs --base-url <url> [--mode read|full|verify] [--expect-version <sha>] [--wait <s>] [--allow-writes] [--state-file <path>]`. Ambiente do `full`/`verify`: `SMOKE_PLATFORM_CODE`, `SMOKE_MASTER_EMAIL`, `SMOKE_MASTER_PASSWORD` (a provisória do seed), `SMOKE_ADMIN_PASSWORD` (definitiva de todas as contas criadas; padrão sintético).
- `full` sem `--allow-writes` → código 2 antes de qualquer requisição de escrita.
- O estado (JSON) traz `organizationCode`, `adminEmail`, `patientId`, `followUpId`, `attachmentId`, `attachmentSha256` e `alertId`, nunca senha. O `--wait` repete o `read` até passar ou estourar o tempo (para o deploy).
- Os passos do `full` estão na spec 3.3. Payloads tirados de `tests/app/homologation.e2e-spec.ts` (mesmas rotas e DTOs).

- [ ] **Step 1:** Escrever o `client.mjs` e o modo `read`; rodar contra `npm run start:dev`, com PostgreSQL e Redis descartáveis. Expected: todas as linhas `ok`, código 0. Com `--expect-version errada`, código 1.
- [ ] **Step 2:** Escrever o `full` e o `verify`. Rodar contra a API local migrada e com seed. Expected: `full` com tudo `ok` e o estado gravado; `verify` com tudo `ok`; `full` sem `--allow-writes` com código 2.
- [ ] **Step 3:** Entrypoint `revert`: `docker build --target runtime -t vitacare-backend:be25 .`, depois `docker run --rm --network host ... vitacare-backend:be25 revert` e `migrate`. Expected: a última migration desfeita e reaplicada.
- [ ] **Step 4:** Commit `feat(ops): smoke por HTTP e revert de migration no entrypoint (BE-25)`.

### Task 4: Backup e restauração

**Files:**
- Create: `scripts/ops/backup.sh`, `scripts/ops/restore.sh`

**Interfaces:**
- Variáveis com os padrões da VPS: `PG_CONTAINER=postgresql`, `PG_SUPERUSER=mavila`, `DB_NAME=vitacare`, `DB_OWNER=vitacare`, `STORAGE_VOLUME=vitacare_vitacare-storage`, `BACKUP_DIR=/root/backups/vitacare`, `RETENTION_DAYS=14`, `KUMA_PUSH_URL` (opcional), `APP_CONTAINER=app-vitacare`.
- `backup.sh`: `set -eu`, `umask 077`. Cria `vitacare-<AAAA-MM-DDTHHMM>/`, primeiro `db.dump` (`docker exec $PG_CONTAINER pg_dump -U $PG_SUPERUSER -Fc $DB_NAME`) e depois `storage.tgz` (`docker run --rm -v $STORAGE_VOLUME:/d:ro alpine tar czf - -C /d .`), e por fim `SHA256SUMS`. Apaga as pastas com mais de `RETENTION_DAYS` e, só então, faz o push no Kuma. Imprime o caminho e os tamanhos.
- `restore.sh <pasta> --yes [--target-db <nome>] [--target-volume <nome>]`: confere `sha256sum -c` e recusa se `$APP_CONTAINER` estiver rodando com o volume alvo montado. Faz `DROP DATABASE IF EXISTS` + `CREATE DATABASE ... OWNER $DB_OWNER`, depois `pg_restore --no-owner --role=$DB_OWNER -d <alvo>` pelo `docker exec -i`. Esvazia o volume alvo e extrai o tgz. Imprime `restaurado em <N> s`.

- [ ] **Step 1:** Escrever os dois scripts; `sh -n` em ambos.
- [ ] **Step 2: Ensaio local.** Um Postgres 17 descartável chamado `vitacare-pg-drill`, o volume `vitacare-drill-storage` e a imagem da Task 3 com os dados do smoke `full`. Rodar `backup.sh` com as variáveis do ensaio, depois `restore.sh` para `vitacare_restore` e `vitacare-drill-restore`, subir um segundo container sobre eles e rodar `smoke.mjs --mode=verify`. Expected: SHA do anexo igual e tempo de restauração registrado. Recusas: sem `--yes`, com um byte alterado no dump e com a API ligada no volume, sempre código ≠ 0 e nada alterado.
- [ ] **Step 3:** Commit `feat(ops): backup diario de banco e anexos e restauracao conferida (BE-25)`.

### Task 5: Órfãos no volume

**Files:**
- Create: `src/storage/orphanFiles.ts`, `src/cli/storage-orphans.ts`
- Test: `tests/storage/orphanFiles.spec.ts`, `tests/storage/storageOrphans.e2e-spec.ts`

**Interfaces:**
- `findOrphanFiles(input: { root: string; activeKeys: ReadonlySet<string>; now: Date; minAgeMs?: number }): Promise<OrphanFile[]>`, com `OrphanFile = { key: string; size: number; modifiedAt: Date; kind: 'attachment' | 'temp' }` e `minAgeMs` padrão `86_400_000`. Percorre `attachments/**` (chave relativa à raiz, com `/`) e `tmp/*`.
- `loadActiveStorageKeys(dataSource: DataSource): Promise<Set<string>>`: `SELECT storage_key FROM follow_up_attachments WHERE deleted_at IS NULL`, cruzando organizações de propósito, pois é uma ferramenta do operador.
- O CLI segue o `seed-platform.ts` (dotenv, `databaseConfig`, `buildDataSourceOptions`, `STORAGE_PATH`) e imprime `<kind> <key> <bytes>` e um total. `--delete` remove cada arquivo listado e imprime quantos apagou. Nunca imprime o nome original.

- [ ] **Step 1: Write the failing unit tests** (diretório temporário, `utimes`). O anexo antigo sem chave ativa entra; o antigo com chave ativa não entra; o sem chave com 1 h não entra; o temporário antigo entra como `temp`; diretório vazio dá `[]`; raiz inexistente dá `[]`.
- [ ] **Step 2:** Run → FAIL; implementar; Run → PASS.
- [ ] **Step 3: e2e** (PostgreSQL descartável, migrations de `ALL_MIGRATIONS`). Com uma linha ativa, uma removida (`deleted_at`) e arquivos das duas chaves, só o arquivo da removida volta como órfão.
- [ ] **Step 4:** `npm run build`, depois `node dist/cli/storage-orphans.js` contra o ensaio da Task 4. Expected: lista coerente; `--delete` remove.
- [ ] **Step 5:** Commit `feat(storage): listagem e limpeza manual de arquivos orfaos (BE-25)`.

### Task 6: CI — homologação efêmera publicando a imagem testada

**Files:**
- Create: `scripts/ops/ci-homologation.sh` (o roteiro dos passos 2–7 da spec 3.6, rodável no CI e localmente)
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- `ci-homologation.sh` recebe a imagem por `IMAGE` e as variáveis do banco e do Redis do ambiente (`DB_HOST=127.0.0.1`, `PG_CONTAINER` = id do serviço). Faz o seguinte:
  - sobe a API com `--network host --memory 512m --cpus 1 -e RUN_MIGRATIONS=true -e THROTTLE_LIMIT=100000`;
  - espera o `/health/ready` e roda o seed (extrai a senha da linha `senha provisoria` e a mascara com `::add-mask::` quando `GITHUB_ACTIONS=true`);
  - roda o smoke `full`, o `backup.sh`, o `restore.sh` para `vitacare_restore` e o `verify` num segundo container;
  - faz `revert` + `migrate` + `verify`;
  - testa o rollback para `ROLLBACK_IMAGE` (se definida e se o `docker pull` der certo) com `read` + `verify`, ou deixa aviso.
  - O resumo vai para `$GITHUB_STEP_SUMMARY` quando existir, e `trap` remove containers e volumes.
- Workflow, job `homologacao` (`needs: testes`, com os serviços postgres e redis do job `testes`, `permissions: contents: read, packages: write`):
  - faz o build com `docker/build-push-action` (`load: true`, `tags: vitacare-backend:ci`, `GIT_SHA`, cache `gha`) e roda o script;
  - na `main` sem PR, faz o login no GHCR e um `docker tag`/`docker push` da mesma imagem como `:latest` e `:sha-<commit>`.
- O job `imagem` é removido e o `deploy` passa a `needs: homologacao`. O laço de `curl` é trocado por `actions/checkout` + `node scripts/ops/smoke.mjs --base-url "$APP_URL" --mode read --expect-version "$GITHUB_SHA" --wait 360`. No job `testes`, entra `npm audit --omit=dev --audit-level=high` depois do `npm ci`.

- [ ] **Step 1:** `npm audit --omit=dev --audit-level=high` localmente. Expected: código 0. Se não der 0, parar e levar a Mateus.
- [ ] **Step 2:** Escrever o script e rodá-lo localmente (Postgres e Redis descartáveis, `--network host`, imagem da Task 3, `ROLLBACK_IMAGE` = imagem buildada de `main`). Expected: todos os passos `ok`, tempo de restauração impresso, ambiente limpo no fim (`docker ps -a` sem sobra).
- [ ] **Step 3:** Editar o workflow; validar com `docker run --rm -v "$PWD":/r -w /r rhysd/actionlint:1.7.7` se houver rede, ou senão com um parse do YAML por `node -e` usando o `js-yaml` de `node_modules` se existir. Conferir que `grep -n "imagem" .github/workflows/deploy.yml` só sobra em comentário.
- [ ] **Step 4:** Commit `ci: homologacao efemera da imagem com restore e rollback, publicando a imagem testada (BE-25)`.

### Task 7: Medição de desempenho

**Files:**
- Create: `scripts/ops/load.mjs` (reusa `lib/client.mjs`)

**Interfaces:**
- `node scripts/ops/load.mjs --base-url <url> --allow-writes [--users 50] [--patients 1000] [--records-per-patient 5] [--duration 120] [--report <json>]`, com as mesmas variáveis de master do smoke.
- O preparo pela API usa concorrência de 10. A carga usa N sessões em laço durante `duration`, com peso por categoria: leitura ~80%, escrita ~17%, exportação ~3%.
- A saída é uma tabela por categoria e por rota (n, p50, p95, p99, 5xx, 429), com veredito contra as metas da Global Constraints. O código de saída é 1 se alguma meta falhar.

- [ ] **Step 1:** Escrever o script; rodar com `--patients 20 --users 5 --duration 10` contra a API local. Expected: relatório completo.
- [ ] **Step 2:** Medição real: imagem `--memory 512m --cpus 1`, Postgres e Redis descartáveis, valores padrão. Guardar o relatório no scratchpad e os números na nota da tarefa. Se uma meta falhar, investigar a causa (superpowers:systematic-debugging) antes de qualquer otimização, e só corrigir dentro do escopo com a concordância de Mateus.
- [ ] **Step 3:** Commit `feat(ops): script de carga com as metas do RNF008 (BE-25)`.

### Task 8: Documentação e vault

**Files:**
- Modify: `docs/deploy-vps.md` (passo 10 com uma linha de cron diária via `backup.sh` e o Push do Kuma de 25 h, além de restore, revert, heartbeat com monitor Push de 600 s, smoke, órfãos, metas, LogQL de p95 e erro, e o checklist "antes de dados reais"; pendências atualizadas), `README.md` (seção de operação curta com links), `src/database/README.md` (revert), `AGENTS.md` = `CLAUDE.md` (parágrafo BE-25)
- Vault: tarefa `2026-10-29-be-25-operations.md`, nova evolução `2026-11-10-operacao-entrega-recuperavel.md` + índice, alterações (`vitacare-infraestrutura`, `vitacare-seguranca-e-privacidade`, `vitacare-plano-testes`, `vitacare-pendencias-prototipos`, RNF008 e RNF006 novas notas `vitacare-rnf008-alteracoes.md`/`vitacare-rnf006-alteracoes.md`) + índice `vitacare-alteracoes.md`, `vitacare-rastreabilidade.md`, `vitacare-backend.md`, `vps-hostinger-backup.md` (bloco do VitaCare)

- [ ] **Step 1:** Escrever os docs do repositório; `git diff --check`; `cmp AGENTS.md CLAUDE.md`.
- [ ] **Step 2:** Rodar a validação completa: `npm run build`, `npm run lint`, `npm test -- --runInBand` e `VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand`, com as URLs descartáveis. Registrar os números.
- [ ] **Step 3:** Escrever as notas do vault com as evidências reais das Tasks 3–7 e marcar o que não foi executado (VPS, GitHub Actions).
- [ ] **Step 4:** Commit `docs(ops): deploy, backup, restore, metas e checklist antes de dados reais (BE-25)`, mais o commit seletivo no vault.

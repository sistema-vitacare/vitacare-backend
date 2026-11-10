# BE-25 — Operação: CI, segurança, observabilidade e entrega recuperável (design)

Data: 2026-11-10. Card: BE-25 (Operations). Requisitos: RNF004, RNF006–009;
pendências P30 e P31. Fontes lidas: PDF do TCC aprovado, p. 48–50 (Quadro 9 e
arquitetura 6.3.1), 81 (Figura 46), 83–84 (Quadro 24) e 85–87 (Quadros 25 e
26, 9.3, 9.4), com pdf.js; notas `vitacare-infraestrutura`,
`vitacare-seguranca-e-privacidade`, `vitacare-plano-testes`,
`vitacare-pendencias-prototipos` (P30/P31), RNF004/006/007/008/009 e as
alterações de infraestrutura e segurança; tarefas BE-24 e
`2026-10-19-infra-deploy-vps`; moldes da VPS `vps-hostinger-backup`,
`vps-hostinger-novo-sistema-observabilidade`,
`vps-hostinger-novo-sistema-logs-heartbeat`,
`vps-hostinger-observabilidade-alertas` e `vps-hostinger-observabilidade-logs`;
código de `app.module.ts`, `app.setup.ts`, `health/`, `queue/`, `storage/`,
`Automation`, `Attachment`, `cli/`, `Dockerfile`, `docker-entrypoint.sh`,
`docker-compose.prod.yml`, `.github/workflows/deploy.yml` e
`docs/deploy-vps.md`.

O texto do PDF confere com as notas: RNF008 sem número, Quadro 26 qualitativo,
Lightsail/S3 previstos, HTTPS entre frontend e backend. Não há divergência
nota × PDF; as diferenças (VPS no lugar do Lightsail, volume no lugar do S3) já
são decisões posteriores registradas.

## 1. Intenção

Antes de entrarem dados reais, o operador precisa de quatro garantias com
evidência: (a) a imagem que vai para a VPS foi implantada do zero, migrada e
exercitada por HTTP num ambiente descartável idêntico; (b) se a VPS ou um
deploy der errado, há backup de banco **e** anexos da mesma hora, restauração
ensaiada com tempo medido e caminho de rollback testado; (c) falhas em
produção aparecem no monitoramento que já existe na VPS, sem que logs e
backups exponham dado de saúde; (d) metas de desempenho e recuperação ficam
escritas antes de qualquer medição. Nada disso declara conformidade LGPD ou
SLA.

## 2. Decisões de Mateus (2026-11-10)

1. **Homologação = CI efêmero + ensaio local.** Cada execução do CI builda a
   imagem, sobe com PostgreSQL/Redis de serviço, aplica as migrations pelo
   entrypoint, cria o master pelo seed e roda o smoke completo por HTTP; tudo é
   descartado no fim. A VPS continua só com produção. Os mesmos scripts rodam
   localmente com Docker.
2. **RPO 24 h / RTO 4 h.** Backup diário do banco **e** dos anexos no mesmo
   horário (restaurados juntos), retenção local de 14 dias; restauração
   documentada e ensaiada com tempo medido. A cópia externa (camada 3 de
   `vps-hostinger-backup`) continua pendente com Mateus.
3. **Desempenho (RNF008):** p95 ≤ 500 ms em leituras, ≤ 1 s em escritas,
   ≤ 5 s em PDF e CSV, nenhuma resposta 5xx, com 50 usuários simultâneos sobre
   1.000 pacientes (teto do Enterprise), no container com os limites de
   produção (512 MiB, 1 CPU). Medido por script de carga local; em produção,
   acompanhado pelo `responseTime` do log.
4. **Retenção técnica + LGPD bloqueante (P31).** Fixa-se só o técnico: backups
   14 dias, logs pela retenção do Loki e sem dado clínico, auditoria
   indefinida (BE-23), anexos enquanto o registro existir. Base legal,
   controlador/operador, encarregado e direitos do titular ficam pendentes
   com Mateus, e o checklist de produção diz que dados reais não entram antes
   disso.

## 3. O que muda

### 3.1 Logs (lado da app do caminho Alloy → Loki)

- **`level_name` no JSON do pino.** O Alloy da VPS cria o label `level` a
  partir de `level_name` (molde Monolog). Hoje o pino grava só `"level": 50` e
  os erros da API não disparam "Muitos erros numa aplicação". Um formatter de
  nível acrescenta `level_name` com os nomes do Monolog, mantendo o `level`
  numérico: trace/debug → `DEBUG`, info → `INFO`, warn → `WARNING`, error →
  `ERROR`, fatal → `CRITICAL`.
- **Header de resposta com nome de arquivo mascarado.** O pino-http registra
  `res.headers`, e o `Content-Disposition` do download de anexo traz o nome
  original enviado (pode conter nome de paciente). Acrescentar
  `res.headers["content-disposition"]` ao `redact` existente. Os demais
  arquivos (PDF e CSV) já têm nome sem dado pessoal, mas a máscara vale para
  todos.
- Sem mudança no que já se mascara (`authorization`, `cookie`, `x-api-key`,
  `search`) nem no log de erro do filtro global.

### 3.2 Heartbeat dos workers no Uptime Kuma

- `/health/live` responde 200 com as varreduras paradas. Um job scheduler do
  BullMQ (fila `operations`, job `heartbeat`, a cada 5 min) faz `GET` na URL de
  push do Kuma (`UPTIME_KUMA_PUSH_URL`, opcional, `uri`). Só envia depois de um
  `SELECT 1` no PostgreSQL: o pulso prova Redis agendando, worker do processo
  consumindo e banco respondendo. Falha do Kuma não lança nem polui o log (um
  aviso por hora no máximo). A URL tem token: nunca vai para log.
- Sem a variável, o scheduler não é registrado e a API loga uma vez, em
  `info`, que o heartbeat está desligado. Monitor no Kuma: tipo Push,
  intervalo 600 s.
- Fica em `src/health/` (infra, não domínio), junto do `HealthModule`.

### 3.3 Smoke test por HTTP (`scripts/ops/smoke.mjs`)

Node 22 puro (`fetch`), sem dependência nova, rodado do checkout ou do runner
do CI contra uma URL.

- **`--mode=read`** (padrão, seguro em produção, nada escreve):
  `/health/live`, `/health/ready` com postgres e redis `up`, `GET /api/v1`
  (com `--expect-version`, compara `data.version`), `/api/docs-json` válido,
  rota protegida sem token → `401` no envelope de erro, rota inexistente →
  `404` no envelope, headers do Helmet presentes.
- **`--mode=full`** (só homologação; exige `--allow-writes` e as credenciais
  do master por variável `SMOKE_MASTER_EMAIL`/`SMOKE_MASTER_PASSWORD` e
  `SMOKE_PLATFORM_CODE`): troca da senha provisória do master, organização
  Enterprise e outra Basic com primeiro administrador, primeiro acesso,
  profissional/cuidador/familiar convidados e ativados, paciente com
  responsável, vínculos, formulário publicado, regra de alerta, registro do
  cuidador acima da regra → alerta e notificação, anexo enviado e baixado com
  SHA-256 igual, relatório PDF, painel, CSV da auditoria, recorte do familiar
  (`********`), isolamento (admin da outra organização → `404`) e logout. Ao
  final grava num arquivo de estado (`--state-file`) os ids e o SHA do anexo,
  sem senha.
- **`--mode=verify`** (após restauração ou rollback): lê o estado, faz login
  do administrador criado e confere paciente, registro, alerta e o download do
  anexo com o mesmo SHA-256.
- Saída: uma linha por verificação (`ok`/`FALHOU`), código de saída 1 se
  qualquer uma falhar. Não imprime token, senha nem corpo de resposta com dado
  clínico.
- A cobertura exaustiva de fluxos alternativos continua na suíte
  `tests/app/homologation.e2e-spec.ts` (BE-24); o smoke prova a **imagem**.

### 3.4 Backup e restauração (`scripts/ops/backup.sh`, `restore.sh`)

Shell POSIX para o cron do root na VPS, parametrizado por variável (container
do Postgres, banco, usuário, volume, diretório), com os padrões da VPS.

- **backup:** numa pasta `vitacare-<AAAA-MM-DDTHHMM>/` com `umask 077`:
  `db.dump` (`pg_dump -Fc` pelo `docker exec` do Postgres), `storage.tgz`
  (volume montado só leitura num `alpine`) e `SHA256SUMS`. Apaga pastas com
  mais de 14 dias. Se `KUMA_PUSH_URL` estiver definida, avisa o Kuma só
  quando tudo deu certo (monitor Push de 25 h). Uma linha de cron diária
  substitui as duas atuais (dump diário e volume semanal).
- **restore:** exige `--yes`, confere os `SHA256SUMS`, recria o banco alvo
  (`DROP/CREATE ... OWNER`), `pg_restore --no-owner --role=<usuário>`,
  esvazia e reextrai o volume alvo e imprime o tempo gasto. Recusa rodar com
  o container da API ligado no mesmo volume (o operador para a stack antes).
  Restaura **banco e volume juntos**, nunca um só.
- Backups ficam só para o root (`0700`/`0600`); a cópia externa criptografada
  segue pendente.

### 3.5 Migrations e rollback

- `docker-entrypoint.sh revert` desfaz **uma** migration e sai (simétrico ao
  `migrate`), com as mesmas variáveis de conexão única e sem timeout.
- Procedimento escrito: antes de um merge com migration, backup manual
  (`backup.sh`); rollback de imagem (`APP_IMAGE=...:sha-<commit>`) quando o
  código anterior aceita o schema novo; senão `revert` consciente ou
  restauração. Nunca automático.

### 3.6 CI: homologação efêmera (job `homologacao`)

Depois de `testes`, em todo push e PR:

1. build da imagem `runtime` com `GIT_SHA` (cache `gha`);
2. container com `--network host` contra os serviços do job, volume próprio,
   `RUN_MIGRATIONS=true`, limites de produção (`--memory 512m --cpus 1`);
3. `/health/ready`; `seed-platform.js` dentro do container com dados
   sintéticos (a senha provisória é lida da saída e passada ao smoke por
   variável mascarada no log do Actions);
4. `smoke.mjs --mode=full`;
5. **restauração:** `backup.sh` → banco novo `vitacare_restore` e volume novo
   por `restore.sh` → segundo container sobre eles → `smoke.mjs --mode=verify`
   e tempo de restauração no resumo do job;
6. **revert/migrate:** `revert` e `migrate` de novo na imagem nova, container
   saudável e `--mode=verify`;
7. **rollback de imagem:** quando houver `:latest` no GHCR (o que está em
   produção) e o job tiver `packages: read`, sobe essa imagem sobre o schema
   migrado pela nova e roda `--mode=read` + `--mode=verify`. Sem imagem
   anterior (primeiro deploy ou PR de fork), o passo registra aviso e não
   reprova.

8. na `main`, só com tudo verde: login no GHCR e push da **mesma** imagem
   testada como `:latest` e `:sha-<commit>`.

O job `imagem` é absorvido pelo passo 8; o `deploy` troca o laço de
`curl` por `smoke.mjs --mode=read --expect-version $GITHUB_SHA` com espera.
Acrescenta-se `npm audit --omit=dev --audit-level=high` ao job `testes`.

### 3.7 Desempenho (`scripts/ops/load.mjs`)

- Prepara pela API, numa organização Enterprise de homologação: 50 usuários
  (1 admin, 9 profissionais, 30 cuidadores, 10 familiares), 1.000 pacientes
  com vínculos, um formulário e 5 registros por paciente.
- Carga: 50 sessões simultâneas por 120 s numa mistura de leituras (lista e
  detalhe de paciente, histórico, visão consolidada, evolução, alertas,
  caixa, painel), escritas (registro de acompanhamento, leitura de
  notificação) e exportações (PDF e CSV, em fração pequena).
- Relatório por categoria: contagem, p50/p95/p99, 5xx; compara com as metas
  da seção 2 e sai com código 1 se alguma falhar. Rodado localmente na
  imagem com os limites de produção; **não** é rodado no CI (tempo e ruído do
  runner). Medição na VPS fica pendente.
- Em produção: consultas LogQL documentadas para p95 por rota a partir de
  `responseTime` do pino-http.

### 3.8 Órfãos no volume

CLI `node dist/cli/storage-orphans.js` (mesma conexão do seed): lista
arquivos em `attachments/` sem linha ativa em `follow_up_attachments` e
temporários em `tmp/`, ambos com mais de 24 h (nunca um upload em
andamento). Padrão só lista (chave e tamanho, sem nome original);
`--delete` apaga. Execução manual, nunca agendada: depois de uma restauração
o operador revisa antes de apagar.

### 3.9 Documentação

- `docs/deploy-vps.md`: backup diário único, restore, revert, heartbeat,
  smoke, órfãos, metas, LogQL e **checklist antes de dados reais** (HTTPS
  pelo NPM com domínio, `APP_BIND` de volta a `127.0.0.1`, CORS só da origem
  do frontend, backup + Push no Kuma, cópia externa, decisões LGPD).
- `docs/api/`: nenhuma rota nova nem alterada; o manual não muda. O Swagger
  não muda.
- `.env.example`, `.env.production.example`, `docker-compose.prod.yml`
  (`UPTIME_KUMA_PUSH_URL`).
- Vault: tarefa BE-25, evolução nova, alterações em `vitacare-infraestrutura`,
  `vitacare-seguranca-e-privacidade`, `vitacare-plano-testes`,
  `vitacare-pendencias-prototipos` (P30/P31) e RNF008/RNF006, índices,
  rastreabilidade, nota do projeto; `vps-hostinger-backup` (linha do
  VitaCare). `AGENTS.md`/`CLAUDE.md` idênticos.

## 4. Chamadas do agente (pendentes de confirmação)

- Heartbeat opcional (o molde Laravel o torna obrigatório na stack); 5 min de
  intervalo; pulso condicionado ao `SELECT 1`.
- `WARNING` e `CRITICAL` como nomes Monolog de warn e fatal.
- Smoke `full` com organizações e usuários sintéticos de domínio
  `example.test`; nunca contra produção (exige `--allow-writes`).
- Backup numa pasta por execução com `SHA256SUMS`; um só horário (03:20).
- Restauração recusa API ligada; `pg_restore --no-owner --role`.
- Órfãos com folga de 24 h e só por comando manual.
- Composição da carga e preparo de dados descritos em 3.7.
- `npm audit` no nível `high`, só dependências de produção.
- **Rate limit no ensaio.** O throttler conta por IP (`THROTTLE_LIMIT=120`/min).
  Em produção, 50 usuários vêm de IPs diferentes; no ensaio saem todos do
  mesmo IP. Por isso o CI e a carga sobem `THROTTLE_LIMIT` (ex.: 100000), e o
  rate limit em si já está provado no e2e do BE-19/BE-24. Um 429 é contado à
  parte e não entra no p95. O preparo dos dados passa pela API, com
  concorrência de 10.
- **Senha do `verify`.** O `full` define as senhas definitivas por variável
  (`SMOKE_ADMIN_PASSWORD`, padrão sintético só para homologação). O `verify`
  usa a mesma variável, e o arquivo de estado nunca guarda senha.
- **Ordem do backup com a API ligada: dump → tar.** Um upload entre os dois
  vira, no máximo, um arquivo órfão inofensivo (o CLI de órfãos lista). Já uma
  remoção nessa janela deixaria uma linha sem arquivo (`ATTACHMENT_CONTENT_MISSING`
  depois do restore). Isso é raro às 03:20 e está documentado. A API não é
  parada.
- **A imagem publicada é a homologada.** Na `main`, o próprio job
  `homologacao` publica no GHCR a imagem que testou (mesmo digest), depois de
  todos os passos passarem; o job `imagem` separado deixa de existir. Em PR e
  no `develop`, nada é publicado.
- **Rollback incompatível não bloqueia.** Se a `:latest` não subir sobre o
  schema novo (migration intencionalmente incompatível), o passo 7 marca
  aviso no resumo do job, com "rollback só por `revert`/restauração", e não
  reprova o deploy.

## 5. Fora do escopo

- Executar algo na VPS (sem acesso): configurar cron, Kuma, domínio/HTTPS,
  cópia externa, medir na VPS e ensaiar restore lá ficam como passos de
  Mateus, com os comandos prontos.
- Regras novas no Grafana (repositório `observability`, genéricas por stack);
  a consulta de p95 fica documentada como sugestão.
- Métricas Prometheus da aplicação (`/metrics`): o cAdvisor e o log já dão
  memória, CPU, saúde e latência; dependência nova sem necessidade agora.
- Política LGPD, prazos clínicos de guarda, anonimização, S3, SLA/SLO de
  disponibilidade.

## 6. Critérios de aceite e evidência

- CI: job `homologacao` verde com smoke `full`, restauração e `verify`,
  revert/migrate e rollback de imagem (ou aviso explícito sem imagem
  anterior). Daqui, a execução no GitHub fica "disparada, não verificada";
  a evidência é o mesmo roteiro rodado localmente.
- Local: imagem com limites de produção; smoke `full` ok; backup → restore em
  banco e volume novos com tempo medido (≤ 4 h é a meta; o ensaio local mede
  o tamanho do conjunto de teste); `verify` ok; rollback para a imagem de
  `main` ok; carga com os números da seção 2.
- Testes: unitários para `level_name`, `redact` do `content-disposition`,
  heartbeat (com e sem URL, banco fora, Kuma fora) e órfãos (folga, linha
  ativa, temporário); e2e do heartbeat e dos órfãos com PostgreSQL/Redis
  descartáveis.
- `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` com
  `VITACARE_TEST_REQUIRE_INFRA=true`.

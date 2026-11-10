# Deploy na VPS (Portainer + GHCR)

Mesmo molde dos sistemas Laravel da VPS: stacks `infra` e `proxy`
compartilhadas, imagem no GHCR, stack *Repository* no Portainer, deploy por
webhook e **um container por sistema**. No lugar de nginx + php-fpm +
supervisor, o container roda um processo Node, que atende vários requests ao
mesmo tempo.

```text
merge na main
  └─ GitHub Actions: testes (Postgres + Redis reais)
       └─ homologacao (só lê o GHCR): imagem buildada uma vez, deploy do zero,
          smoke completo, backup → restore → verify, revert/migrate, rollback
            └─ publicacao: a MESMA imagem (artefato) no GHCR (:latest e :sha-<commit>) → webhook
                 └─ Portainer relê o compose, baixa a imagem, recria app-vitacare
                      └─ entrypoint: migrations pendentes → API NestJS na porta 1050
                           └─ smoke de leitura confere data.version = commit
stdout JSON (pino, level_name) → Alloy → Loki · cAdvisor → Prometheus · heartbeat → Kuma
```

| Item | Valor |
| --- | --- |
| Stack / label `stack` | `vitacare` |
| Container | `app-vitacare` |
| Porta (host = interna) | `1050` (1000, 1010, 1020, 1030 já reservadas; `1040` é o frontend do VitaCare) |
| Banco e usuário | `vitacare` / `vitacare`, no Postgres da stack `infra` |
| Prefixo Redis | `vitacare:` (cache) e `vitacare` (filas BullMQ) |
| Imagem | `ghcr.io/sistema-vitacare/vitacare-backend` (`:latest` e `:sha-<commit>`) |

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `Dockerfile` | build multi-stage; `GIT_SHA` vira `APP_VERSION` |
| `docker-entrypoint.sh` | `RUN_MIGRATIONS=true` → migrations; depois `exec node dist/main.js` |
| `docker-compose.prod.yml` | o que a stack do Portainer lê |
| `.env.production.example` | modelo das variáveis da stack |
| `.github/workflows/deploy.yml` | testes → homologação (só lê o GHCR) → publicação da imagem testada (só na `main`) → webhook → smoke de leitura |
| `scripts/ops/smoke.mjs` | smoke por HTTP: `read` (produção), `full` (homologação), `verify` (após restore/rollback) |
| `scripts/ops/backup.sh` · `restore.sh` | backup diário de banco **e** anexos; restauração conferida |
| `scripts/ops/ci-homologation.sh` | roteiro do job `homologacao`, também rodável localmente |
| `scripts/ops/load.mjs` | medição de desempenho (RNF008) contra homologação |
| `compose.yaml` | desenvolvimento (build local, porta 3000, sem migration automática) |

## Equivalências com o molde Laravel

| Laravel (php-fpm) | VitaCare (Node) |
| --- | --- |
| `pm.max_children` | não existe: o event loop do Node atende requests em paralelo |
| `DB_PERSISTENT` (1 conexão por worker) | pool do `pg`: `DB_POOL_SIZE` (padrão 10) |
| `pm.process_idle_timeout` | `DB_POOL_IDLE_TIMEOUT_MS` (conexão ociosa volta ao banco) |
| `request_terminate_timeout` | `HTTP_REQUEST_TIMEOUT_MS` (60s) + `DB_STATEMENT_TIMEOUT_MS` (30s) |
| `memory_limit` do PHP | `NODE_OPTIONS=--max-old-space-size` (`API_HEAP_MB`) |
| `migrate --force` no entrypoint | igual: `RUN_MIGRATIONS=true` no entrypoint |
| `/version.txt` | `GET /api/v1` → `data.version` |
| `/up` | `/health/live` (processo) e `/health/ready` (PostgreSQL + Redis) |
| volume `<sistema>-storage:/var/www/storage/app` | volume `vitacare-storage:/app/storage` (anexos privados; ver abaixo) |
| `storage:link` (arquivos públicos via nginx) | **não existe** de propósito: anexo é dado de saúde e só sai pela API autenticada |
| queue-worker / scheduler | workers BullMQ no próprio processo; job schedulers no Redis |
| heartbeat do scheduler (`UPTIME_KUMA_PUSH_URL`) | igual: fila `operations`, pulso a cada 5 min só com o banco respondendo |

## Recursos

| Variável | Padrão | Regra |
| --- | --- | --- |
| `API_MEM_LIMIT` | `512m` | teto do container; o OOM fica nele, não no Postgres |
| `API_HEAP_MB` | `384` | ≈ 75% do `API_MEM_LIMIT` |
| `API_CPUS` | `1.0` | metade das 2 vCPU da VPS |
| `DB_POOL_SIZE` | `10` | conexões no Postgres compartilhado (`max_connections` = 100) |

Conferir depois de uma semana:

```bash
docker stats --no-stream app-vitacare
docker exec -it postgresql psql -U mavila -d postgres \
  -c "select application_name, state, count(*) from pg_stat_activity where usename = 'vitacare' group by 1, 2;"
```

## Arquivos privados (volume `vitacare-storage`)

Decisão de Mateus em 2026-11-05 (BE-13), no lugar do S3 previsto no TCC: os
anexos de registro ficam no volume nomeado `vitacare-storage`, montado em
`/app/storage` (`STORAGE_PATH`, fixo no `docker-compose.prod.yml`). No host o
volume se chama `vitacare_vitacare-storage` (prefixo = nome da stack).

- **Persiste** a deploy, pull e recriação do container; some só com
  `docker volume rm` (ou `down -v`). Nunca apagar no dia a dia.
- **Privado:** não há `storage:link` nem rota estática. Cada download é
  autorizado pela API a partir do banco; o nome no disco
  (`attachments/<organização>/<id>`) não serve de autorização.
- **Dono:** o diretório nasce na imagem com dono `node`; um volume nomeado novo
  herda esse dono na primeira montagem. Sem escrita em `/app/storage`, a API
  **não sobe** (erro no log do container).
- **Temporários** de upload ficam em `/app/storage/tmp` e são apagados ao fim de
  cada requisição.
- **Tamanho:** até 10 MB por arquivo e 5 por registro. Acompanhar com
  `docker run --rm -v vitacare_vitacare-storage:/d alpine du -sh /d`.
- Banco e volume são copiados e restaurados **juntos**, pelo mesmo backup
  (`backup.sh`/`restore.sh`, [Recuperação](#recuperação-rto-4-h)): linha sem
  arquivo responde `404 ATTACHMENT_CONTENT_MISSING` e loga `error`; arquivo sem
  linha fica inacessível e aparece em `storage-orphans.js`.
- **Retenção:** o anexo fica enquanto a linha existir; a remoção pela API apaga
  o arquivo. Prazo de guarda clínica e descarte de paciente inativo dependem da
  decisão LGPD (P31), ainda pendente.

## Hierarquia de timeouts (crescente de dentro para fora)

```text
statement_timeout (30s) < requestTimeout do Node (60s) < proxy do NPM (≥ 90s, fase com domínio)
keepalive do proxy (≤ 60s) < keepAliveTimeout do Node (65s)
```

## Passo a passo do zero ao ar (acesso por IP, sem domínio)

### 0. Pré-requisitos na VPS

```bash
docker ps --format '{{.Names}}' | grep -E '^(postgresql|redis|nginx-proxy-manager)$'
docker network ls --format '{{.Name}}' | grep -E '^(infra|proxy)$'
```

Os três containers e as duas redes precisam existir (ordem: infra → proxy → sistemas).

### 1. Merge `develop` → `main`

O workflow roda `testes` ✅ e `imagem` ✅; o `deploy` ❌ falha com "Secret
PORTAINER_WEBHOOK_URL não configurado" — esperado no primeiro merge. A imagem
aparece em github.com/orgs/sistema-vitacare → Packages, **privada**. O token
*classic* `read:packages` do registry `ghcr.io` no Portainer precisa ser de uma
conta com acesso à org (Package settings → Manage access).

### 2. Usuário e banco

Gerar a senha (só letras e números): `openssl rand -hex 20`.

```bash
docker exec -it postgresql psql -U mavila -d postgres
```

Um comando por vez, só o que vem depois do prompt `postgres=#`:

```sql
CREATE USER vitacare;
\password vitacare
CREATE DATABASE vitacare OWNER vitacare;
ALTER ROLE vitacare CONNECTION LIMIT -1;
\q
```

O `\password` pede a senha **duas vezes** (digitar e confirmar; nada aparece na
tela). Se o prompt virar `postgres-#`, há comando pendente: `\r` limpa.

```bash
docker exec -it postgresql psql "postgresql://vitacare:<senha>@localhost/vitacare" -c "select current_user;"
```

### 3. Firewall

hPanel → VPS → Segurança → Firewall → TCP `1050`. (O `ufw` não vale para porta
publicada pelo Docker.)

### 4. Variáveis (`.env.production`, nunca commitado)

Sem aspas e sem comentário na mesma linha:

```dotenv
DB_PASSWORD=<senha do passo 2>
REDIS_PASSWORD=<a mesma da stack infra>
APP_BIND=0.0.0.0
CORS_ORIGINS=http://<IP-da-VPS>:1040
```

Heartbeat dos workers (BE-25). No Kuma, monitor **Push** `vitacare workers`,
intervalo 600 s; copiar o token:

```dotenv
UPTIME_KUMA_PUSH_URL=http://uptime-kuma:3001/api/push/<token>
```

Notificações (BE-17), opcionais. Sem elas, a caixa interna funciona, o push
fica desligado e os e-mails ficam como não enviados (`CHANNEL_DISABLED`):

```dotenv
# Push do navegador: gerar uma vez com `npx web-push generate-vapid-keys`.
# Trocar o par invalida as inscrições existentes (os navegadores se inscrevem de novo).
WEB_PUSH_ENABLED=true
WEB_PUSH_PUBLIC_KEY=<chave publica>
WEB_PUSH_PRIVATE_KEY=<chave privada, segredo>
WEB_PUSH_SUBJECT=mailto:<contato do operador>
# Link do app no push e no e-mail.
NOTIFICATION_APP_URL=http://<IP-da-VPS>:1040
```

O container precisa de saída HTTPS para os serviços de push (`fcm.googleapis.com`,
`*.push.services.mozilla.com`, `*.notify.windows.com`, `*.push.apple.com`) e,
com SMTP ligado, para o servidor de e-mail.

### 5. Stack no Portainer

Stacks → Add stack → **Repository**:

| Campo | Valor |
| --- | --- |
| Name | `vitacare` |
| Authentication | usuário GitHub + token fine-grained (Contents: Read-only) do repo |
| Repository URL / reference | `https://github.com/sistema-vitacare/vitacare-backend` / `refs/heads/main` |
| Compose path | `docker-compose.prod.yml` |
| GitOps updates | ligado → *Webhook* → **copiar a URL** |
| Re-pull image / Force redeployment | desligados (pagos no CE; o `pull_policy: always` resolve) |
| Environment variables | *Advanced mode* → colar o `.env.production` |

**Deploy the stack.**

### 6. Primeiro boot

```bash
docker ps --filter name=app-vitacare --format '{{.Names}}\t{{.Status}}'   # Up (healthy)
docker logs app-vitacare 2>&1 | grep -E "executed successfully|API em"
# Migration CreateInitialIdentitySchema... executed successfully
# Migration CreateAuthSchema... executed successfully
# API em http://0.0.0.0:1050/api/v1
```

Se a migration falhar, o container não sobe (restart em loop com o erro no log).

### 7. Validação de fora

```bash
curl -s http://<IP-da-VPS>:1050/api/v1          # data.version = commit do merge
curl -s http://<IP-da-VPS>:1050/health/ready    # postgres e redis "up"
```

Swagger: `http://<IP-da-VPS>:1050/api/docs`.

### 8. Plataforma, administrador master e primeira organização (uma vez)

O banco nasce vazio e o `seed:dev` recusa produção. Primeiro a organização de
plataforma e o administrador master (CPF válido; a senha provisória aparece uma
única vez no terminal e não vai para log nem auditoria):

```bash
docker exec -it app-vitacare node dist/cli/seed-platform.js \
  --organization-code <codigo-da-plataforma> --trade-name "VitaCare" \
  --admin-name "<Nome>" --admin-email <email> --admin-cpf <cpf>
```

O seed roda uma vez por banco; a segunda execução é recusada sem alterar nada.

As organizações clientes precisam de um plano de uso ativo (os limites ainda
não são aplicados pela API — P05/P06):

```bash
docker exec -it postgresql psql -U vitacare -d vitacare -c \
  "INSERT INTO usage_plans (name, description, user_limit, patient_limit, monthly_price)
   VALUES ('Inicial', 'Plano inicial de producao', 50, 500, NULL) RETURNING id;"
```

Depois o master faz login com o código da plataforma, troca a senha provisória
no primeiro acesso e cadastra cada organização com o primeiro administrador em
`POST /api/v1/organizations` (manual:
[`organizations-criar.md`](api/endpoints/organizations-criar.md)).

### 9. GitHub

Settings → Secrets and variables → Actions: secret `PORTAINER_WEBHOOK_URL` (URL
do passo 5) e variable `APP_URL=http://<IP-da-VPS>:1050`. *Re-run all jobs* do
workflow do passo 1: três jobs verdes (`testes`, `homologacao`, `deploy`), com
"7/7 verificacoes ok (modo read)" no fim do deploy. O resumo do job
`homologacao` mostra o tempo de restauração e se o rollback para a `:latest`
anterior funcionou sobre o schema novo.

### 10. Monitoramento e backup

**Uptime Kuma** (`http://<IP-da-VPS>:3001`), cada um com a notificação SMTP:

| Monitor | Tipo | Alvo | Intervalo |
| --- | --- | --- | --- |
| `vitacare` app | HTTP | `http://<IP-da-VPS>:1050/health/ready` (com domínio: `https://api.<dominio>/health/ready`) | 60 s |
| `vitacare workers` | Push | token em `UPTIME_KUMA_PUSH_URL` (passo 4) | 600 s |
| `vitacare backup` | Push | token na linha do cron abaixo | 90000 s (25 h) |

**Backup diário** (RPO 24 h): banco e anexos na mesma execução, porque só se
restauram juntos. Copiar os scripts uma vez (e a cada mudança deles):

```bash
mkdir -p /opt/vitacare && cd /opt/vitacare
for f in backup.sh restore.sh; do
  curl -fsSLO "https://raw.githubusercontent.com/sistema-vitacare/vitacare-backend/main/scripts/ops/$f"
done
chmod 700 backup.sh restore.sh
docker volume ls | grep vitacare     # confere o nome: vitacare_vitacare-storage
/opt/vitacare/backup.sh              # primeira execução à mão
```

(Repositório privado: `curl` com `-H "Authorization: token <fine-grained, Contents: Read>"`, ou `scp` do checkout.)

Cron do root (`crontab -e`), **substitui** as duas linhas antigas (dump diário e volume semanal):

```cron
20 3 * * * KUMA_PUSH_URL=http://127.0.0.1:3001/api/push/<token-backup> /opt/vitacare/backup.sh >> /var/log/vitacare-backup.log 2>&1
```

Cada execução cria `/root/backups/vitacare/vitacare-<AAAA-MM-DDTHHMM>/` com
`db.dump`, `storage.tgz` (sem `tmp/`) e `SHA256SUMS`, só para o root
(`0700`/`0600`), e apaga as pastas com mais de 14 dias. O Kuma só recebe o push
se tudo deu certo. A API não é parada: um anexo enviado entre o dump e o `tar`
vira no máximo um arquivo órfão; um removido nesse intervalo deixaria linha sem
arquivo após um restore (raro às 03:20).

**Cópia externa (camada 3 de `vps-hostinger-backup`) ainda não existe**: sem
ela, perder a VPS ou a conta perde os backups. Pendente com Mateus.

**Logs**: Grafana → Loki. Ver [Observabilidade](#observabilidade).

## Recuperação (RTO 4 h)

Orçamento de 4 h do incidente à API no ar com os dados do último backup.
Ensaio local (BE-25): restauração em segundos para o conjunto de teste; o tempo
real depende do tamanho do banco e do volume, por isso o ensaio na VPS abaixo é
obrigatório antes de dados reais.

1. **Parar a stack**: Portainer → Stacks → `vitacare` → **Stop**.
2. **Escolher o backup**: `ls /root/backups/vitacare/`.
3. **Restaurar banco e volume juntos**:

   ```bash
   /opt/vitacare/restore.sh /root/backups/vitacare/vitacare-<data> --yes
   ```

   Restaura o banco **ao lado** (`vitacare__incoming`) e só troca pelo atual
   depois do `pg_restore` completo: uma falha deixa o banco atual intacto.
   Recusa, sem alterar nada, sem `--yes`, com `SHA256SUMS` que não confere, com
   o volume montado em algum container, com volume padrão inexistente, com o
   role do dono ausente e com conexão aberta no banco (`DROP` sem `FORCE`).
4. **Subir a stack** (Start) e conferir: `node scripts/ops/smoke.mjs --base-url http://<IP-da-VPS>:1050`
   (de qualquer checkout) → `7/7 verificacoes ok (modo read)`; login de um administrador e
   download de um anexo recente.
5. **Órfãos**: `docker exec app-vitacare node dist/cli/storage-orphans.js`
   lista arquivos sem linha ativa (normais após restaurar um banco mais antigo
   que o volume); revisar e só então `--delete`.

**Ensaio sem tocar em produção** (fazer antes de dados reais e a cada trimestre):

```bash
time /opt/vitacare/restore.sh /root/backups/vitacare/vitacare-<data> --yes \
  --target-db vitacare_restore --target-volume vitacare-restore
docker run --rm --network infra -e DB_HOST=postgresql -e DB_DATABASE=vitacare_restore \
  -e DB_USERNAME=vitacare -e DB_PASSWORD=<senha> -e REDIS_HOST=redis -e REDIS_PASSWORD=<senha> \
  -e REDIS_KEY_PREFIX=vitacare-restore: -e QUEUE_PREFIX=vitacare-restore \
  -v vitacare-restore:/app/storage -p 127.0.0.1:1059:1050 -d --name vitacare-restore-check \
  ghcr.io/sistema-vitacare/vitacare-backend:latest
curl -s http://127.0.0.1:1059/health/ready
docker rm -f vitacare-restore-check && docker volume rm vitacare-restore
docker exec -it postgresql psql -U mavila -d postgres -c 'DROP DATABASE vitacare_restore'
```

Anotar o `time` na nota da tarefa no vault: é a medição do RTO.

## Migrations e rollback

- **Antes de um merge com migration**: `/opt/vitacare/backup.sh` à mão e
  confirmar a pasta nova. O CI já provou `revert` + `migrate` e, no resumo do
  job `homologacao`, se a imagem anterior roda sobre o schema novo.
- **Rollback de imagem** (código antigo compatível com o schema novo — o resumo
  do CI diz): `APP_IMAGE=ghcr.io/sistema-vitacare/vitacare-backend:sha-<commit>`
  → Update the stack; apagar a variável para voltar.
- **Rollback com schema** (o resumo avisou incompatibilidade): parar a stack,
  `docker run --rm --network infra <variáveis do banco> ghcr.io/sistema-vitacare/vitacare-backend:sha-<commit-novo> revert`
  (uma migration por execução; o `down` pode apagar dado da migration), então
  `APP_IMAGE` com o commit anterior. Se o `down` não servir: restauração.
- Nunca automático; nunca `migration:revert` sem backup do dia.

## Observabilidade

Os 12 alertas genéricos da stack `obs` valem para a `vitacare` sem cadastro.
Com `level_name` no JSON, "Muitos erros numa aplicação" passa a contar os erros
da API.

```logql
{stack="vitacare", level="ERROR"}                                   # erros com stack
{stack="vitacare"} |= "request completed" | json | res_statusCode >= 500
# p95 por rota em 5 min (ms), para comparar com as metas
quantile_over_time(0.95, {stack="vitacare"} |= "request completed" | json | unwrap responseTime [5m]) by (req_url)
```

Nada de dado clínico no log: corpo de requisição não é registrado; `search` e o
nome de arquivo do `Content-Disposition` saem `[Redacted]`; o heartbeat e os
scripts não imprimem token, senha nem URL de push.

## Metas (decididas por Mateus em 2026-11-10)

| Meta | Valor | Medido localmente em 2026-11-10 (512 MiB, 1 CPU, 1.000 pacientes, 5.000 registros) |
| --- | --- | --- |
| RPO | 24 h | backup diário único (banco + anexos), 14 dias |
| RTO | 4 h | restauração 1 s e API de pé em 12–16 s com o conjunto de teste; **VPS a medir** |
| p95 leitura | ≤ 500 ms | **591 ms sem pausa (não atingida)** · 181 ms com pausa de ~1 s |
| p95 escrita | ≤ 1 s | 652 ms sem pausa · 273 ms com pausa |
| p95 PDF/CSV | ≤ 5 s | 956 ms sem pausa · 352 ms com pausa |
| Erros 5xx | 0 na carga | 0 nos dois cenários |
| Carga | 50 usuários simultâneos, 1.000 pacientes | sem pausa: 157 req/s, CPU 100%; com pausa: 46 req/s |

O cenário das metas usa sessões **sem pausa** (`load.mjs` padrão): mede a API
saturada num núcleo. A leitura passa de 500 ms por fila de CPU, não por consulta
lenta (com 5 sessões, p50 de 20–40 ms). Com pausa (`--think-ms 1000`), todas as
metas são atingidas, mas o p99 chega a ~2,4 s quando um painel (`GET /dashboard`,
várias consultas em paralelo no pool de 10) ou um CSV de ~10.000 eventos
(montado de forma síncrona) coincide com a carga. Login: com 1 CPU o argon2id
padrão faz ~3–4 hashes/s; 10 logins simultâneos levam até ~4,8 s. Saídas
possíveis (decisão de Mateus): aceitar o modelo com pausa, `API_CPUS=2`,
otimizar painel/CSV, ajustar o argon2.

Sem SLA ou SLO de disponibilidade: não declarar.

## Antes de dados reais (checklist)

- [ ] Domínio + HTTPS no Nginx Proxy Manager (Parte B), `APP_BIND` de volta a `127.0.0.1`, regra 1050 removida do firewall.
- [ ] `CORS_ORIGINS` só com a origem do frontend.
- [ ] Monitores `vitacare` app, `vitacare workers` e `vitacare backup` no Kuma, UP.
- [ ] Cron do `backup.sh` com push; primeira pasta conferida.
- [ ] Cópia externa criptografada dos backups (camada 3).
- [ ] Ensaio de restauração na VPS com o tempo anotado (RTO).
- [ ] Medição de carga (`load.mjs`) contra um ambiente com o tamanho da VPS.
- [ ] **LGPD (P31):** base legal, controlador/operador, encarregado e processo
      de direitos do titular definidos por Mateus e orientação jurídica;
      retenção clínica de registros e anexos de paciente inativo.
- [ ] Senhas da stack e chaves VAPID trocadas das de teste; acesso ao Portainer e ao root restrito.

## Se algo falhar

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| `network infra not found` | stack `infra` fora do ar | subir a `infra`, ou `INFRA_NETWORK=<nome>` |
| `pull access denied` no GHCR | token do registry sem acesso à org | passo 1 |
| `required variable DB_PASSWORD is missing` | variável faltando ou com aspas | colar de novo |
| log: `password authentication failed` | senha da stack ≠ `\password` | igualar → Update the stack |
| log: `too many connections for role` | `CONNECTION LIMIT` no role | `ALTER ROLE vitacare CONNECTION LIMIT -1;` |
| `/health/ready` 503, redis `down` / WRONGPASS | `REDIS_PASSWORD` ≠ a da `infra` | igualar → Update |
| erro de CORS no navegador | origem do front fora de `CORS_ORIGINS` | ajustar → Update |
| timeout de fora, ok em `curl 127.0.0.1:1050` | firewall sem 1050 ou `APP_BIND` ausente | passos 3 e 4 |

## Dia a dia

| Quero... | Como |
| --- | --- |
| Publicar | merge na `main` (alguns segundos fora do ar enquanto o container é recriado) |
| Redeploy sem código novo | stack → **Pull and redeploy** |
| Mudar variável | stack → Environment variables → **Update the stack** |
| Rollback | `APP_IMAGE=ghcr.io/sistema-vitacare/vitacare-backend:sha-<commit>` → Update; apagar para voltar ([Migrations e rollback](#migrations-e-rollback)) |
| Deploy sem migrations | `RUN_MIGRATIONS=false` → Update |
| Rodar migrations à mão | `docker exec app-vitacare docker-entrypoint.sh migrate` |
| Desfazer a última migration | stack parada → `docker run --rm ... <imagem> revert` |
| Versão no ar | `node scripts/ops/smoke.mjs --base-url <APP_URL>` (ou `GET <APP_URL>/api/v1` → `data.version`) |
| Backup agora | `/opt/vitacare/backup.sh` |
| Restaurar | [Recuperação](#recuperação-rto-4-h) |
| Arquivos órfãos | `docker exec app-vitacare node dist/cli/storage-orphans.js` (`--delete` apaga) |

> **Rollback e schema:** voltar a imagem **não** desfaz migration. Se a versão nova
> trouxe migration, o código antigo precisa ser compatível com o schema novo ou
> exige `migration:revert` consciente (nunca automático).

## Com domínio (Parte B)

No NPM: Proxy Host `api.<dominio>` → `app-vitacare:1050`, SSL Let's Encrypt,
timeout ≥ 90s. Depois: apagar `APP_BIND` (volta a `127.0.0.1`), `APP_URL` no
GitHub com `https://`, `CORS_ORIGINS` com a origem do frontend e regra 1050
removida do firewall. A API lê o IP real por `X-Forwarded-For`
(`TRUST_PROXY=loopback,uniquelocal`).

## Pendências

- **Na VPS (passos de Mateus, comandos acima):** variável
  `UPTIME_KUMA_PUSH_URL` e os três monitores; cron único do `backup.sh`;
  ensaio de restauração com tempo; medição de carga com o tamanho real.
- **Cópia externa** dos backups (camada 3), criptografada.
- **HTTPS** com domínio (Parte B) antes de dados reais.
- **LGPD (P31)** e retenção clínica: ver o checklist.
- **S3**: anexos usam o volume local (decisão de 2026-11-05). **SMTP**: o envio
  de e-mail (BE-17) vale quando um servidor for configurado.
- **Dependências**: `npm audit` sem `high`/`critical`; restam 3 `moderate`
  (glob/minimatch via TypeORM, correção só no TypeORM 1.x, fora do semver).

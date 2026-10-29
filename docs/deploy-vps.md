# Deploy na VPS (Portainer + GHCR)

Mesmo molde dos sistemas Laravel da VPS: stacks `infra` e `proxy`
compartilhadas, imagem no GHCR, stack *Repository* no Portainer, deploy por
webhook e **um container por sistema**. No lugar de nginx + php-fpm +
supervisor, o container roda um processo Node, que atende vários requests ao
mesmo tempo.

```text
merge na main
  └─ GitHub Actions: testes (Postgres + Redis reais) → imagem no GHCR → webhook
       └─ Portainer relê o compose, baixa a imagem, recria app-vitacare
            └─ entrypoint: migrations pendentes → API NestJS na porta 1050
                 └─ stdout JSON (pino) → Alloy → Loki · cAdvisor → Prometheus
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
| `.github/workflows/deploy.yml` | testes → imagem → webhook → confere a versão |
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
| queue-worker / scheduler | **ainda não existem** (ver Pendências) |

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
workflow do passo 1: três jobs verdes, "Versão `<sha>` no ar".

### 10. Monitoramento e backup

- Uptime Kuma: HTTP em `http://<IP-da-VPS>:1050/health/ready`, 60s.
- Cron do root:

  ```cron
  20 3 * * * docker exec postgresql pg_dump -U mavila -Fc vitacare > /root/backups/vitacare-$(date +\%F).dump && find /root/backups -name 'vitacare-*.dump' -mtime +14 -delete
  ```

- Logs: Grafana → Loki `{stack="vitacare"}`.

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
| Rollback | `APP_IMAGE=ghcr.io/sistema-vitacare/vitacare-backend:sha-<commit>` → Update; apagar para voltar |
| Deploy sem migrations | `RUN_MIGRATIONS=false` → Update |
| Rodar migrations à mão | `docker exec app-vitacare docker-entrypoint.sh migrate` |
| Versão no ar | `GET <APP_URL>/api/v1` → `data.version` |

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

- **Worker e agendamento**: BullMQ está configurado, mas não há processor nem job
  agendado. Quando lembretes/alertas (RF007/RF013) existirem, o worker e o
  heartbeat do Uptime Kuma entram como o `queue-worker`/`scheduler` do molde.
- **S3** (anexos e PDF) e **SMTP** (decisão de não ter, 2026-09-22) fora do deploy.

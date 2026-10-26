# Deploy na VPS (Portainer + GHCR)

Mesmo molde dos sistemas Laravel da VPS (stacks `infra` e `proxy` compartilhadas,
imagem no GHCR, stack *Repository* no Portainer, deploy por webhook), adaptado a
uma API Node: no lugar de um container com nginx + php-fpm + supervisor, a stack
tem **réplicas** da API atrás de um **gateway** nginx.

```text
merge na main
  └─ GitHub Actions: testes (Postgres + Redis reais) → 2 imagens no GHCR → webhook
       └─ Portainer relê o compose, baixa as imagens e recria:
            migrate (uma vez) → api × API_REPLICAS → gateway (app-vitacare:1040)
                 └─ stdout JSON (pino) + access log do gateway → Alloy → Loki
```

| Item | Valor |
| --- | --- |
| Stack / label `stack` | `vitacare` |
| Porta (host = interna) | `1040` (sequência da VPS: 1000, 1010, 1020, 1030 já reservadas) |
| Container de borda | `app-vitacare` (o gateway; alvo do Nginx Proxy Manager) |
| Réplicas da API | `vitacare-api-1..N`, sem porta publicada |
| Banco e usuário | `vitacare` / `vitacare`, no Postgres da stack `infra` |
| Prefixo Redis | `vitacare:` (cache) e `vitacare` (filas BullMQ) |
| Imagens | `ghcr.io/sistema-vitacare/vitacare-backend` e `...-backend-gateway` |

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `Dockerfile` | alvos `runtime` (API) e `gateway` (nginx); `GIT_SHA` vira `APP_VERSION` |
| `docker-entrypoint.sh` | modos `api` (padrão) e `migrate` |
| `confs/gateway/nginx.conf` | balanceamento, keepalive, timeouts, X-Forwarded-*, access log |
| `docker-compose.prod.yml` | o que a stack do Portainer lê |
| `.env.production.example` | modelo das variáveis da stack |
| `.github/workflows/deploy.yml` | testes → imagens → webhook → confere a versão |
| `compose.yaml` | desenvolvimento (build local, um container); fora do deploy |

## Equivalências com o molde Laravel

| Laravel (php-fpm) | VitaCare (Node) |
| --- | --- |
| `pm.max_children` (workers do fpm) | `API_REPLICAS` (processos Node atrás do gateway) |
| nginx interno → `fastcgi_pass 127.0.0.1:9000` | gateway → `upstream api:3000 resolve`, `least_conn` |
| `DB_PERSISTENT` (1 conexão por worker) | pool do `pg` por réplica: `DB_POOL_SIZE` |
| `pm.process_idle_timeout` (`ondemand`) | `DB_POOL_IDLE_TIMEOUT_MS` (conexão ociosa volta ao banco) |
| `request_terminate_timeout` | `HTTP_REQUEST_TIMEOUT_MS` (60s) + `DB_STATEMENT_TIMEOUT_MS` (30s) |
| `memory_limit` do PHP | `NODE_OPTIONS=--max-old-space-size` (`API_HEAP_MB`) |
| `migrate --force` no entrypoint | serviço `migrate` de uma execução, antes das réplicas |
| `/version.txt` | `GET /api/v1` → `data.version` |
| `/up` | `/health/live` (processo) e `/health/ready` (PostgreSQL + Redis) |
| queue-worker / scheduler no supervisor | **ainda não existem** (ver Pendências) |

## Dimensionamento

Cada réplica é um processo Node com seu próprio pool de conexões. O Postgres da
`infra` é compartilhado por todos os sistemas (`max_connections` = 100), então:

```text
conexões do VitaCare = API_REPLICAS × DB_POOL_SIZE + 1 (migrate, só no deploy)
API_HEAP_MB          ≈ API_MEM_LIMIT × 0,75
```

| Perfil | `API_REPLICAS` | `API_MEM_LIMIT` | `API_HEAP_MB` | `DB_POOL_SIZE` | Conexões |
| --- | --- | --- | --- | --- | --- |
| Padrão (TCC, pouco tráfego) | 2 | 512m | 384 | 5 | 10 |
| Carga média | 3 | 512m | 384 | 5 | 15 |
| Máximo sensato em 2 vCPU | 4 | 512m | 384 | 4 | 16 |

Duas réplicas no mínimo: uma cai (OOM, deploy, bug) e a outra segue atendendo.
Mais réplicas que vCPUs só disputam processador. Conferir depois de uma semana:

```bash
docker stats --no-stream $(docker ps -q --filter label=com.docker.compose.project=vitacare)
docker exec -it postgresql psql -U mavila -d postgres \
  -c "select application_name, state, count(*) from pg_stat_activity where usename = 'vitacare' group by 1, 2;"
```

**Escalar:** stack → Environment variables → `API_REPLICAS=3` → *Update the stack*.
O gateway passa a enviar requests à réplica nova em até 10s, sem reinício.

### O que as réplicas garantem (e o que não)

Medido localmente com a stack real em 2026-10-19, tráfego contínuo a 10 req/s:

| Evento | Resultado |
| --- | --- |
| Scale up 2 → 3 | réplica nova recebendo tráfego em ≤ 10s, gateway sem reinício |
| Scale down 3 → 2 | nenhum erro (a réplica recebe SIGTERM e fecha limpo) |
| Réplica morre abrupta (`docker kill`) | GET seguinte vai para outra réplica; ≤ 2 requests com 502 em ~2s |
| Redis parado | API segue respondendo (15ms); `/health/ready` = 503 |
| **Deploy** (imagem nova) | **~2s de 502/504**: o Compose recria todas as réplicas juntas |

Réplicas dão **capacidade e tolerância a queda de processo**, não deploy sem
interrupção: rolling update exige Swarm ou blue/green, fora deste molde. A
janela de deploy é a mesma do container único dos sistemas Laravel.

**Estado compartilhado:** nenhuma réplica guarda estado em memória. Sessão no
PostgreSQL; limite de abuso do login e **rate limit global** no Redis (chaves
`vitacare:throttle:*`), então `THROTTLE_LIMIT` vale para a stack inteira, não por
réplica. Sem Redis o rate limit global libera o request (com aviso no log) e o
limite do login falha fechado, como antes.

## Hierarquia de timeouts (crescente de dentro para fora)

```text
statement_timeout (30s) < requestTimeout do Node (60s) < proxy_read_timeout do gateway (75s)
  < proxy do NPM (≥ 90s)
keepalive do gateway (30s) < keepAliveTimeout do Node (65s)
```

Invertida, o request morre na camada de fora e a API não registra nada (504 sem
log). O keepalive invertido gera 502 intermitente: o Node fecharia um socket que
o nginx ainda acha que pode reaproveitar.

## Passo a passo do zero ao ar

1. **Banco** (uma vez), na `infra`:

   ```sql
   -- docker exec -it postgresql psql -U mavila -d postgres
   CREATE USER vitacare;
   \password vitacare
   CREATE DATABASE vitacare OWNER vitacare;
   ALTER ROLE vitacare CONNECTION LIMIT -1;
   ```

2. **Firewall** (hPanel → VPS → Segurança → Firewall): liberar TCP `1040` — só na
   fase por IP; com domínio o acesso é pelo NPM em 443.
3. **Uptime Kuma**: monitor HTTP em `http://<IP-da-VPS>:1040/health/ready`, 60s.
   Não há scheduler, então não há monitor Push (ver Pendências).
4. **Merge na `main`**: publica as duas imagens. O job `deploy` falha por falta do
   secret — esperado no primeiro merge.
5. **Pacotes no GHCR**: as duas imagens nascem privadas e ligadas ao repositório.
   O token *classic* `read:packages` já cadastrado no Portainer precisa enxergar a
   org `sistema-vitacare` (conta com acesso a ela).
6. **Portainer** → Stacks → Add stack → **Repository**:

   | Campo | Valor |
   | --- | --- |
   | Name | `vitacare` |
   | Repository URL / reference | `https://github.com/sistema-vitacare/vitacare-backend` / `refs/heads/main` |
   | Authentication | usuário GitHub + token fine-grained (Contents: Read-only) |
   | Compose path | `docker-compose.prod.yml` |
   | GitOps updates | ligado → *Webhook* → **copiar a URL** |
   | Environment variables | *Advanced mode* → colar o `.env.production` |

7. **GitHub** → Settings → Secrets and variables → Actions: secret
   `PORTAINER_WEBHOOK_URL`; variable `APP_URL=http://<IP-da-VPS>:1040`. Criar o
   environment `production`. *Re-run all jobs* do workflow do passo 4.
8. **Primeiro boot** — logs esperados: `migrate` aplica as migrations e sai com
   código 0; cada réplica loga `API em http://0.0.0.0:3000/api/v1`; o gateway
   registra `gw GET /health/live 200` a cada 30s.
9. **Bootstrap da primeira organização** (uma vez), numa réplica:

   ```bash
   docker exec -it vitacare-api-1 node dist/cli/auth-bootstrap.js \
     --organization-code <codigo> --usage-plan-id <uuid> --trade-name "<nome>" \
     --admin-name "<nome>" --admin-email <email> --admin-cpf <cpf>
   ```

   A senha provisória aparece uma única vez no terminal. O plano de uso precisa
   existir antes (o seed de desenvolvimento **não** roda em produção).

## Validação

```bash
curl -s http://<IP>:1040/api/v1 | jq -r .data.version   # = git rev-parse origin/main
curl -s http://<IP>:1040/health/ready                    # postgres e redis "up"
docker ps --filter label=com.docker.compose.project=vitacare --format '{{.Names}} {{.Status}}'
# app-vitacare (healthy) · vitacare-api-1 (healthy) · vitacare-api-2 (healthy) · vitacare-migrate-1 Exited (0)
for i in $(seq 1 6); do curl -s -o /dev/null http://<IP>:1040/api/v1; done
docker logs app-vitacare 2>&1 | grep 'gw GET /api/v1' | tail -6   # up= alterna entre as réplicas
```

No Loki: `{stack="vitacare"} |= "gw "` (uma linha por request, com a réplica e o
tempo). O `req=<id>` da linha do gateway é o mesmo `reqId` do log da API e o
`meta.requestId` da resposta.

## Dia a dia

| Quero... | Como |
| --- | --- |
| Publicar | merge na `main` |
| Redeploy sem código novo | Portainer → stack → **Pull and redeploy** |
| Mudar variável / escalar | stack → Environment variables → **Update the stack** |
| Rollback | `APP_IMAGE=...:sha-<commit>` (e `GATEWAY_IMAGE`, se mudou) → Update; apagar para voltar |
| Deploy sem migrations | `RUN_MIGRATIONS=false` → Update |
| Versão no ar | `GET <APP_URL>/api/v1` → `data.version` |
| Logs | Grafana → Loki `{stack="vitacare"}`; migrate: Portainer → container `vitacare-migrate-1` |

> **Rollback e schema:** voltar a imagem **não** desfaz migration. Se a versão nova
> trouxe migration, o rollback de código precisa ser compatível com o schema novo
> ou exige `migration:revert` consciente (nunca automático).

## Com domínio (Parte B)

No NPM: Proxy Host `api.<dominio>` → `app-vitacare:1040`, SSL Let's Encrypt,
timeout ≥ 90s. Depois: `APP_BIND` apagado (volta a `127.0.0.1`), `APP_URL` no
GitHub com `https://`, `CORS_ORIGINS` com a origem do frontend, regra 1040 removida
do firewall. O gateway deriva scheme e porta de `X-Forwarded-Proto`, e a API lê o
IP real do cliente por `X-Forwarded-For` (`TRUST_PROXY=loopback,uniquelocal`).

## Pendências

- **Worker e agendamento**: BullMQ está configurado, mas não há processor nem job
  agendado. Quando a tarefa de lembretes/alertas (RF007/RF013) criar o primeiro,
  ele entra como serviço `worker` na stack (mesma imagem, modo próprio no
  entrypoint) com heartbeat para um monitor Push do Uptime Kuma — o mesmo papel
  do `scheduler` no molde Laravel.
- **Backup do banco `vitacare`** no cron da VPS, como os demais sistemas.
- **S3** (anexos e PDF, previstos no TCC) e **SMTP** (decisão de não ter, 2026-09-22)
  continuam fora do deploy.

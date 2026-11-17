# Deploy na VPS (Portainer + GHCR)

Mesmo molde dos sistemas Laravel da VPS: stacks `infra` e `proxy`
compartilhadas, imagem no GHCR, stack *Repository* no Portainer, deploy por
webhook e **um container por sistema**. No lugar de nginx + php-fpm +
supervisor, o container roda um processo Node, que atende vários requests ao
mesmo tempo.

```text
merge na main
  └─ GitHub Actions: testes (compose, lint, build, unitários; sem banco nem Redis)
       └─ imagem: build e push no GHCR (:latest e :sha-<commit>)
            └─ deploy: webhook → Portainer relê o compose, baixa a imagem, recria app-vitacare
                 └─ entrypoint: migrations pendentes → API NestJS na porta 1050
                      └─ o job espera data.version = commit e /health/ready 200
stdout JSON (pino, level_name) → Alloy → Loki · cAdvisor → Prometheus · heartbeat → Kuma
```

| Item | Valor |
| --- | --- |
| Stack / label `stack` | `vitacare` |
| Container | `app-vitacare` |
| Endereço público | `https://api.vitacare.bizys.com.br` (frontend em `https://vitacare.bizys.com.br`), pelo Nginx Proxy Manager, desde 2026-11-16 |
| Porta (host = interna) | `1050`, presa em `127.0.0.1` (1000, 1010, 1020, 1030 já reservadas; `1040` é o frontend do VitaCare) |
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
| `.github/workflows/deploy.yml` | `testes` (lint, build, unitários) → `imagem` (GHCR, só no push da `main`) → `deploy` (webhook e espera da versão nova) |
| `scripts/ops/smoke.mjs` | smoke por HTTP: `read` (produção), `full` (homologação), `verify` (após restore/rollback) |
| `scripts/ops/backup.sh` · `restore.sh` | backup diário de banco **e** anexos; restauração conferida |
| `scripts/ops/ci-homologation.sh` | homologação efêmera da imagem (deploy do zero, smoke, backup → restore → verify, revert/migrate, rollback), rodada à mão ([abaixo](#antes-do-merge-na-main)) |
| `scripts/ops/load.mjs` | medição de desempenho (RNF008) contra homologação |
| `compose.yaml` | desenvolvimento (build local, porta 3000, sem migration automática) |

## Antes do merge na main

O CI é simples, rápido e leve (decisão de Mateus em 2026-11-10): só checa o
compose de produção e roda lint, build e unitários. Os e2e e a homologação
completa da imagem **não rodam no CI** e são rodados à mão, antes de um merge
na `main` que mexa em schema (migration), backup/restore ou infraestrutura
(Dockerfile, entrypoint, compose, workflow, `scripts/ops/`):

```bash
# e2e contra PostgreSQL e Redis descartáveis (banco vazio vitacare_schema_test em localhost)
VITACARE_TEST_DATABASE_URL=postgresql://<usuario>:<senha>@127.0.0.1:5432/vitacare_schema_test \
VITACARE_TEST_REDIS_URL=redis://127.0.0.1:6379/15 \
VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand

# homologação efêmera da imagem: sobe com os limites de produção, deploy do zero,
# seed, smoke completo, backup → restore → verify, revert + migrate e rollback
# para ROLLBACK_IMAGE (a :latest, pacote privado: `docker login ghcr.io` antes;
# sem ela o rollback é pulado) sobre o schema novo; tudo é desfeito no fim
docker build --target runtime --build-arg GIT_SHA="$(git rev-parse HEAD)" -t vitacare-backend:ci .
IMAGE=vitacare-backend:ci ROLLBACK_IMAGE=ghcr.io/sistema-vitacare/vitacare-backend:latest \
  EXPECT_VERSION="$(git rev-parse HEAD)" PG_CONTAINER=<container-do-postgres> \
  DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=<usuario> DB_PASSWORD=<senha> \
  REDIS_HOST=127.0.0.1 REDIS_PORT=6379 sh scripts/ops/ci-homologation.sh
```

Também à mão, de tempos em tempos: `npm audit --omit=dev --audit-level=high`.
Anotar o resultado na nota da tarefa no vault.

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
  o arquivo. A P31 foi resolvida no escopo acadêmico com o termo de uso e o
  aceite (BE-32, decisão de Mateus em 2026-11-12): o prazo definitivo de guarda
  e o descarte de paciente inativo são decisão da organização, como diz o termo.

## Hierarquia de timeouts (crescente de dentro para fora)

```text
statement_timeout (30s) < requestTimeout do Node (60s)
keepAliveTimeout do Node (65s) > keepalive de qualquer cliente ou balanceador (≤ 60s)
```

## Passo a passo do zero ao ar (domínio com HTTPS)

Desde 2026-11-16 (OPS-01, decisão de Mateus em 2026-11-12) o acesso é por
domínio com HTTPS, atrás do Nginx Proxy Manager (NPM) da stack `proxy`:

| Endereço | Destino |
| --- | --- |
| `https://api.vitacare.bizys.com.br` | API, `app-vitacare:1050` |
| `https://vitacare.bizys.com.br` | frontend, `app-vitacare-frontend:1040` (repositório `vitacare-frontend`) |

As portas `1050` e `1040` escutam só em `127.0.0.1` e ficam fechadas no
firewall: só o NPM as alcança, pela rede `proxy`. O acesso por IP de
2026-11-10 a 2026-11-16 está em [Histórico: acesso por IP](#histórico-acesso-por-ip-2026-11-10-a-2026-11-16).

```text
navegador ── https ──► NPM (80/443, Let's Encrypt) ── rede proxy ──► app-vitacare:1050
                                                   └─────────────► app-vitacare-frontend:1040
```

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

hPanel → VPS → Segurança → Firewall: TCP `80` e `443` abertas (já existem para
os outros sistemas). **Não** abrir `1050` nem `1040`. O `ufw` não vale para
porta publicada pelo Docker.

### 4. Variáveis (`.env.production`, nunca commitado)

Sem aspas e sem comentário na mesma linha. **Sem `APP_BIND`**: a porta fica
presa em `127.0.0.1` (padrão do compose).

```dotenv
DB_PASSWORD=<senha do passo 2>
REDIS_PASSWORD=<a mesma da stack infra>
CORS_ORIGINS=https://vitacare.bizys.com.br
NOTIFICATION_APP_URL=https://vitacare.bizys.com.br
```

`TRUST_PROXY` fica no padrão `loopback,uniquelocal`: o NPM chega pela rede
`proxy` (faixa privada), e o Express lê o IP do cliente no `X-Forwarded-For`
para auditoria, rate limit, aceite do termo e log. Nunca `true`.

Heartbeat dos workers (BE-25). No Kuma, monitor **Push** `vitacare workers`,
intervalo 600 s; copiar o token:

```dotenv
UPTIME_KUMA_PUSH_URL=http://uptime-kuma:3001/api/push/<token>
```

Push do navegador (BE-17), opcional. Sem ele, a caixa interna funciona e o push
fica desligado:

```dotenv
# Gerar UMA vez com `npx web-push generate-vapid-keys`. Trocar o par depois
# invalida todas as inscrições (os navegadores precisam se inscrever de novo).
WEB_PUSH_ENABLED=true
WEB_PUSH_PUBLIC_KEY=<chave publica>
WEB_PUSH_PRIVATE_KEY=<chave privada, segredo>
WEB_PUSH_SUBJECT=mailto:<contato do operador>
```

O container precisa de saída HTTPS para os serviços de push (`fcm.googleapis.com`,
`*.push.services.mozilla.com`, `*.notify.windows.com`, `*.push.apple.com`) e
para o servidor de e-mail.

**E-mail (SMTP).** Provedor escolhido por Mateus em 2026-11-16: Hostinger
Business Starter (1.000 envios/dia por caixa), com a caixa
`no-reply@vitacare.bizys.com.br` no **subdomínio** `vitacare.bizys.com.br` —
o `bizys.com.br` já tem MX e SPF de outra conta, que não são tocados.
Desligado (`SMTP_ENABLED=false`, o padrão), nada sai por e-mail. Ligar é só
configuração, sem código nem migration:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@vitacare.bizys.com.br
SMTP_PASSWORD=<senha da caixa, segredo>
SMTP_FROM=no-reply@vitacare.bizys.com.br
PASSWORD_RESET_URL=https://vitacare.bizys.com.br/redefinir-senha
INVITATION_ACCEPT_URL=https://vitacare.bizys.com.br/aceitar-convite
INVITATION_TTL_HOURS=72
```

`SMTP_FROM` é **só o endereço**: a validação exige e-mail puro e recusa
`VitaCare <no-reply@...>` (a API não sobe). Os timeouts do SMTP ficam no padrão
de 10 s: a stack não repassa `SMTP_*_TIMEOUT_MS`.

Com `SMTP_ENABLED=true`, a API **não sobe** sem `SMTP_HOST`, `SMTP_FROM`,
`PASSWORD_RESET_URL` e `INVITATION_ACCEPT_URL` (validação do `.env`). Ligar
ativa **quatro envios de uma vez**:

1. **Recuperação de senha** (UC02): o link sai por e-mail.
2. **E-mails de alerta** do BE-17, conforme as preferências de cada usuário.
3. **Aviso de vencimento do plano** (BE-28): enviado aos administradores
   ativos às 08:00 de Brasília, sete dias antes, um dia antes e no vencimento.
4. **Convite de usuário** (BE-31): o cadastro e a reemissão enviam ao convidado
   um link de uso único para a página `INVITATION_ACCEPT_URL`, onde ele mesmo
   cadastra a senha. O link vale `INVITATION_TTL_HOURS` (padrão 72 h). O
   administrador **deixa de ver a senha provisória**, a menos que a peça
   (`channel: "temporary_password"`). Se o envio falhar, o link é revogado na
   hora e a tela orienta a reemitir. Com o SMTP fora do ar, o cadastro leva
   cerca de 30 s (os três timeouts de 10 s) até responder a falha. O primeiro
   administrador criado pelo master continua com senha provisória.

Antes de ligar, publique no frontend a página de aceite do convite (guia em
`docs/api/README.md`, "Página de aceite do convite"). **Em 2026-11-16 o
frontend ainda usa dados simulados e não tem `/aceitar-convite`:** até a
integração, cadastre usuários pela API com `"channel": "temporary_password"`.
Ligar o SMTP não exige migration: a tabela `user_invitations` já vem na
`1792100000000-CreateUserInvitations`, que o entrypoint aplica no deploy.

Com o SMTP desligado, os e-mails de alerta e de aviso ficam registrados no banco
como não enviados (`skipped`/`CHANNEL_DISABLED`), sem erro no log. Ao ligar o
SMTP, **só os gerados dali em diante saem**: os acumulados não são reenviados
(decisão de Mateus em 2026-11-12). O aviso de vencimento continua visível na tela
(`term.expiryWarning` em `GET /organizations/me/plan`).

Na primeira execução depois do deploy do BE-28, toda organização com o termo
corrente **já vencido**, de qualquer data, recebe o aviso de vencimento uma vez
(com o SMTP desligado, fica só registrado).

O link do e-mail usa `NOTIFICATION_APP_URL`. Falha temporária do servidor (4xx,
rede) tenta de novo em 1 min, 5 min, 30 min e 2 h; recusa definitiva (5xx) fica
`failed`. O log leva só o id e o código, nunca o endereço.

Para testar sem servidor real, suba um Mailpit (`axllent/mailpit`, SMTP na porta
1025 e interface web na 8025), aponte `SMTP_HOST`/`SMTP_PORT` para ele e confira
as mensagens na interface.

**Visual dos e-mails (desde 2026-11-17).** Os quatro e-mails saem em HTML no
layout do VitaCare (faixa navy com a logo, botão teal, destaque de severidade ou
de vencimento e rodapé padrão), sempre com a versão em texto puro junto. A logo
vai como anexo inline (CID), embutida na API: não depende do frontend no ar nem
de imagem remota. Não há variável nova. Para ver os quatro com dados sintéticos,
rode localmente `npm run build` e
`node scripts/mail/preview-emails.mjs [--out <dir>] [--smtp 127.0.0.1:1025]`:
o script grava um `.html` e um `.txt` por e-mail e, com `--smtp`, envia ao
Mailpit. Para ver na caixa real, envie pela Hostinger só para o seu endereço
(`--smtp smtp.hostinger.com:465 --secure --from no-reply@vitacare.bizys.com.br
--to <seu-endereco> --app-url https://vitacare.bizys.com.br --only <nome>`, com
`SMTP_USER` e `SMTP_PASSWORD` no ambiente, nunca na linha de comando). Use o
endereço real em `--app-url`: com o padrão `app.example.test`, o filtro de saída
da Hostinger (MailChannels) devolveu os 7 e-mails com `550 5.7.1 [CS] Message
blocked` em 2026-11-17. Mande um por vez (`--only`).

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
# API em http://0.0.0.0:1050/api/v1   (dentro do container; fora, só 127.0.0.1)
curl -s http://127.0.0.1:1050/health/ready    # na VPS
```

Se a migration falhar, o container não sobe (restart em loop com o erro no log).

### 7. Domínio, proxy e HTTPS

**7.1 DNS** — a zona do `bizys.com.br` fica no **registro.br** (nameservers
`d/f.sec.dns.br`): Painel → `bizys.com.br` → DNS → Configurar zona (modo
avançado) → Nova entrada. O campo Nome recebe só o que vem antes de
`.bizys.com.br`; depois de **Salvar alterações**, a lista mostra o nome inteiro.

| Tipo | Nome | Dados |
| --- | --- | --- |
| A | `vitacare` | `<IP-da-VPS>` |
| A | `api.vitacare` | `<IP-da-VPS>` |

`vitacare` é **A, nunca CNAME**: o mesmo nome tem o MX do e-mail (passo 4), e
CNAME não convive com MX. Sem AAAA. Não mexer nas linhas de `bizys.com.br`,
`sistema` e `www` (outros sistemas e o e-mail da raiz).

```bash
dig +short vitacare.bizys.com.br @d.sec.dns.br       # servidor do registro.br, sem cache
dig +short api.vitacare.bizys.com.br @d.sec.dns.br
dig +short api.vitacare.bizys.com.br @8.8.8.8        # pode levar até 15 min a mais (cache negativo)
```

**7.2 Rede `proxy`** — o NPM só entrega a container que esteja nela:

```bash
docker network inspect proxy --format '{{range .Containers}}{{.Name}} {{end}}' | tr ' ' '\n' | grep -E 'nginx-proxy-manager|app-vitacare|uptime-kuma'
```

**7.3 Proxy hosts no NPM** — o painel escuta só no localhost da VPS. No
terminal do **PC** (não da VPS), abrir o túnel e deixá-lo aberto:

```bash
ssh -L 8181:127.0.0.1:81 mavila@<IP-da-VPS>
```

Navegador do PC → `http://localhost:8181` → Hosts → Proxy Hosts → Add Proxy Host:

| Domain Names | Scheme · Forward | Opções | Advanced |
| --- | --- | --- | --- |
| `api.vitacare.bizys.com.br` | `http` · `app-vitacare` · `1050` | Block Common Exploits ligado; Cache Assets e Websockets desligados | abaixo |
| `vitacare.bizys.com.br` | `http` · `app-vitacare-frontend` · `1040` | Block Common Exploits ligado | vazio |

```nginx
client_max_body_size 12m;
proxy_connect_timeout 10s;
proxy_send_timeout 90s;
proxy_read_timeout 90s;
```

12m cobre o anexo de 10 MiB (BE-13) mais o envelope multipart; 90 s ficam acima
do `requestTimeout` de 60 s ([Hierarquia de timeouts](#hierarquia-de-timeouts-crescente-de-dentro-para-fora)).

Teste antes do certificado (não depende do DNS):

```bash
curl -s -H 'Host: api.vitacare.bizys.com.br' http://<IP-da-VPS>/health/ready; echo
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: vitacare.bizys.com.br' http://<IP-da-VPS>/healthz
```

`502` = container fora da rede `proxy` ou nome/porta errados; `404` ou a página
do NPM = nome digitado diferente.

**7.4 Certificado** — só depois do `dig` responder. Em cada host: Edit → SSL →
*Request a new SSL Certificate*, **Force SSL** e **HTTP/2** ligados, e-mail,
aceitar os termos, Save. **HSTS:** no host do frontend ligado (HSTS Subdomains
desligado); no host da API **desligado**, porque a API já envia o cabeçalho
(Helmet, 1 ano, `includeSubDomains`) e dois cabeçalhos HSTS confundem a
conferência. Erro "Internal Error" = DNS ainda não propagado ou porta 80
fechada; depois de 5 falhas seguidas o Let's Encrypt bloqueia o nome por 1 hora.

**7.5 Stacks** — na `vitacare` não pode existir `APP_BIND` (passo 4); na
`vitacare-frontend`, `API_URL=https://api.vitacare.bizys.com.br` e sem
`APP_BIND`. **Update the stack** nas duas.

### 8. Validação de fora

```bash
API=https://api.vitacare.bizys.com.br
curl -sI http://api.vitacare.bizys.com.br/health/ready | grep -iE '^HTTP|^location'   # 301 → https
curl -sI $API/health/ready | grep -iE '^HTTP|strict-transport'                       # HTTP/2 200 + HSTS
curl -s $API/api/v1 | grep -o '"version":"[^"]*"'                                     # = commit da main
curl -s -o /dev/null -w 'frontend: %{http_code}\n' https://vitacare.bizys.com.br/healthz
echo | openssl s_client -connect api.vitacare.bizys.com.br:443 -servername api.vitacare.bizys.com.br 2>/dev/null | openssl x509 -noout -issuer -enddate
curl -si -X OPTIONS $API/api/v1/auth/login -H 'Origin: https://vitacare.bizys.com.br' \
  -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,authorization' | grep -iE '^HTTP|access-control'
curl -s https://vitacare.bizys.com.br/config.js                                      # apiUrl = a API em https
curl -m 5 -s -o /dev/null -w '%{http_code}\n' http://<IP-da-VPS>:1050/health/live || echo 'porta 1050 recusada (ok)'
```

Do lado de fora, conferir também o **IP real**: um login com senha errada feito
de uma rede externa (4G, por exemplo; a rede da Unimed bloqueia o domínio)
grava `auth.login_failed` com o IP que `curl -s https://ifconfig.me` mostra
nessa rede, e não um `172.x`. Teste feito de dentro da VPS mostra o IP da
própria VPS e não prova nada.

```bash
docker exec -it postgresql psql -U vitacare -d vitacare -c \
  "select action, host(ip_address) as ip, occurred_at from audit_events where action like 'auth.login%' order by occurred_at desc limit 3;"
```

Swagger: `https://api.vitacare.bizys.com.br/api/docs`.

### 9. Plataforma, administrador master e primeiro acesso (uma vez)

O banco nasce vazio e o `seed:dev` recusa produção. Os planos **Basic** e
**Enterprise** do Quadro 2 já vêm pelas migrations: **não** inserir nada em
`usage_plans` à mão.

Primeiro a organização de plataforma e o administrador master (CPF válido; a
senha provisória aparece uma única vez no terminal e não vai para log nem
auditoria):

```bash
docker exec -it app-vitacare node dist/cli/seed-platform.js \
  --organization-code vitacare --trade-name "VitaCare" \
  --admin-name "<Nome>" --admin-email <email> --admin-cpf <cpf>
```

O seed roda uma vez por banco; a segunda execução é recusada sem alterar nada.
**Não tente o login antes do seed:** a tentativa conta no limite de 5 falhas em
15 minutos (`AUTH_TEMPORARILY_BLOCKED`) mesmo sem gravar auditoria, porque a
organização ainda não existe.

Primeiro acesso, troca da senha provisória e aceite do termo (leia antes em
`https://api.vitacare.bizys.com.br/termos`). As senhas são digitadas sem
aparecer e sem ir para o histórico. **Cole cada `read` sozinho e digite a senha
em seguida**: colado junto com outras linhas, o `read` consome a linha seguinte
do bloco como se fosse a senha.

```bash
read -rsp 'Senha provisoria: ' SENHA; echo
```

```bash
read -rsp 'Nova senha definitiva: ' NOVA; echo
```

```bash
API=https://api.vitacare.bizys.com.br; ORG=vitacare; EMAIL=<email>
login() { curl -s -X POST $API/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"organizationCode\":\"$ORG\",\"email\":\"$EMAIL\",\"password\":\"$1\"}"; }
R=$(login "$SENHA"); echo "$R" | grep -oE '"(state|code)":"[^"]*"'
TOKEN=$(echo "$R" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
curl -s -o /dev/null -w 'primeiro acesso: %{http_code}\n' -X POST $API/api/v1/auth/password/first-access -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"newPassword\":\"$NOVA\"}"
R=$(login "$NOVA"); echo "$R" | grep -oE '"(state|code)":"[^"]*"'
TOKEN=$(echo "$R" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
curl -s -X POST $API/api/v1/terms/acceptances -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"version":1}' | grep -oE '"(version|alreadyAccepted)":[a-z0-9]+'
R=$(login "$NOVA"); echo "$R" | grep -oE '"(state|code)":"[^"]*"'
TOKEN=$(echo "$R" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
curl -s -o /dev/null -w 'logout: %{http_code}\n' -X POST $API/api/v1/auth/logout -H "Authorization: Bearer $TOKEN"
unset SENHA NOVA TOKEN R
```

Esperado: `password_change_required` → `primeiro acesso: 200` →
`terms_acceptance_required` → `"version":1` e `"alreadyAccepted":false` →
`authenticated` → `logout: 200` (as linhas `"code":"platform_admin"` e
`"code":"vitacare"` são o perfil e a organização do bloco `session`).

Depois o master cadastra cada organização com o primeiro administrador em
`POST /api/v1/organizations` (manual:
[`organizations-criar.md`](api/endpoints/organizations-criar.md)).

### 10. GitHub

Settings → Secrets and variables → Actions: secret `PORTAINER_WEBHOOK_URL` (URL
do passo 5) e variable `APP_URL=https://api.vitacare.bizys.com.br` (no
repositório do frontend, `APP_URL=https://vitacare.bizys.com.br`). *Re-run all
jobs* do workflow do passo 1: três jobs verdes (`testes`, `imagem`, `deploy`),
com "Versão <commit> no ar em <APP_URL>" no fim do deploy (o job espera
`GET /api/v1` mostrar o commit em `data.version` e `/health/ready` responder
`200`, por até 6 minutos). A homologação da imagem não roda no CI: ver
[Antes do merge na main](#antes-do-merge-na-main).

### 11. Monitoramento e backup

> **Estado em 2026-11-17 (OPS-01):** os monitores do Kuma foram concluídos por
> Mateus. O backup próprio do VitaCare (cron do `backup.sh`), a cópia externa e
> o ensaio de restauração ficaram **fora do escopo** por decisão de Mateus
> (projeto acadêmico; vale o backup completo do servidor que ele mantém). As
> instruções de backup abaixo ficam para uso futuro. Sem o cron, o monitor
> `vitacare backup` cai depois de 25 h: pause-o no Kuma até o cron existir.

**Uptime Kuma**, cada monitor com a notificação SMTP (a mesma caixa
`no-reply@vitacare.bizys.com.br`, `smtp.hostinger.com:465`, Security TLS):

| Monitor | Tipo | Alvo | Intervalo |
| --- | --- | --- | --- |
| `vitacare app` | HTTP | `https://api.vitacare.bizys.com.br/health/ready`, com **Certificate Expiry Notification** (aviso a partir de 14 dias) | 60 s |
| `vitacare frontend` | HTTP | `https://vitacare.bizys.com.br/healthz` | 60 s |
| `vitacare workers` | Push | token em `UPTIME_KUMA_PUSH_URL` (passo 4) | 600 s |
| `vitacare backup` | Push | token na linha do cron abaixo | 90000 s (25 h) |

O monitor do app passa pelo domínio de propósito: confere DNS, NPM e
certificado junto com a API. O heartbeat continua pela rede interna
(`http://uptime-kuma:3001`), porque não depende do caminho público.

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
ela, perder a VPS ou a conta perde os backups. Adiada em 2026-11-16 e
deixada fora do escopo em 2026-11-17 por decisão de Mateus, junto com o cron
do `backup.sh`.

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
4. **Subir a stack** (Start) e conferir: `node scripts/ops/smoke.mjs --base-url https://api.vitacare.bizys.com.br`
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

- **Antes de um merge com migration**: rodar à mão a homologação de
  [Antes do merge na main](#antes-do-merge-na-main), que prova `revert` +
  `migrate` e diz se a imagem anterior roda sobre o schema novo; depois
  `/opt/vitacare/backup.sh` na VPS e confirmar a pasta nova.
- **Rollback de imagem** (código antigo compatível com o schema novo — o resumo
  da homologação local diz): `APP_IMAGE=ghcr.io/sistema-vitacare/vitacare-backend:sha-<commit>`
  → Update the stack; apagar a variável para voltar.
- **Rollback com schema** (o resumo avisou incompatibilidade): parar a stack,
  `docker run --rm --network infra <variáveis do banco> ghcr.io/sistema-vitacare/vitacare-backend:sha-<commit-novo> revert`
  (uma migration por execução; o `down` pode apagar dado da migration), então
  `APP_IMAGE` com o commit anterior. Se o `down` não servir: restauração.
- O `down` da `1792100000000-CreateUserInvitations` (BE-31) **recusa** a
  reversão enquanto houver usuário `pending` por link (sem senha), com mensagem
  que diz quantos. Reemita o convite deles com `channel: "temporary_password"`
  ou inative-os antes de reverter. Com o SMTP desligado, não existe nenhum;
  com o SMTP ligado (produção desde 2026-11-16), pode existir, então confira
  antes de reverter.
  O código anterior ao BE-31 roda sobre o schema novo enquanto não houver
  pendente por link.
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

`req.remoteAddress` é o IP do **cliente** pela regra `TRUST_PROXY` (o `req.ip`
do Express, o mesmo da auditoria), e não o do NPM (OPS-01, 2026-11-16):

```logql
{stack="vitacare"} |= "request completed" | json | line_format "{{.req_remoteAddress}} {{.req_method}} {{.req_url}} {{.res_statusCode}}"
```

## Metas (decididas por Mateus em 2026-11-10)

| Meta | Valor | Medido localmente em 2026-11-10 (512 MiB, 1 CPU, 1.000 pacientes, 5.000 registros) |
| --- | --- | --- |
| RPO | 24 h | backup diário único (banco + anexos), 14 dias |
| RTO | 4 h | restauração 1 s e API de pé em 12–16 s com o conjunto de teste; ensaio na VPS fora do escopo (2026-11-17) |
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
padrão faz ~3–4 hashes/s; 10 logins simultâneos levam até ~4,8 s. A meta de
leitura e os parâmetros do argon2 ficam **a revisitar no uso** (decisão de
Mateus em 2026-11-12), sem bloquear a conclusão do backend. Saídas possíveis
quando voltar ao tema: aceitar o modelo com pausa, `API_CPUS=2`, otimizar
painel/CSV, ajustar o argon2.

Sem SLA ou SLO de disponibilidade: não declarar.

## Antes de dados reais (checklist)

Marcar só o que foi conferido, com a data. Estado da OPS-01 em
[`docs/ops/ops-01-dominio-https-smtp.md`](ops/ops-01-dominio-https-smtp.md).

- [x] **HTTPS configurado** (verificado em 2026-11-16, OPS-01): certificado
      Let's Encrypt nos dois nomes, `http` → `https` com `301`, HSTS presente,
      `/health/ready` 200 e `data.version` igual ao commit da `main` pelo
      domínio; `1050` e `1040` recusadas por IP e regras retiradas do firewall.
- [x] IP real do cliente conferido de uma rede externa (passo 8), concluído por
      Mateus em 2026-11-17.
- [ ] Termo de uso publicado: na API, sim — o master aceitou a versão 1 em
      2026-11-16 pelo domínio, e a versão 2 (DOC-03, 2026-11-17, sem a promessa
      de cópia de segurança diária) sai no deploy seguinte e pede novo aceite. Falta o frontend linkar `/termos` no rodapé e
      tratar `403 TERMS_ACCEPTANCE_REQUIRED` ([Termo de uso](#termo-de-uso-e-aceite-be-32)).
- [x] `CORS_ORIGINS` só com a origem do frontend (preflight de
      `https://vitacare.bizys.com.br` com `204` em 2026-11-16).
- [x] SMTP ligado e testado: SPF, DKIM e DMARC `PASS` e recuperação de senha
      com link `https` recebida (2026-11-16); notificação do Kuma pela mesma caixa;
      e-mail de alerta `sent`, convite enviado e nova tentativa sem duplicar com a
      porta 465 bloqueada (2026-11-17, na organização de teste `teste-ops`).
- [x] Monitores `vitacare app` (pelo domínio, com aviso de certificado), `vitacare frontend`, `vitacare workers` e `vitacare backup` no Kuma, com alerta por e-mail testado (concluído por Mateus em 2026-11-17, declarado; o `vitacare backup` depende do cron do backup).
- [x] Proteção contra perda de dados: o **backup completo do servidor** mantido
      por Mateus (decisão de 2026-11-17, não conferido pelo agente). Cron do
      `backup.sh`, cópia externa, ensaio de restauração e medição de carga ficaram
      fora do escopo por ser projeto acadêmico; os scripts continuam disponíveis.
- [x] **LGPD (P31), escopo acadêmico** (decisão de Mateus em 2026-11-12): o
      VitaCare é projeto acadêmico, não produto comercial em conformidade plena.
      A P31 se resolve com o termo de uso e privacidade e o registro do aceite
      (BE-32). Fora de escopo: funções de direitos do titular (exportar,
      anonimizar, excluir), encarregado formal e parecer jurídico; os pedidos do
      titular são atendidos à mão pela organização, e o prazo de guarda clínica é
      decisão dela. Uso fora do escopo acadêmico exige rever essa decisão.
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
| `502 Bad Gateway` pelo domínio | container fora da rede `proxy` ou nome/porta errados no NPM | passo 7.2 e 7.3 |
| "Internal Error" ao pedir o certificado | DNS ainda não propagado ou porta 80 fechada | `dig` do passo 7.1; esperar; até 5 tentativas por hora |
| `413` ao enviar anexo | limite de corpo do NPM | `client_max_body_size 12m;` no Advanced do host da API |
| API não sobe com `SMTP_ENABLED=true` | `SMTP_FROM` com nome (`VitaCare <...>`) ou URL de link faltando | `SMTP_FROM` só com o endereço; passo 4 |
| `429 AUTH_TEMPORARILY_BLOCKED` no login | 5 falhas em 15 min pela conta ou pelo IP, inclusive antes do seed | esperar 15 min da primeira falha; tentativa bloqueada não soma |
| log e auditoria com IP `172.x` | `TRUST_PROXY` vazio/`false` ou proxy fora da faixa privada | voltar ao padrão `loopback,uniquelocal` |

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

## Termo de uso e aceite (BE-32)

- **Texto:** `docs/termos/termo-de-uso-v<N>.md`, versionado no repositório. A
  versão publicada é identificada pelo número e pelo SHA-256 do conteúdo.
- **Publicação:** só por migration, no deploy. A versão 1 vem da
  `1792200000001-PublishTermsOfUseV1` e a versão 2 (vigente desde a DOC-03,
  2026-11-17) da `1792300000000-PublishTermsOfUseV2`. Cada uma guarda o texto e
  o hash como constantes, e um teste confere que batem com o arquivo. Para uma versão nova:
  1. criar `docs/termos/termo-de-uso-v<N>.md` (Markdown simples: `#`, `##`,
     parágrafos, listas `-` e `1.`, negrito `**`; sem tabela nem link);
  2. criar a migration `PublishTermsOfUseV<N>` no mesmo molde, com teste de
     hash igual ao da v1 e da v2 (`tests/modules/Terms/termsContent.spec.ts`);
  3. merge na `main`: o entrypoint aplica a migration e, a partir da requisição
     seguinte, **todos** os usuários precisam aceitar de novo (inclusive quem
     está logado). Os aceites antigos continuam guardados.
- **Página:** `<APP_URL>/termos` (e `/termos?versao=N`), pública mesmo com
  `SWAGGER_ENABLED=false`. Linkar no rodapé do frontend e nos e-mails.
- **Prova:** `terms_acceptances` (imutável por trigger) com data e hora do
  servidor, IP (regra `TRUST_PROXY`), navegador, versão, hash, perfil e
  requisição; consulta em `GET /api/v1/terms/acceptances` (admin da própria
  organização, master de todas). O backup do banco leva a tabela junto.
- **Reverter** a publicação é recusado quando alguém já aceitou a versão: o
  aceite é prova e não pode perder o texto.
- **Smoke e carga:** o modo `read` não faz login; `full`, `verify` e
  `load.mjs` aceitam o termo com as contas sintéticas que criam.
- **Ordem de publicação:** o merge na `main` dispara o deploy, e o entrypoint
  publica a versão nova na subida (a 1 no BE-32, a 2 na DOC-03). A partir da requisição seguinte, **todo**
  usuário recebe `terms_acceptance_required` no login e `403
  TERMS_ACCEPTANCE_REQUIRED` nas demais rotas. Publique o frontend com a tela
  do termo e o tratamento do `403` **antes ou junto** deste merge; sem isso,
  ninguém consegue usar o sistema, nem em demonstração.

## Histórico: acesso por IP (2026-11-10 a 2026-11-16)

De 2026-11-10 (decisão de Mateus, divergente do TCC, p. PDF 50: "requisições
HTTPS") a 2026-11-16, o acesso era por `http://<IP-da-VPS>:1050` (API) e
`:1040` (frontend), com `APP_BIND=0.0.0.0` e as portas abertas no firewall.
Senha, token Bearer, dados de saúde e anexos trafegavam sem criptografia, e o
navegador não liberava service worker nem Push API. Em 2026-11-13 Mateus
decidiu que haveria HTTPS; em 2026-11-12 decidiu o domínio, o SMTP e o restante
da infraestrutura (OPS-01), e o domínio com HTTPS entrou no ar em 2026-11-16
([Passo a passo](#passo-a-passo-do-zero-ao-ar-domínio-com-https)). Não voltar a
publicar a porta: `APP_BIND` não existe mais na stack.

## Pendências

Andamento da OPS-01 item a item em
[`docs/ops/ops-01-dominio-https-smtp.md`](ops/ops-01-dominio-https-smtp.md).

- **OPS-01 concluída em 2026-11-17** (domínio com HTTPS, SMTP, push na API e
  monitores). Backup próprio, cópia externa, ensaio de restauração e carga ficaram
  fora por decisão de Mateus (projeto acadêmico; vale o backup completo do
  servidor).
- **Push no navegador**: o teste de inscrição e recebimento depende do service
  worker do frontend, que ainda não existe.
- **Organização de teste `teste-ops`** (criada em 2026-11-17 para os testes de
  SMTP e push): inativar ou manter só como teste antes de dados reais.
- **Frontend** (repositório próprio): ainda com dados simulados em 2026-11-16 —
  sem `/aceitar-convite`, tela do termo nem service worker. A validação nos
  navegadores (RF019, RNF001–003) agora é possível com HTTPS.
- **LGPD (P31)** resolvida no escopo acadêmico com o termo de uso (BE-32): ver
  o checklist.
- **S3**: anexos usam o volume local (decisão de 2026-11-05).
- **Dependências**: `npm audit` (à mão, fora do CI) sem `high`/`critical`; restam 3 `moderate`
  (glob/minimatch via TypeORM, correção só no TypeORM 1.x, fora do semver).

# OPS-01 — Domínio com HTTPS, SMTP, push e infraestrutura restante na VPS

Roteiro de execução e estado da OPS-01, para continuar de qualquer máquina. O
procedimento permanente fica em [`docs/deploy-vps.md`](../deploy-vps.md); aqui
fica **o que já foi feito, com a evidência, e o que falta**, com os comandos.
O registro da tarefa no vault é
`02-projetos/vitacare-backend/tarefas/2026-11-16-ops-01-dominio-https-smtp.md`.

- **Decisão:** Mateus, 2026-11-12. Domínio com HTTPS (revê o acesso por IP de
  2026-11-10), SMTP ligado em produção e infraestrutura restante concluída.
- **Divisão de papéis:** o agente não acessa a VPS, o painel do domínio, o
  hPanel nem o NPM. Mateus executa e devolve as saídas; o agente confere o que
  dá para conferir de fora. Item sem evidência fica **pendente**.
- **Segredos** (senha da caixa SMTP, chaves VAPID, tokens do Kuma, senha do
  Redis, chave da cópia externa): só no `.env.production` da stack e no cofre de
  Mateus. Aqui e no vault, só `<placeholder>`.
- **Rede da Unimed:** o FortiGuard bloqueia `*.bizys.com.br`. Conferências de
  fora são feitas da VPS ou de outra rede (4G, casa).

## Valores decididos

| Item | Valor | Decidido |
| --- | --- | --- |
| Frontend | `https://vitacare.bizys.com.br` → `app-vitacare-frontend:1040` | Mateus, 2026-11-16 |
| API | `https://api.vitacare.bizys.com.br` → `app-vitacare:1050` | Mateus, 2026-11-16 |
| DNS | zona do `bizys.com.br` no registro.br (`d/f.sec.dns.br`), registros A | já existente |
| SMTP | Hostinger Business Starter, `smtp.hostinger.com:465` (TLS), 1.000 envios/dia por caixa | Mateus, 2026-11-16 |
| Remetente | `no-reply@vitacare.bizys.com.br`, no subdomínio (a raiz tem MX e SPF de outra conta Hostinger) | Mateus, 2026-11-16 |
| Cópia externa dos backups | adiada | Mateus, 2026-11-16 |

## Encerramento (2026-11-17)

**OPS-01 concluída por decisão de Mateus em 2026-11-17.** O VitaCare é um
projeto acadêmico, e a tarefa fica restrita ao que o TCC promete:

- comunicação por HTTPS (PDF p. 50; RNF004);
- recuperação de senha por e-mail (UC02);
- notificação dos alertas aos usuários vinculados (UC13/RF014);
- disponibilidade vigiada (RNF008, sem metas numéricas no TCC).

Os quatro estão entregues: os três primeiros com a evidência abaixo e a
disponibilidade pelos monitores do Kuma, concluídos por declaração de Mateus.
Saíram da tarefa o backup próprio do VitaCare (cron do `backup.sh`), a cópia
externa, o ensaio de restauração, a carga no hardware real e o smoke final.

Para o RNF007 ("evitar perda de dados"), vale o **backup completo do servidor
que Mateus já mantém**, que o agente não conferiu. Os scripts de `scripts/ops/`
continuam no repositório como ferramentas opcionais.

Pendências fora da tarefa:

- **Push no navegador:** o teste espera o service worker do frontend.
- **Organização `teste-ops`:** antes de dados reais, inativar ou manter só como
  teste.
- **Monitor `vitacare backup` do Kuma:** sem o cron do `backup.sh` ele não recebe
  push e cai em 25 h; pausar ou excluir.

## Estado

| # | Item | Estado | Evidência |
| --- | --- | --- | --- |
| A1 | DNS `vitacare` e `api.vitacare` (A) | ✅ concluído | `dig` no `d.sec.dns.br`, `f.sec.dns.br`, `8.8.8.8`, `1.1.1.1` e `9.9.9.9` com o IP da VPS; sem AAAA |
| A2 | Containers na rede `proxy` | ✅ indireto | A4 respondeu pelos dois hosts; `uptime-kuma` na rede não conferido |
| A3 | Proxy hosts no NPM | ✅ concluído | criados por Mateus, com o Advanced da API |
| A4 | Roteamento antes do certificado | ✅ concluído | `/health/ready` ok (postgres e redis `up`) e frontend `/healthz` 200 pelo cabeçalho `Host` |
| A5 | Certificado Let's Encrypt | ✅ concluído | emissor `YE1`, válido até 2027-02-14; `301` http → https; `HTTP/2 200`; HSTS presente |
| A5b | HSTS só uma vez na API | ✅ concluído | HSTS do NPM desligado no host da API, sobrando o do Helmet. Concluído por Mateus em 2026-11-17 (declarado, sem saída anexada) |
| A6 | Stacks sem `APP_BIND`, CORS e `API_URL` | ✅ concluído | preflight `204` com `access-control-allow-origin: https://vitacare.bizys.com.br`; `config.js` com `apiUrl` em https; `1050`/`1040` recusadas por IP |
| A7 | `APP_URL` no GitHub e job `deploy` verde | ✅ concluído | variable `APP_URL` em https no backend e no frontend; job `deploy` verde pelo domínio. Concluído por Mateus em 2026-11-17 (declarado, sem saída anexada) |
| A8 | `data.version` pelo domínio | ✅ concluído | `402f2e733586592b968e9c827c6832d5285d3a96` (main em 2026-11-16); a versão da `main` com a OPS-01 (`6fb1bcf`) é conferida pelo próprio job `deploy` (A7) |
| A9 | Regras 1050/1040 fora do firewall | ✅ feito por Mateus | portas já recusadas por IP (A6) |
| A10 | IP real do cliente atrás do NPM | ✅ concluído | teste de rede externa com a auditoria gravando o IP do cliente (antes, de dentro da VPS, só o indício do IP público dela). Concluído por Mateus em 2026-11-17 (declarado, sem saída anexada) |
| — | Seed da plataforma e master | ✅ concluído | `organization.platform_seeded` em 2026-11-16 20:30 UTC; primeiro acesso, troca de senha e aceite do termo v1 pelo domínio |
| — | Log HTTP com o IP do cliente | ✅ no código, na `main` (`6fb1bcf`) | `req.remoteAddress` = `req.ip`; testes em `tests/common/logRedaction.spec.ts`; conferência no Loki fica no G |
| B1 | Business Starter contratado, domínio `vitacare.bizys.com.br` | ✅ concluído | verificado pela Hostinger em 2026-11-16, depois de um TXT de teste igual na raiz (já removido; o do subdomínio fica) |
| B2 | Caixa `no-reply@vitacare.bizys.com.br` | ✅ criada por Mateus | senha só no cofre |
| B3 | MX, SPF, DKIM e DMARC do subdomínio | ✅ publicado | em 2026-11-16, `d.sec.dns.br` e `f.sec.dns.br`: MX `mx1`/`mx2.hostinger.com` (5/10); TXT com a verificação e `v=spf1 include:_spf.mail.hostinger.com ~all`; CNAME `hostingermail-a/b/c._domainkey.vitacare` → `hostingermail-*.dkim.mail.hostinger.com` (o Google resolve até `v=DKIM1`); `_dmarc.vitacare` = `v=DMARC1; p=none`, como a Hostinger sugeriu, sem `rua`; raiz inalterada (MX `.com.br` e SPF próprio) |
| B4 | hPanel verde e mail-tester | ✅ concluído | mail-tester **9,5/10** com envio pelo webmail em 2026-11-16 |
| B5 | A VPS alcança o SMTP | ✅ concluído | `SMTP ok` no `verify()` de dentro do `app-vitacare` (465/TLS), 2026-11-16. A primeira senha vazou num `read` mal colado e foi trocada antes do teste |
| B6 | Variáveis SMTP na stack | ✅ concluído | 2026-11-16: `printenv` no `app-vitacare` com `SMTP_ENABLED=true`, `smtp.hostinger.com:465` TLS, remetente e URLs em `https://vitacare.bizys.com.br`, senha presente; API subiu sem erro de validação e `/health/ready` ok |
| B7 | Recuperação de senha real | ✅ concluído | 2026-11-16 20:20: e-mail "Redefinição de senha VitaCare" de `no-reply@vitacare.bizys.com.br` entregue em 3 s na caixa principal do Gmail, com o link `https://vitacare.bizys.com.br/redefinir-senha?token=...` (15 min); "Mostrar original": SPF `PASS`, DKIM `PASS` (`vitacare.bizys.com.br`), DMARC `PASS` |
| B8 | SMTP no Kuma | ✅ concluído | notificação SMTP (`smtp.hostinger.com`, 465, TLS, caixa `no-reply@`) testada no Kuma. Concluído por Mateus em 2026-11-17 (declarado, sem saída anexada) |
| B9 | Alerta por e-mail, convite e nova tentativa | ✅ concluído | 2026-11-17, na `teste-ops`: alerta (glicemia 250, regra `gt 180`) com as duas entregas `email` (cuidador vinculado e admin responsável) `sent` na 1ª tentativa, 7 s após o registro; convite com `channel: email` → `delivery.status = sent`, convite `pending` até 2026-11-20, sem senha na resposta; com a 465 de saída bloqueada (`DOCKER-USER`), novo alerta (260) ficou `pending`, `attempts = 1`, `SMTP_UNAVAILABLE`, e, liberada a porta, passou a `sent` com `attempts = 2` na tentativa de 1 min, uma entrega por destinatário, sem duplicar. Antes, foi marcado por declaração e revertido, porque a produção não tinha organização cliente |
| C | Push (VAPID) | ✅ concluído na API | 2026-11-17: par gerado uma vez na imagem (`web-push`), guardado no cofre; `WEB_PUSH_*` na stack com `WEB_PUSH_SUBJECT` `mailto:`; API subiu sem erro de validação; `GET /notifications/push/config` com o admin da `teste-ops` respondeu `enabled: true` e a chave pública (`BPGADyGp…`). O teste no Chrome e no Firefox (inscrição, push recebido, revogação) continua pendente do service worker do frontend |
| — | Organização de teste `teste-ops` | ✅ criada | 2026-11-17, pelo master: plano Basic, admin `mateusmenavila+admin@gmail.com` com primeiro acesso e termo v1 aceito. Antes de dados reais, inativar ou manter só como organização de teste |
| D | Monitores do Kuma | ✅ concluído | `vitacare app` (domínio, aviso de certificado), `vitacare frontend`, `vitacare workers` (heartbeat) e `vitacare backup` com a notificação SMTP, e teste de queda. Concluído por Mateus em 2026-11-17 (declarado, sem saída anexada). O `vitacare backup` só recebe push depois do cron do E1 |
| E | Backup, cron, restauração | ➖ fora do escopo (decisão de Mateus em 2026-11-17: projeto acadêmico, só o prometido no TCC) | backup completo do servidor mantido por Mateus, não conferido pelo agente; cópia externa e ensaio de restauração fora |
| F | Carga no hardware real | ➖ fora do escopo (decisão de Mateus em 2026-11-17: projeto acadêmico, só o prometido no TCC) | o TCC não define metas numéricas; a medição local do BE-25 (2026-11-10) continua como referência |
| G | Conferência final | ➖ fora do escopo (decisão de Mateus em 2026-11-17: projeto acadêmico, só o prometido no TCC) | `data.version` pelo domínio (A8) e job `deploy` (A7) já cobrem a versão no ar |

Achados de 2026-11-16, já corrigidos na documentação:

- **`SMTP_FROM` não aceita nome de exibição.** A validação (`Joi.string().email()`)
  recusa `VitaCare <no-reply@...>`, e a API não sobe. Usar só o endereço.
- **Planos vêm pela migration.** O `INSERT INTO usage_plans` do antigo passo 8
  estava obsoleto e foi retirado.
- **`read` colado com outras linhas consome a linha seguinte como senha.** Colar
  cada `read` sozinho.
- **No `read`, a senha vai no prompt, não no comando.** O comando é colado como
  está (`SMTP_TEST_PASS` é o nome da variável); a senha só depois de aparecer
  `Senha no-reply:`. Senha colada no comando fica no histórico e exige troca.
- **Senha sem `#`, `!`, `$`, aspas, crase, `\` ou espaço.** Quebram o shell e a
  interpolação da stack.
- **Falhas de login antes do seed contam no limite.** Elas não aparecem na
  auditoria, mas somam no Redis (5 em 15 min).
- **Frontend ainda com dados simulados.** Não tem `/aceitar-convite`, tela do
  termo nem service worker. Os testes de SMTP e push vão direto na API; usuários
  são cadastrados com `"channel": "temporary_password"` até a integração.

## Próximos passos (comandos)

### A — pendências do domínio

1. **NPM:** no host `api.vitacare.bizys.com.br`, aba SSL, desligue **só** o
   "HSTS Enabled" e salve. Na VPS, deve sobrar uma linha:

   ```bash
   curl -sI https://api.vitacare.bizys.com.br/health/ready | grep -ic strict-transport   # 1
   ```

2. **GitHub:** crie a variable `APP_URL=https://api.vitacare.bizys.com.br` no
   backend e `APP_URL=https://vitacare.bizys.com.br` no frontend. Depois, Actions →
   último workflow da `main` → Re-run all jobs. O fim do job `deploy` mostra
   "Versão <commit> no ar em https://api.vitacare.bizys.com.br".
3. **IP real**, pelo notebook no 4G (prompt `mavila@NBGI04`, fora da rede da
   Unimed):

   ```bash
   curl -s https://ifconfig.me; echo
   curl -s -X POST https://api.vitacare.bizys.com.br/api/v1/auth/login -H 'Content-Type: application/json' -d '{"organizationCode":"vitacare","email":"<email-do-master>","password":"senha-errada-de-teste"}' | grep -o '"code":"[^"]*"'
   ```

   Na VPS:

   ```bash
   docker exec -it postgresql psql -U vitacare -d vitacare -c "select action, host(ip_address) as ip, occurred_at from audit_events where action like 'auth.login%' order by occurred_at desc limit 3;"
   ```

   A linha mais recente tem de ter o IP do `ifconfig.me`. Rode uma vez só:
   5 falhas em 15 min bloqueiam a conta.

### B — SMTP

1. **B1:** aguardar a verificação da Hostinger, que costuma levar de 5 a 15 min,
   mais até 15 min de cache negativo. Para conferir o TXT:

   ```bash
   dig +short TXT vitacare.bizys.com.br @8.8.8.8     # "d494d5e8927b11da0e22ddf7688bd67e"
   ```

   Não apague esse TXT: ele convive com o SPF do passo 3.
2. **B2:** hPanel → E-mails → `vitacare.bizys.com.br` → criar
   `no-reply@vitacare.bizys.com.br`, com senha forte guardada só no cofre.
3. **B3:** no registro.br, crie os registros que o hPanel mostrar. Copie os
   valores exatos de lá; o formato esperado é:

   | Tipo | Nome | Dados |
   | --- | --- | --- |
   | MX | `vitacare` | `mx1.hostinger.com`, prioridade 5 |
   | MX | `vitacare` | `mx2.hostinger.com`, prioridade 10 |
   | TXT | `vitacare` | `v=spf1 include:_spf.mail.hostinger.com ~all` |
   | CNAME | `hostingermail-a._domainkey.vitacare` | `hostingermail-a.dkim.mail.hostinger.com` (idem `-b`, `-c`) |
   | TXT | `_dmarc.vitacare` | `v=DMARC1; p=none` (publicado assim) |

   Não toque nas linhas de `bizys.com.br`, `sistema` e `www`. Comece o DMARC com
   `p=none` e passe para `quarantine` depois de semanas sem falhas. Para receber
   os relatórios, acrescente `; rua=mailto:no-reply@vitacare.bizys.com.br`: um
   endereço de outro domínio (Gmail) exige registro de autorização no destino e
   os relatórios não chegam.

   Se a verificação do B1 travar com o TXT visível em todos os resolvedores,
   publique o mesmo TXT também na raiz `bizys.com.br` (foi o que destravou em
   2026-11-16) e apague-o depois de verificado.
4. **B4:** conferência. Depois, o status verde no hPanel e a nota no
   mail-tester.com, com um envio pelo webmail:

   ```bash
   D=vitacare.bizys.com.br; NS=d.sec.dns.br
   dig +short MX $D @$NS; dig +short TXT $D @$NS; dig +short TXT _dmarc.$D @$NS
   for s in a b c; do dig +short CNAME hostingermail-$s._domainkey.$D @$NS; done
   dig +short TXT bizys.com.br @$NS      # SPF da raiz inalterado
   ```

5. **B5:** a VPS alcança o SMTP? Cole cada bloco separado:

   ```bash
   read -rsp 'Senha no-reply: ' SMTP_TEST_PASS; echo
   ```

   ```bash
   export SMTP_TEST_PASS; docker exec -e SMTP_TEST_PASS app-vitacare node -e "require('nodemailer').createTransport({host:'smtp.hostinger.com',port:465,secure:true,auth:{user:'no-reply@vitacare.bizys.com.br',pass:process.env.SMTP_TEST_PASS}}).verify().then(()=>console.log('SMTP ok'),e=>{console.error('falhou',e.code,e.responseCode||'');process.exit(1)})"; unset SMTP_TEST_PASS
   ```

6. **B6:** variáveis `SMTP_*`, `PASSWORD_RESET_URL` e `INVITATION_ACCEPT_URL` na
   stack `vitacare` ([deploy-vps.md, passo 4](../deploy-vps.md#4-variáveis-envproduction-nunca-commitado)),
   com `SMTP_FROM` só com o endereço. Depois, **Update the stack** e:

   ```bash
   docker logs --since 5m app-vitacare 2>&1 | grep -iE "validation|API em" | tail
   ```

7. **B7:** recuperação de senha real. O e-mail chega com o link
   `https://vitacare.bizys.com.br/redefinir-senha?token=...` e, no "Mostrar
   original", SPF, DKIM e DMARC aparecem `PASS`:

   ```bash
   curl -s -X POST https://api.vitacare.bizys.com.br/api/v1/auth/password-recovery/request -H 'Content-Type: application/json' -d '{"organizationCode":"vitacare","email":"<email-do-master>"}' | grep -o '"message":"[^"]*"'
   ```

8. **B8:** Kuma → Settings → Notifications → SMTP (`smtp.hostinger.com`, 465,
   TLS, a mesma caixa) → Test → aplicar aos monitores do VitaCare.
9. **B9** (concluído em 2026-11-17, roteiro na seção [B9](#b9--alerta-por-e-mail-convite-e-nova-tentativa)):
   - e-mail de alerta com `notification_deliveries` saindo de `skipped` para
     `sent`;
   - convite (com o frontend ainda simulado, conferir só o envio);
   - SMTP inalcançável com nova tentativa sem duplicar.

   Esses testes precisam de uma organização de teste criada pelo master.

### Antes de começar (uma vez por sessão SSH)

Tudo roda como **root** na VPS e **na mesma sessão**: as variáveis e funções
abaixo se perdem ao sair. Ordem sugerida: C → D → E1 → E2 → F → G.

```bash
sudo -i
```

Os scripts vão do checkout para a VPS. No WSL, na raiz do `vitacare-backend` já
atualizado com a `main`:

```bash
scp -r scripts/ops <usuario>@<ip-da-vps>:/tmp/vitacare-ops
```

Na VPS:

```bash
mkdir -p /opt/vitacare && rm -rf /opt/vitacare/ops && mv /tmp/vitacare-ops /opt/vitacare/ops
cp /opt/vitacare/ops/backup.sh /opt/vitacare/ops/restore.sh /opt/vitacare/
chown -R root:root /opt/vitacare && chmod 700 /opt/vitacare/backup.sh /opt/vitacare/restore.sh
ls -l /opt/vitacare /opt/vitacare/ops
```

Variáveis do ambiente de teste. Os valores vêm do container de produção e não
aparecem na tela:

```bash
IMG=$(docker inspect app-vitacare --format '{{.Config.Image}}')
DBH=$(docker exec app-vitacare printenv DB_HOST); DBP=$(docker exec app-vitacare printenv DB_PASSWORD)
RH=$(docker exec app-vitacare printenv REDIS_HOST); RP=$(docker exec app-vitacare printenv REDIS_PASSWORD)
echo "imagem=$IMG db=$DBH redis=$RH senhas: ${DBP:+ok} ${RP:+ok}"
```

O resultado esperado é `imagem=ghcr.io/sistema-vitacare/vitacare-backend:latest`,
os dois hosts e `ok ok`.

```bash
# API de teste com os limites de produção, sem SMTP, sem push, sem heartbeat
sobe() { # nome banco volume
  docker run -d --name "$1" --network infra --memory 512m --cpus 1 \
    -v "$3:/app/storage" -e PORT=1050 -e RUN_MIGRATIONS=true -e THROTTLE_LIMIT=100000 \
    -e DB_HOST="$DBH" -e DB_USERNAME=vitacare -e DB_PASSWORD="$DBP" -e DB_DATABASE="$2" \
    -e REDIS_HOST="$RH" -e REDIS_PASSWORD="$RP" -e REDIS_KEY_PREFIX="$1:" -e QUEUE_PREFIX="$1" \
    -e SMTP_ENABLED=false -e WEB_PUSH_ENABLED=false -e UPTIME_KUMA_PUSH_URL= \
    "$IMG"
}
# smoke e load num Node 22 descartável, na rede infra
ops() {
  docker run --rm --network infra -v /opt/vitacare/ops:/ops:ro -v /root/vitacare-teste:/work \
    -e SMOKE_PLATFORM_CODE -e SMOKE_MASTER_EMAIL -e SMOKE_MASTER_PASSWORD -e SMOKE_ADMIN_PASSWORD \
    node:22-alpine node "$@"
}
mkdir -p /root/vitacare-teste && chmod 700 /root/vitacare-teste
```

Os containers de teste **nunca** recebem `SMTP_ENABLED=true`, nem o
`UPTIME_KUMA_PUSH_URL` da produção. Um banco restaurado tem entregas pendentes
copiadas da produção, que sairiam por e-mail de novo. Com o heartbeat ligado,
o teste mascararia uma queda real dos workers.

### B9 — Alerta por e-mail, convite e nova tentativa

Feito na organização de teste `teste-ops` (plano Basic), criada pelo master em
2026-11-17, porque a produção não tinha nenhuma organização cliente. O teste usa
um script Node avulso, fora do repositório, porque leva os e-mails reais de
teste. Ele roda num `node:22-alpine` descartável e só recebe as senhas por
ambiente.

1. **`setup`:** cria o cuidador (senha provisória), um paciente com o admin
   como responsável, o vínculo, um formulário com o campo `number` "Glicemia
   capilar" publicado, a regra `gt 180 warning` e o primeiro acesso do cuidador,
   com o termo aceito.
2. **E-mail de alerta:** `registrar 250` pelo cuidador. São esperados dois
   destinatários: o cuidador vinculado e o admin, que é o responsável. Os dois
   em `notification_deliveries` com `channel = email`, `status = sent`,
   `attempts = 1`, e dois e-mails recebidos.
3. **Convite:** `convite` cadastra um familiar com `channel: "email"`.
   Esperado: `delivery.status = sent`, convite `pending` e nenhuma senha na
   resposta. O e-mail chega com o link para `/aceitar-convite`, que o frontend
   ainda não tem.
4. **Nova tentativa sem duplicar:** bloqueie a porta 465 de saída dos
   containers (`iptables -I DOCKER-USER -p tcp --dport 465 -j REJECT --reject-with tcp-reset`)
   e rode `registrar 260`. As entregas ficam `pending` com `attempts = 1` e
   erro. Retire a regra (`iptables -D DOCKER-USER ...`). Na tentativa seguinte
   (1 min, depois 5 min), elas passam a `sent` com `attempts = 2`, e só um
   e-mail chega por destinatário.

### C — Push (VAPID)

1. **Gerar o par uma única vez**, com a biblioteca que já está na imagem:

   ```bash
   docker exec app-vitacare node -e "const k=require('web-push').generateVAPIDKeys();console.log('WEB_PUSH_PUBLIC_KEY='+k.publicKey+'\nWEB_PUSH_PRIVATE_KEY='+k.privateKey)"
   ```

   Copie as duas linhas para o cofre e limpe a tela (`clear`). Não rode de novo:
   um par novo invalida todas as inscrições.
2. **Na stack `vitacare`** (Portainer → Stacks → `vitacare` → Environment
   variables), configure `WEB_PUSH_ENABLED=true`, `WEB_PUSH_PUBLIC_KEY`,
   `WEB_PUSH_PRIVATE_KEY` e `WEB_PUSH_SUBJECT=mailto:<seu-email>` (precisa
   começar com `mailto:` ou `https:`). Depois, **Update the stack**.
3. **Conferir a subida:**

   ```bash
   docker logs --since 5m app-vitacare 2>&1 | grep -iE "validation|API em" | tail -3
   ```

4. **Conferir a rota** com o admin da organização de teste do B9. O master não
   tem `alerts:read` e recebe `403`. Cole o `read` sozinho:

   ```bash
   read -rsp 'Senha do admin de teste: ' P; echo
   ```

   ```bash
   A=https://api.vitacare.bizys.com.br/api/v1
   T=$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' -d "{\"organizationCode\":\"<codigo-da-org-de-teste>\",\"email\":\"<email-do-admin>\",\"password\":\"$P\"}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4); unset P
   curl -s $A/notifications/push/config -H "Authorization: Bearer $T"; echo
   curl -s -o /dev/null -w 'logout %{http_code}\n' -X POST $A/auth/logout -H "Authorization: Bearer $T"; unset T
   ```

   **Esperado:** `"enabled":true` e `"publicKey"` igual à chave pública do
   cofre.

O teste no Chrome e no Firefox (inscrição, push recebido e revogação) espera o
service worker do frontend e fica registrado como pendente do frontend.

### D — Monitores do Kuma

1. **O Kuma é alcançável pelos dois caminhos?**

   ```bash
   docker exec app-vitacare node -e "fetch('http://uptime-kuma:3001').then(r=>console.log('rede proxy:',r.status),e=>console.log('rede proxy falhou:',e.cause?.code))"
   curl -s -o /dev/null -w 'host 127.0.0.1:3001: %{http_code}\n' http://127.0.0.1:3001
   ```

   **Esperado:** `200` ou `302` nos dois. Se a rede `proxy` falhar, o Kuma não
   está nela. Se o host falhar, a porta 3001 não está publicada em
   `127.0.0.1`, e o push do cron do backup não chega.
2. **Criar os monitores** (Add New Monitor), todos com a notificação SMTP do B8:

   | Monitor | Tipo | Configuração |
   | --- | --- | --- |
   | `vitacare app` | HTTP(s) | URL `https://api.vitacare.bizys.com.br/health/ready`, intervalo 60 s, **Certificate Expiry Notification** marcado |
   | `vitacare frontend` | HTTP(s) | URL `https://vitacare.bizys.com.br/healthz`, intervalo 60 s, Certificate Expiry marcado |
   | `vitacare workers` | Push | intervalo 600 s |
   | `vitacare backup` | Push | intervalo 90000 s (25 h) |

   Em Settings → Notifications, o aviso de expiração do TLS deve incluir **14**
   dias.
3. **Heartbeat dos workers:** copie a Push URL do `vitacare workers` e troque o
   host por `http://uptime-kuma:3001`, assim:
   `http://uptime-kuma:3001/api/push/<token>?status=up&msg=OK&ping=`. Cadastre
   essa URL em `UPTIME_KUMA_PUSH_URL` na stack `vitacare` e faça **Update the
   stack**. Em até 5 min, o monitor fica verde.
4. **Guarde o token do `vitacare backup`** para o cron do E1.
5. **Teste controlado:** Portainer → `vitacare` → **Stop**, espere **3 min** e
   dê **Start**. Precisam chegar os e-mails de queda e de volta do
   `vitacare app`. O de `workers` só dispara depois de 10 min sem push: para
   testá-lo, deixe parado 12 min.

   **O que me mandar:** print da lista com os 4 monitores verdes e o horário dos
   e-mails recebidos.

### E1 — Backup diário

```bash
docker volume ls | grep vitacare        # vitacare_vitacare-storage
crontab -l                              # anote as linhas antigas de backup
/opt/vitacare/backup.sh
B=$(ls -d /root/backups/vitacare/vitacare-* | tail -1); echo $B
ls -la /root/backups/vitacare "$B"; cat "$B/SHA256SUMS"; (cd "$B" && sha256sum -c SHA256SUMS)
```

**Esperado:**

- pasta `drwx------ root`;
- arquivos `-rw------- root`;
- `db.dump: OK` e `storage.tgz: OK`.

**Retenção de 14 dias:** crie uma pasta falsa com data antiga, rode o backup de
novo e confira que ela sumiu.

```bash
mkdir /root/backups/vitacare/vitacare-teste-antigo && touch -d '15 days ago' /root/backups/vitacare/vitacare-teste-antigo
/opt/vitacare/backup.sh >/dev/null && ls /root/backups/vitacare
```

**Cron:** em `crontab -e`, apague as linhas antigas (dump diário e volume
semanal) e deixe só esta:

```cron
20 3 * * * KUMA_PUSH_URL=http://127.0.0.1:3001/api/push/<token-backup> /opt/vitacare/backup.sh >> /var/log/vitacare-backup.log 2>&1
```

Para provar o push sem esperar até as 03:20:

```bash
KUMA_PUSH_URL=http://127.0.0.1:3001/api/push/<token-backup> /opt/vitacare/backup.sh && crontab -l
```

O `vitacare backup` fica verde. Na manhã seguinte, confira
`tail /var/log/vitacare-backup.log`.

### E2 — Ensaio de restauração do backup de produção (RTO)

Restaura em banco e volume **novos** e mede do início até a API responder. A
produção não é tocada.

```bash
B=$(ls -d /root/backups/vitacare/vitacare-2* | tail -1); inicio=$(date +%s)
time /opt/vitacare/restore.sh "$B" --yes --target-db vitacare_restore --target-volume vitacare-restore
sobe vitacare-restore vitacare_restore vitacare-restore
ops /ops/smoke.mjs --base-url http://vitacare-restore:1050 --wait 180
echo "RTO medido: $(( $(date +%s) - inicio )) s"
for db in vitacare vitacare_restore; do docker exec postgresql psql -U mavila -d $db -Atc "select '$db', (select count(*) from organizations), (select count(*) from users), (select count(*) from patients)"; done
```

**Esperado:**

- `7/7 verificacoes ok (modo read)`;
- tempo bem abaixo de 4 h;
- contagens iguais nos dois bancos (organizações, usuários, pacientes).

Limpeza, conferindo antes o que vai sair:

```bash
docker rm -f vitacare-restore && docker volume rm vitacare-restore
docker exec postgresql psql -U mavila -d postgres -c 'DROP DATABASE vitacare_restore WITH (FORCE)'
docker exec "$RH" redis-cli -a "$RP" --no-auth-warning --scan --pattern 'vitacare-restore*' | wc -l
docker exec "$RH" sh -c "redis-cli -a '$RP' --no-auth-warning --scan --pattern 'vitacare-restore*' | xargs -r redis-cli -a '$RP' --no-auth-warning del"
```

O `smoke verify` precisa dos dados de um `full`, que só roda em homologação. Ele
fica no F, junto com a carga.

**Cópia externa:** adiada (decisão de Mateus em 2026-11-16). Fica desmarcada no
checklist, como adiada.

### F — Homologação temporária: jornada, restauração com `verify` e carga

Uma API temporária com banco e volume próprios, nos mesmos limites da produção
(512 MiB, 1 CPU). Ela usa o Postgres e o Redis compartilhados, e a VPS tem
2 vCPU para a API de teste, o gerador de carga, o Postgres e a produção. Rode
num horário calmo, sabendo que o resultado tende a ser **pessimista**.

1. **Subir e criar o master:**

   ```bash
   docker exec postgresql psql -U mavila -d postgres -c 'CREATE DATABASE vitacare_hml OWNER vitacare'
   docker volume create vitacare-hml-storage
   sobe vitacare-hml vitacare_hml vitacare-hml-storage
   ops /ops/smoke.mjs --base-url http://vitacare-hml:1050 --wait 180
   SEED=$(docker exec vitacare-hml node dist/cli/seed-platform.js --organization-code plataforma-hml --trade-name VitaCare --admin-name "Master Homologacao" --admin-email master@plataforma-hml.example.test --admin-cpf 11144477735)
   export SMOKE_PLATFORM_CODE=plataforma-hml SMOKE_MASTER_EMAIL=master@plataforma-hml.example.test
   export SMOKE_MASTER_PASSWORD=$(printf '%s\n' "$SEED" | sed -n 's/^senha provisoria (exibida uma unica vez): //p'); unset SEED
   export SMOKE_ADMIN_PASSWORD='senha definitiva da homologacao'
   echo "master: ${SMOKE_MASTER_PASSWORD:+ok}"
   ```

2. **Jornada completa:**

   ```bash
   ops /ops/smoke.mjs --base-url http://vitacare-hml:1050 --mode full --allow-writes --state-file /work/smoke-state.json
   ```

3. **Backup, restauração e `verify`.** O `KUMA_PUSH_URL` fica vazio, para não
   avisar o monitor real:

   ```bash
   KUMA_PUSH_URL= DB_NAME=vitacare_hml STORAGE_VOLUME=vitacare-hml-storage BACKUP_DIR=/root/vitacare-teste/backups /opt/vitacare/backup.sh
   inicio=$(date +%s)
   time /opt/vitacare/restore.sh $(ls -d /root/vitacare-teste/backups/vitacare-*) --yes --target-db vitacare_hml_restore --target-volume vitacare-hml-restore
   sobe vitacare-hml-restore vitacare_hml_restore vitacare-hml-restore
   ops /ops/smoke.mjs --base-url http://vitacare-hml-restore:1050 --wait 180 >/dev/null
   ops /ops/smoke.mjs --base-url http://vitacare-hml-restore:1050 --mode verify --state-file /work/smoke-state.json
   echo "restauracao ate verify: $(( $(date +%s) - inicio )) s"
   docker rm -f vitacare-hml-restore
   ```

4. **Carga no cenário das metas (sem pausa).** A preparação cria 1.000
   pacientes e 5.000 registros pela API e leva alguns minutos:

   ```bash
   ops /ops/load.mjs --base-url http://vitacare-hml:1050 --allow-writes --report /work/load-sem-pausa.json
   ```

   Em outra sessão SSH, enquanto roda: `docker stats --no-stream vitacare-hml`.

5. **Carga com pausa de 1 s** (mais perto do uso real):

   ```bash
   ops /ops/load.mjs --base-url http://vitacare-hml:1050 --allow-writes --think-ms 1000 --report /work/load-com-pausa.json
   ```

   **O que me mandar:** o resumo final de cada execução (p95 de leitura,
   escrita e exportação, 5xx, 429 e req/s). Eu comparo com o RNF008: leitura
   ≤ 500 ms, escrita ≤ 1 s, PDF/CSV ≤ 5 s e 0 5xx.

6. **Limpeza**, contando antes as chaves do Redis que vão sair:

   ```bash
   docker rm -f vitacare-hml; docker volume rm vitacare-hml-storage vitacare-hml-restore
   for db in vitacare_hml vitacare_hml_restore; do docker exec postgresql psql -U mavila -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"; done
   docker exec "$RH" redis-cli -a "$RP" --no-auth-warning --scan --pattern 'vitacare-hml*' | wc -l
   docker exec "$RH" sh -c "redis-cli -a '$RP' --no-auth-warning --scan --pattern 'vitacare-hml*' | xargs -r redis-cli -a '$RP' --no-auth-warning del"
   cp /root/vitacare-teste/load-*.json /root/ 2>/dev/null; rm -rf /root/vitacare-teste
   unset DBP RP SMOKE_MASTER_PASSWORD SMOKE_ADMIN_PASSWORD
   ```

   Os padrões `vitacare-hml*` e `vitacare-restore*` não pegam as chaves da
   produção (`vitacare:` e `vitacare`).

### G — Conferência final

1. **Smoke de leitura pelo domínio, com a versão da `main`:**

   ```bash
   ops /ops/smoke.mjs --base-url https://api.vitacare.bizys.com.br --expect-version 6fb1bcf113558015adc2c4d44a35a3f41addcc0e
   ```

   **Esperado:** `7/7 verificacoes ok (modo read)`. Se uma `main` mais nova
   estiver no ar, use o commit dela.
2. **Loki:** no Grafana → Explore → Loki, acesse a API pelo navegador ou
   celular fora da rede da Unimed e rode:

   ```logql
   {stack="vitacare"} |= "request completed" | json | line_format "{{.level_name}} {{.req_remoteAddress}} {{.req_method}} {{.req_url}} {{.res_statusCode}}"
   ```

   **Esperado:** `INFO` e o IP público do seu acesso, e não um `172.x`.
3. **Checklist "Antes de dados reais":** com as saídas de C a G, eu marco item a
   item no `deploy-vps.md`, no roteiro e no vault.

## Fora desta tarefa

- **Validação do frontend nos navegadores** (RF019, RNF001–003): repositório do
  frontend, agora possível com HTTPS.
- **Integração do frontend com a API real:** ainda usa dados simulados.

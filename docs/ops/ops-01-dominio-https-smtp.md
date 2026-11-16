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

## Estado

| # | Item | Estado | Evidência |
| --- | --- | --- | --- |
| A1 | DNS `vitacare` e `api.vitacare` (A) | ✅ concluído | `dig` no `d.sec.dns.br`, `f.sec.dns.br`, `8.8.8.8`, `1.1.1.1` e `9.9.9.9` com o IP da VPS; sem AAAA |
| A2 | Containers na rede `proxy` | ✅ indireto | A4 respondeu pelos dois hosts; `uptime-kuma` na rede não conferido |
| A3 | Proxy hosts no NPM | ✅ concluído | criados por Mateus, com o Advanced da API |
| A4 | Roteamento antes do certificado | ✅ concluído | `/health/ready` ok (postgres e redis `up`) e frontend `/healthz` 200 pelo cabeçalho `Host` |
| A5 | Certificado Let's Encrypt | ✅ concluído | emissor `YE1`, válido até 2027-02-14; `301` http → https; `HTTP/2 200`; HSTS presente |
| A5b | HSTS só uma vez na API | ⏳ pendente | dois cabeçalhos (Helmet + NPM); desligar o HSTS do NPM no host da API |
| A6 | Stacks sem `APP_BIND`, CORS e `API_URL` | ✅ concluído | preflight `204` com `access-control-allow-origin: https://vitacare.bizys.com.br`; `config.js` com `apiUrl` em https; `1050`/`1040` recusadas por IP |
| A7 | `APP_URL` no GitHub e job `deploy` verde | ⏳ pendente | — |
| A8 | `data.version` pelo domínio | ✅ concluído | `402f2e733586592b968e9c827c6832d5285d3a96` (main em 2026-11-16) |
| A9 | Regras 1050/1040 fora do firewall | ✅ feito por Mateus | portas já recusadas por IP (A6) |
| A10 | IP real do cliente atrás do NPM | ⏳ pendente | de dentro da VPS a auditoria gravou o IP público da VPS (não `172.x`): indício. Falta o teste de rede externa |
| — | Seed da plataforma e master | ✅ concluído | `organization.platform_seeded` em 2026-11-16 20:30 UTC; primeiro acesso, troca de senha e aceite do termo v1 pelo domínio |
| — | Log HTTP com o IP do cliente | ✅ no código (esta branch) | `req.remoteAddress` = `req.ip`; testes em `tests/common/logRedaction.spec.ts`; vale após o deploy |
| B1 | Business Starter contratado, domínio `vitacare.bizys.com.br` | ✅ concluído | verificado pela Hostinger em 2026-11-16, depois de um TXT de teste igual na raiz (já removido; o do subdomínio fica) |
| B2 | Caixa `no-reply@vitacare.bizys.com.br` | ✅ criada por Mateus | senha só no cofre |
| B3 | MX, SPF, DKIM e DMARC do subdomínio | ✅ publicado | em 2026-11-16, `d.sec.dns.br` e `f.sec.dns.br`: MX `mx1`/`mx2.hostinger.com` (5/10); TXT com a verificação e `v=spf1 include:_spf.mail.hostinger.com ~all`; CNAME `hostingermail-a/b/c._domainkey.vitacare` → `hostingermail-*.dkim.mail.hostinger.com` (o Google resolve até `v=DKIM1`); `_dmarc.vitacare` = `v=DMARC1; p=none`, como a Hostinger sugeriu, sem `rua`; raiz inalterada (MX `.com.br` e SPF próprio) |
| B4 | hPanel verde e mail-tester | ✅ concluído | mail-tester **9,5/10** com envio pelo webmail em 2026-11-16 |
| B5 | A VPS alcança o SMTP | ✅ concluído | `SMTP ok` no `verify()` de dentro do `app-vitacare` (465/TLS), 2026-11-16. A primeira senha vazou num `read` mal colado e foi trocada antes do teste |
| B6 | Variáveis SMTP na stack | ✅ concluído | 2026-11-16: `printenv` no `app-vitacare` com `SMTP_ENABLED=true`, `smtp.hostinger.com:465` TLS, remetente e URLs em `https://vitacare.bizys.com.br`, senha presente; API subiu sem erro de validação e `/health/ready` ok |
| B7 | Recuperação de senha real | ✅ concluído | 2026-11-16 20:20: e-mail "Redefinição de senha VitaCare" de `no-reply@vitacare.bizys.com.br` entregue em 3 s na caixa principal do Gmail, com o link `https://vitacare.bizys.com.br/redefinir-senha?token=...` (15 min); "Mostrar original": SPF `PASS`, DKIM `PASS` (`vitacare.bizys.com.br`), DMARC `PASS` |
| B8 | SMTP no Kuma | ⏳ pendente | — |
| C | Push (VAPID) | ⏳ pendente | teste no navegador depende do service worker do frontend |
| D | Monitores do Kuma | ⏳ pendente | — |
| E | Backup, cron, restauração | ⏳ pendente | cópia externa adiada |
| F | Carga no hardware real | ⏳ pendente | — |
| G | Conferência final | ⏳ pendente | — |

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
9. **Depois do B7**, roteiro a detalhar com o agente:
   - e-mail de alerta com `notification_deliveries` saindo de `skipped` para
     `sent`;
   - convite (com o frontend ainda simulado, conferir só o envio);
   - SMTP inalcançável com nova tentativa sem duplicar.

   Esses testes precisam de uma organização de teste criada pelo master.

### C — Push (VAPID)

1. Gere o par **uma única vez**, numa máquina com Node (`npx web-push
   generate-vapid-keys`), e guarde as duas chaves no cofre.
2. Na stack: `WEB_PUSH_ENABLED=true`, as chaves e
   `WEB_PUSH_SUBJECT=mailto:<contato>`. Depois, **Update**.
3. Confira o `GET /api/v1/notifications/push/config` com uma sessão: `enabled:
   true` e a chave pública. O teste no Chrome e no Firefox espera o service
   worker do frontend.

Trocar o par depois invalida todas as inscrições.

### D — Monitores

- **Monitores:** seguir a tabela do [passo 11](../deploy-vps.md#11-monitoramento-e-backup).
- **Teste controlado:** pare a stack `vitacare` por cerca de 2 min e confira que
  o e-mail do Kuma chega. Ao religar, o aviso de volta também tem de chegar.

### E — Backup e restauração

- **Backup:** cópia dos scripts para `/opt/vitacare`, primeira execução à mão e
  cron das 03:20 com o push. Conferir `SHA256SUMS`, as permissões só do root e a
  retenção de 14 dias ([passo 11](../deploy-vps.md#11-monitoramento-e-backup)).
- **Ensaio de restauração:** em banco e volume novos, medindo com `time`
  ([Recuperação](../deploy-vps.md#recuperação-rto-4-h)). Comparar com o RTO de 4 h
  e conferir com `smoke.mjs` no modo `verify`.
- **Cópia externa:** adiada (decisão de Mateus em 2026-11-16).

### F — Carga

`scripts/ops/load.mjs` roda **numa stack temporária de homologação** (banco e
volume próprios, 512 MiB e 1 CPU), **nunca** contra a produção. O que registrar:
p95 de leitura, escrita e exportação, e o número de 5xx, comparados com as metas
de [Metas](../deploy-vps.md#metas-decididas-por-mateus-em-2026-11-10).

### G — Conferência final

- `node scripts/ops/smoke.mjs --base-url https://api.vitacare.bizys.com.br`
  (modo `read`), rodado de fora da rede da Unimed.
- Job `deploy` verde com o `APP_URL` novo.
- Loki com `level_name` e `req.remoteAddress` igual ao IP do cliente, depois do
  deploy desta branch.
- Checklist "Antes de dados reais" marcado item a item, só com o que foi
  conferido.

## Fora desta tarefa

- **Validação do frontend nos navegadores** (RF019, RNF001–003): repositório do
  frontend, agora possível com HTTPS.
- **Integração do frontend com a API real:** ainda usa dados simulados.

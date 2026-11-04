# BE-07 — Catálogo, vigência e solicitação de mudança de plano (design)

Data: 2026-11-03. Card: BE-07 (Plans). Requisitos: RF018 (desejável); UC04;
R07 só na parte de vencimento que bloqueia cadastro. Pendências: P05, P06, P21.
Fontes lidas: `vitacare-organizacoes-e-planos` e alterações,
`vitacare-dados-planos-uso` e alterações, `vitacare-uc04` e alterações,
`vitacare-rf018`, `vitacare-tela-46-configuracoes`, `vitacare-pendencias-negocio`
e alterações, `vitacare-pendencias-dados` (P21), `vitacare-perfis-e-permissoes-alteracoes`,
notas de tarefa BE-06/BE-07/BE-08 e o código de
`src/modules/{Plan,Organization,User,Access,Audit}`.

**Origem das decisões:** Mateus pediu em 2026-11-03 que o agente propusesse e
implementasse sem perguntas, seguindo o vault. Todas as decisões de produto
abaixo são **do agente, pendentes de confirmação de Mateus**, salvo quando
citam o TCC ou uma decisão anterior.

## 1. Intenção

O administrador da organização consulta o plano vigente, seus limites e
recursos, o uso atual e a validade, e pede a troca de plano. O pedido fica
registrado para análise e não muda nada até o master da plataforma aprová-lo.
O master atribui, renova e personaliza limites, e decide as solicitações. Toda
mudança deixa trilha (vigências encadeadas + auditoria). Não há pagamento,
cobrança nem gateway.

## 2. Decisões

1. **Catálogo vigente = Basic e Enterprise do TCC (seção 3.3).** Basic: 10
   usuários, 200 pacientes. Enterprise: 50 usuários, 1.000 pacientes, com
   expansão contratável (vira limite personalizado). `monthly_price` fica
   `NULL`: os preços do TCC são acadêmicos. **Pro - Clínica (Figura 46) não
   entra no catálogo**: é exemplo de protótipo, com limites de armazenamento e
   registros/mês que não existem no modelo. A divergência fica registrada, não
   conciliada.
2. **Planos existentes viram legado.** Linhas de `usage_plans` anteriores à
   migration recebem `code = 'legacy-<8 primeiros hex do id>'` e continuam
   valendo para as organizações ligadas a elas; o master pode reatribuir.
3. **Recursos por plano** (`features text[]`, catálogo fechado por CHECK),
   transcritos do TCC: `patient_management`, `health_records`,
   `patient_history`, `automatic_alerts`, `responsive_access` (Basic) e, no
   Enterprise, mais `extended_registration`, `management_reports`,
   `operational_dashboard`, `custom_deployment`. O BE-07 **expõe** os recursos;
   a checagem fica com o módulo dono (relatórios gerenciais BE-21, painel BE-22).
   O significado de "cadastro ampliado" segue aberto.
4. **Vigência por termos.** Nova tabela `organization_plan_terms`: um termo
   corrente por organização (`superseded_at IS NULL`), com início, fim
   opcional (`NULL` = sem vencimento), limites personalizados opcionais e
   origem (`initial`, `assignment`, `change_request`, `migration`). Trocar,
   renovar ou personalizar encerra o termo corrente e abre outro: o histórico é
   a própria cadeia. `organizations.usage_plan_id` continua apontando para o
   plano corrente (contrato e FK preservados), atualizado na mesma transação.
5. **Renovação é administrativa.** Não há renovação automática; o master
   renova atribuindo de novo com outro `endsAt`. A atribuição é substituição
   completa: limite personalizado omitido volta ao do catálogo.
6. **Política de vencimento.** Termo vencido (`ends_at <= now()`) mantém todo
   acesso de leitura e os registros clínicos; bloqueia **apenas crescimento**:
   cadastro e reativação de usuário (`409 USER_PLAN_EXPIRED`) e, no BE-08, de
   paciente. Restringir registro de acompanhamento de pacientes já cadastrados
   seria risco ao cuidado. A notificação ao administrador é o estado `expired`
   na consulta do plano; a entrega ativa (e-mail/push) fica com o BE-17.
7. **Limite efetivo** = limite personalizado do termo corrente, senão o do
   plano. O BE-06 passa a usar o limite efetivo. Limite abaixo do uso atual é
   aceito: só bloqueia novos cadastros.
8. **Solicitação de mudança.** Tabela `plan_change_requests` com estados
   `pending → approved | rejected | cancelled`. Uma única `pending` por
   organização (índice parcial; repetida = `409`). O plano pedido deve estar
   ativo e ser diferente do corrente, salvo quando o termo corrente está
   vencido (pedido de renovação). O admin cancela a própria pendente; o master
   aprova (aplica o plano, podendo fixar `endsAt` e limites) ou recusa com
   justificativa obrigatória. A atribuição direta pelo master não mexe na
   solicitação pendente.
9. **Permissões sem migration nova.** Admin: `plan:read`,
   `plan_change_requests:create` (já existentes). Master: reusa
   `platform_organizations:read` (consultar plano de qualquer organização,
   listar todas as solicitações) e `platform_organizations:update` (atribuir,
   aprovar, recusar). Catálogo e listagem de solicitações aceitam qualquer uma
   das duas leituras: novo decorator `@RequireAnyPermission`.
10. **Auditoria.** `plan.assigned`, `plan_change_request.created`,
    `.cancelled`, `.approved`, `.rejected`. Ação do master vai para a
    organização alvo como evento de sistema e para a da plataforma com autoria,
    como no módulo de organizações.

## 3. Rotas (prefixo `/api/v1`)

| Método | Caminho | Quem | Efeito |
| --- | --- | --- | --- |
| GET | `/plans` | admin ou master | catálogo ativo |
| GET | `/organizations/me/plan` | admin | plano, termo, limites, uso, pendente |
| GET | `/organizations/{organizationId}/plan` | master | idem para qualquer tenant |
| PUT | `/organizations/{organizationId}/plan` | master | atribui/renova/personaliza |
| POST | `/plan-change-requests` | admin | registra pedido |
| GET | `/plan-change-requests` | admin (própria) ou master (todas) | lista paginada |
| POST | `/plan-change-requests/{requestId}/cancel` | admin | cancela pendente |
| POST | `/plan-change-requests/{requestId}/approve` | master | aprova e aplica |
| POST | `/plan-change-requests/{requestId}/reject` | master | recusa |

Uso de pacientes sai `null` até existir a tabela (BE-09/BE-08).

## 4. Não objetivos

Pagamento, cobrança, fatura, preço atual; CRUD do catálogo por API (catálogo
muda por migration); checagem de recursos nos módulos futuros; limite de
pacientes (BE-08); notificação ativa de vencimento (BE-17); armazenamento e
registros/mês da Figura 46.

**Anti-objetivos:** solicitação que altere limite antes da aprovação; duas
pendentes na mesma organização; vencimento que impeça ler ou registrar o
cuidado de paciente já cadastrado; admin enxergando ou cancelando pedido de
outro tenant.

## 5. Testes

PostgreSQL descartável: plano vigente; termo vencido bloqueia cadastro e
reativação de usuário e aparece `expired`; limite personalizado vale no
cadastro; solicitação repetida (sequencial e simultânea) → uma aceita;
mesmo plano recusado e aceito quando vencido; aprovação aplica plano e
encerra o termo anterior; recusa e cancelamento preservam o plano; duas
organizações (404 cruzado); profissional 403; master não acessa rotas de admin
e vice-versa; migration `up/down`.

## 6. Revisão de 2026-11-04 — regras do Quadro 2

Mateus decidiu que o catálogo segue as regras de cada plano do Quadro 2 do
TCC (seção 3.3, p. 30). Isso substitui as decisões do agente sobre catálogo e
preço; vigência, vencimento e fluxo de decisão seguem como acima, pendentes de
confirmação.

- Basic: até 10 usuários e 200 pacientes ativos, limites **fixos**, R$ 499,00
  por mês. Enterprise: até 50 usuários e 1.000 pacientes ativos, **expansível**
  conforme contratação, R$ 1.990,00 por mês mais adicional conforme volume.
  `monthly_price` passa a ter esses valores; o adicional não é modelado e não
  há cobrança.
- Nova coluna `usage_plans.expandable`. Limite personalizado no termo só vale
  para plano expansível e só igual ou acima do catálogo
  (`PLAN_LIMIT_NOT_EXPANDABLE`, `PLAN_LIMIT_BELOW_CATALOG`, ambos 422), na
  atribuição e na aprovação. Recusa na aprovação mantém a solicitação
  `pending`.
- Descrições = linha "Descrição" do Quadro 2. "Cadastro ampliado" = os próprios
  limites do Enterprise; "implantação e personalização" é serviço contratado,
  sem checagem na API.
- Catálogo restrito a Basic e Enterprise: planos `legacy-*` ficam inativos,
  sem tirar ninguém do plano em que já está.
- Migration `1790600000000-ApplyPlanCatalogRules`, reversível.

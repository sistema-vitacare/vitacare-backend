---
title: Manual de integração da API VitaCare
status: atual
updated: 2026-11-12
---

# Manual de integração da API VitaCare

Este diretório descreve **as rotas que existem no backend**, em Markdown legível por integradores e por agentes de IA. O [padrão de endpoint](padrao-endpoint.md) exige uma nota por método e caminho; nenhuma rota planejada deve aparecer como disponível. O contrato OpenAPI gerado pela aplicação complementa estas notas e deve concordar com elas.

## Endereço e convenções

Nos exemplos, `https://api.example.com` representa a origem do ambiente onde a API for publicada; não é um servidor VitaCare configurado. O prefixo (`API_PREFIX`, padrão `api`) e a versão URI (`API_VERSION`, padrão `1`) são configuráveis. Assim, as rotas de negócio atuais usam `/api/v1`; as rotas `/health/*` ficam fora do prefixo e da versão. O servidor usa HTTPS na arquitetura prevista, mas o ambiente local pode usar HTTP.

O corpo das rotas de negócio é JSON quando aplicável. Autenticação usa Bearer opaco e stateful: o token bruto só sai no login e seu hash é persistido; sessão revogada, expirada, inativa ou com senha alterada não continua válida. Não envie dados pessoais reais em exemplos de documentação.

| Método e caminho padrão | Finalidade | Nota |
| --- | --- | --- |
| `GET /api/v1` | Identificação do serviço | [identificacao-servico.md](endpoints/identificacao-servico.md) |
| `GET /health/live` | Processo HTTP disponível | [health-live.md](endpoints/health-live.md) |
| `GET /health/ready` | PostgreSQL e Redis disponíveis | [health-ready.md](endpoints/health-ready.md) |
| `GET /api/docs` | Interface Swagger, se habilitada | [swagger-ui.md](endpoints/swagger-ui.md) |
| `GET /api/docs-json` | Documento OpenAPI, se habilitado | [openapi-json.md](endpoints/openapi-json.md) |
| `POST /api/v1/auth/login` | Inicia sessão | [auth-login.md](endpoints/auth-login.md) |
| `POST /api/v1/auth/password/first-access` | Conclui troca obrigatória | [auth-primeiro-acesso.md](endpoints/auth-primeiro-acesso.md) |
| `POST /api/v1/auth/logout` | Revoga a sessão atual | [auth-logout.md](endpoints/auth-logout.md) |
| `PUT /api/v1/auth/password` | Troca a própria senha | [auth-alterar-senha.md](endpoints/auth-alterar-senha.md) |
| `POST /api/v1/auth/password-recovery/request` | Solicita recuperação | [auth-solicitar-recuperacao.md](endpoints/auth-solicitar-recuperacao.md) |
| `POST /api/v1/auth/password-recovery/reset` | Redefine com token | [auth-redefinir-senha.md](endpoints/auth-redefinir-senha.md) |
| `POST /api/v1/auth/users/:userId/temporary-password` | Redefinição administrativa | [auth-redefinir-senha-usuario.md](endpoints/auth-redefinir-senha-usuario.md) |
| `POST /api/v1/auth/invitations/inspect` | Lê o convite por link sem consumi-lo (pública) | [auth-convite-consultar.md](endpoints/auth-convite-consultar.md) |
| `POST /api/v1/auth/invitations/accept` | Aceita o convite: o convidado cadastra a senha (pública) | [auth-convite-aceitar.md](endpoints/auth-convite-aceitar.md) |
| `GET /api/v1/profile` | Consulta o próprio cadastro (sessão com CPF completo) | [profile-consultar.md](endpoints/profile-consultar.md) |
| `PATCH /api/v1/profile` | Edita nome, telefone e e-mail do próprio cadastro | [profile-atualizar.md](endpoints/profile-atualizar.md) |
| `PUT /api/v1/profile/password` | Troca a própria senha (equivale a `PUT /auth/password`) | [profile-alterar-senha.md](endpoints/profile-alterar-senha.md) |
| `GET /api/v1/organizations/me` | Consulta a organização da sessão | [organizations-consultar-propria.md](endpoints/organizations-consultar-propria.md) |
| `PATCH /api/v1/organizations/me` | Atualiza a organização da sessão | [organizations-atualizar-propria.md](endpoints/organizations-atualizar-propria.md) |
| `POST /api/v1/organizations` | Cadastra organização e primeiro administrador (plataforma) | [organizations-criar.md](endpoints/organizations-criar.md) |
| `GET /api/v1/organizations` | Lista organizações clientes (plataforma) | [organizations-listar.md](endpoints/organizations-listar.md) |
| `GET /api/v1/organizations/:organizationId` | Consulta qualquer organização (plataforma) | [organizations-consultar.md](endpoints/organizations-consultar.md) |
| `PATCH /api/v1/organizations/:organizationId` | Atualiza qualquer organização (plataforma) | [organizations-atualizar.md](endpoints/organizations-atualizar.md) |
| `POST /api/v1/organizations/:organizationId/deactivate` | Inativa organização (plataforma) | [organizations-inativar.md](endpoints/organizations-inativar.md) |
| `POST /api/v1/organizations/:organizationId/reactivate` | Reativa organização (plataforma) | [organizations-reativar.md](endpoints/organizations-reativar.md) |
| `GET /api/v1/access-profiles` | Lista os perfis de acesso da organização e suas permissões | [access-profiles-listar.md](endpoints/access-profiles-listar.md) |
| `POST /api/v1/users` | Cadastra usuário pendente e envia o convite (link por e-mail ou senha provisória) | [users-criar.md](endpoints/users-criar.md) |
| `GET /api/v1/users` | Lista os usuários da organização | [users-listar.md](endpoints/users-listar.md) |
| `GET /api/v1/users/:userId` | Consulta um usuário da organização | [users-consultar.md](endpoints/users-consultar.md) |
| `PATCH /api/v1/users/:userId` | Edita nome, e-mail, CPF ou telefone | [users-atualizar.md](endpoints/users-atualizar.md) |
| `POST /api/v1/users/:userId/deactivate` | Inativa o usuário e revoga o acesso | [users-inativar.md](endpoints/users-inativar.md) |
| `POST /api/v1/users/:userId/reactivate` | Reativa o usuário, respeitando o limite do plano | [users-reativar.md](endpoints/users-reativar.md) |
| `POST /api/v1/users/:userId/invitation` | Reemite o convite de usuário pendente, no mesmo canal ou trocando-o | [users-reemitir-convite.md](endpoints/users-reemitir-convite.md) |
| `PATCH /api/v1/users/:userId/profile` | Troca o perfil de acesso de um usuário da organização | [users-alterar-perfil.md](endpoints/users-alterar-perfil.md) |
| `POST /api/v1/patients` | Cadastra paciente com o profissional responsável | [patients-criar.md](endpoints/patients-criar.md) |
| `GET /api/v1/patients` | Lista os pacientes ao alcance da sessão (ativos por padrão) | [patients-listar.md](endpoints/patients-listar.md) |
| `GET /api/v1/patients/:patientId` | Consulta um paciente, ativo ou inativo | [patients-consultar.md](endpoints/patients-consultar.md) |
| `GET /api/v1/patients/:patientId/overview` | Visão consolidada: contadores, últimas medições, medicamentos ativos e alertas recentes | [patients-visao-consolidada.md](endpoints/patients-visao-consolidada.md) |
| `GET /api/v1/patients/:patientId/evolution` | Séries de evolução por parâmetro com média, variação e tendência no período | [patients-evolucao.md](endpoints/patients-evolucao.md) |
| `GET /api/v1/patients/:patientId/report` | Relatório consolidado do período (identificação, registros, séries com indicadores, medicamentos ativos) | [patients-relatorio.md](endpoints/patients-relatorio.md) |
| `GET /api/v1/patients/:patientId/report/pdf` | O mesmo relatório em PDF (binário, fora do envelope), gerado na hora e auditado | [patients-relatorio-pdf.md](endpoints/patients-relatorio-pdf.md) |
| `PATCH /api/v1/patients/:patientId` | Edita dados ou troca o responsável de paciente ativo | [patients-atualizar.md](endpoints/patients-atualizar.md) |
| `POST /api/v1/patients/:patientId/deactivate` | Inativa o paciente, preservando vínculo e histórico | [patients-inativar.md](endpoints/patients-inativar.md) |
| `POST /api/v1/patients/:patientId/reactivate` | Reativa o paciente, respeitando o limite do plano | [patients-reativar.md](endpoints/patients-reativar.md) |
| `POST /api/v1/patient-links` | Vincula cuidador ou familiar a um paciente ativo | [patient-links-criar.md](endpoints/patient-links-criar.md) |
| `GET /api/v1/patient-links` | Lista vínculos (por paciente, usuário, papel, status) | [patient-links-listar.md](endpoints/patient-links-listar.md) |
| `GET /api/v1/patient-links/eligible-users` | Usuários elegíveis a responsável, cuidador ou familiar | [patient-links-usuarios-elegiveis.md](endpoints/patient-links-usuarios-elegiveis.md) |
| `GET /api/v1/patient-links/:linkId` | Consulta um vínculo, vigente ou revogado | [patient-links-consultar.md](endpoints/patient-links-consultar.md) |
| `PATCH /api/v1/patient-links/:linkId` | Altera tipo e observação de vínculo de cuidado | [patient-links-atualizar.md](endpoints/patient-links-atualizar.md) |
| `POST /api/v1/patient-links/:linkId/revoke` | Revoga vínculo de cuidado; o acesso cai na requisição seguinte | [patient-links-revogar.md](endpoints/patient-links-revogar.md) |
| `POST /api/v1/forms` | Cria formulário de acompanhamento em rascunho, com campos, público e frequência | [forms-criar.md](endpoints/forms-criar.md) |
| `GET /api/v1/forms` | Lista formulários ao alcance da sessão (status, busca, paciente) | [forms-listar.md](endpoints/forms-listar.md) |
| `GET /api/v1/forms/:formId` | Consulta formulário com versão vigente e, para quem configura, o rascunho | [forms-consultar.md](endpoints/forms-consultar.md) |
| `PATCH /api/v1/forms/:formId` | Edita nome, descrição, tipo, frequência e público, sem nova versão | [forms-atualizar.md](endpoints/forms-atualizar.md) |
| `PUT /api/v1/forms/:formId/draft` | Cria ou substitui o rascunho da próxima versão | [forms-salvar-rascunho.md](endpoints/forms-salvar-rascunho.md) |
| `POST /api/v1/forms/:formId/draft/discard` | Descarta o rascunho de formulário publicado | [forms-descartar-rascunho.md](endpoints/forms-descartar-rascunho.md) |
| `POST /api/v1/forms/:formId/publish` | Publica o rascunho como nova versão vigente (confirmação sobre versão vigente) | [forms-publicar.md](endpoints/forms-publicar.md) |
| `POST /api/v1/forms/:formId/deactivate` | Desativa o formulário, preservando versões e histórico | [forms-desativar.md](endpoints/forms-desativar.md) |
| `POST /api/v1/forms/:formId/reactivate` | Reativa o formulário (volta a ativo ou a rascunho) | [forms-reativar.md](endpoints/forms-reativar.md) |
| `POST /api/v1/follow-ups` | Registra acompanhamento: registro, resposta e itens numa transação (cuidador vinculado) | [follow-ups-registrar.md](endpoints/follow-ups-registrar.md) |
| `GET /api/v1/follow-ups` | Histórico de um paciente ao alcance, da visita mais recente para a mais antiga, com filtros de período, parâmetro, seção, responsável, formulário e status | [follow-ups-listar.md](endpoints/follow-ups-listar.md) |
| `GET /api/v1/follow-ups/:followUpId` | Consulta um registro com as respostas e os campos da versão respondida | [follow-ups-consultar.md](endpoints/follow-ups-consultar.md) |
| `POST /api/v1/follow-ups/:followUpId/annul` | Anula um registro com motivo, preservando-o no histórico | [follow-ups-anular.md](endpoints/follow-ups-anular.md) |
| `POST /api/v1/follow-ups/:followUpId/attachments` | Anexa um arquivo (JPEG, PNG, WEBP ou PDF, até 10 MB) ao registro; só o cuidador autor, até 5 por registro | [follow-up-attachments-enviar.md](endpoints/follow-up-attachments-enviar.md) |
| `GET /api/v1/follow-ups/:followUpId/attachments` | Lista os anexos ativos de um registro ao alcance | [follow-up-attachments-listar.md](endpoints/follow-up-attachments-listar.md) |
| `GET /api/v1/follow-ups/:followUpId/attachments/:attachmentId/content` | Baixa o arquivo (binário, fora do envelope), reautorizado a cada chamada | [follow-up-attachments-baixar.md](endpoints/follow-up-attachments-baixar.md) |
| `DELETE /api/v1/follow-ups/:followUpId/attachments/:attachmentId` | Remove o anexo e apaga o arquivo (`204`) | [follow-up-attachments-remover.md](endpoints/follow-up-attachments-remover.md) |
| `POST /api/v1/alert-rules` | Cria regra de alerta (limiar `gt`/`gte`/`lt`/`lte`) sobre campo numérico do formulário, geral ou de um paciente | [alert-rules-criar.md](endpoints/alert-rules-criar.md) |
| `GET /api/v1/alert-rules` | Lista as regras de alerta da organização (formulário, paciente, status) | [alert-rules-listar.md](endpoints/alert-rules-listar.md) |
| `GET /api/v1/alert-rules/:ruleId` | Consulta uma regra de alerta | [alert-rules-consultar.md](endpoints/alert-rules-consultar.md) |
| `PATCH /api/v1/alert-rules/:ruleId` | Edita nome, descrição, operador, referência ou severidade; vale para os registros seguintes | [alert-rules-atualizar.md](endpoints/alert-rules-atualizar.md) |
| `POST /api/v1/alert-rules/:ruleId/deactivate` | Inativa a regra, preservando os alertas gerados | [alert-rules-inativar.md](endpoints/alert-rules-inativar.md) |
| `POST /api/v1/alert-rules/:ruleId/reactivate` | Reativa a regra para os registros enviados a partir de agora | [alert-rules-reativar.md](endpoints/alert-rules-reativar.md) |
| `GET /api/v1/alerts` | Lista os alertas de um paciente ao alcance (valor registrado, ausência de registro e lembrete de medicamento), mais recentes primeiro | [alerts-listar.md](endpoints/alerts-listar.md) |
| `GET /api/v1/alerts/:alertId` | Consulta um alerta de qualquer origem, com o bloco da origem (regra e registro, ausência ou lembrete) | [alerts-consultar.md](endpoints/alerts-consultar.md) |
| `POST /api/v1/alerts/:alertId/resolve` | Resolve o alerta para todos, com autor e data (admin, profissional, cuidador) | [alerts-resolver.md](endpoints/alerts-resolver.md) |
| `GET /api/v1/notifications` | Caixa interna do usuário: notificações de pacientes ao alcance, mais recentes primeiro | [notifications-listar.md](endpoints/notifications-listar.md) |
| `GET /api/v1/notifications/unread-count` | Quantas notificações da caixa estão não lidas | [notifications-contar-nao-lidas.md](endpoints/notifications-contar-nao-lidas.md) |
| `POST /api/v1/notifications/:notificationId/read` | Marca uma notificação do usuário como lida (leitura individual) | [notifications-marcar-lida.md](endpoints/notifications-marcar-lida.md) |
| `POST /api/v1/notifications/read-all` | Marca como lidas todas as notificações do usuário, ou as de um paciente | [notifications-marcar-todas-lidas.md](endpoints/notifications-marcar-todas-lidas.md) |
| `GET /api/v1/notifications/preferences` | Preferências de recebimento por origem × canal e opt-in do admin | [notifications-preferencias-consultar.md](endpoints/notifications-preferencias-consultar.md) |
| `PUT /api/v1/notifications/preferences` | Grava as preferências de recebimento | [notifications-preferencias-atualizar.md](endpoints/notifications-preferencias-atualizar.md) |
| `GET /api/v1/notifications/push/config` | Diz se o push do navegador está habilitado e devolve a chave pública VAPID | [notifications-push-config.md](endpoints/notifications-push-config.md) |
| `POST /api/v1/notifications/push-subscriptions` | Inscreve o navegador do usuário no push | [notifications-push-inscrever.md](endpoints/notifications-push-inscrever.md) |
| `POST /api/v1/notifications/push-subscriptions/revoke` | Revoga a inscrição de push deste navegador | [notifications-push-revogar.md](endpoints/notifications-push-revogar.md) |
| `POST /api/v1/medications` | Cadastra medicamento de paciente ativo e programa a agenda de horários; sobreposição volta como aviso | [medications-criar.md](endpoints/medications-criar.md) |
| `GET /api/v1/medications` | Lista os medicamentos de um paciente ao alcance, ativos primeiro | [medications-listar.md](endpoints/medications-listar.md) |
| `GET /api/v1/medications/:medicationId` | Consulta um medicamento com agenda, próximo horário e sobreposição | [medications-consultar.md](endpoints/medications-consultar.md) |
| `PATCH /api/v1/medications/:medicationId` | Edita o medicamento; mudar a agenda encerra a vigente e programa a nova | [medications-atualizar.md](endpoints/medications-atualizar.md) |
| `POST /api/v1/medications/:medicationId/deactivate` | Inativa o medicamento e encerra a agenda, preservando o histórico | [medications-inativar.md](endpoints/medications-inativar.md) |
| `POST /api/v1/medications/:medicationId/reactivate` | Reativa o medicamento; a mesma agenda volta a valer a partir de agora | [medications-reativar.md](endpoints/medications-reativar.md) |
| `GET /api/v1/plans` | Catálogo de planos ativos (admin ou master) | [plans-listar.md](endpoints/plans-listar.md) |
| `GET /api/v1/organizations/me/plan` | Plano, vigência, limites e uso da organização da sessão | [plans-consultar-proprio.md](endpoints/plans-consultar-proprio.md) |
| `GET /api/v1/organizations/:organizationId/plan` | Plano de qualquer organização (plataforma) | [plans-consultar.md](endpoints/plans-consultar.md) |
| `PUT /api/v1/organizations/:organizationId/plan` | Atribui, renova ou expande o plano (plataforma) | [plans-atribuir.md](endpoints/plans-atribuir.md) |
| `POST /api/v1/plan-change-requests` | Solicita mudança de plano | [plan-change-requests-criar.md](endpoints/plan-change-requests-criar.md) |
| `GET /api/v1/plan-change-requests` | Lista solicitações (as próprias ou, na plataforma, todas) | [plan-change-requests-listar.md](endpoints/plan-change-requests-listar.md) |
| `POST /api/v1/plan-change-requests/:requestId/cancel` | Cancela a solicitação pendente | [plan-change-requests-cancelar.md](endpoints/plan-change-requests-cancelar.md) |
| `POST /api/v1/plan-change-requests/:requestId/approve` | Aprova e aplica o plano pedido (plataforma) | [plan-change-requests-aprovar.md](endpoints/plan-change-requests-aprovar.md) |
| `POST /api/v1/plan-change-requests/:requestId/reject` | Recusa a solicitação (plataforma) | [plan-change-requests-recusar.md](endpoints/plan-change-requests-recusar.md) |
| `GET /api/v1/dashboard` | Painel operacional: pacientes e usuários ativos, registros e alertas emitidos no período com o período anterior, pendentes, prioritários e últimos registros (admin, Enterprise) | [dashboard-resumo.md](endpoints/dashboard-resumo.md) |
| `GET /api/v1/dashboard/patients` | Detalhe de pacientes: ativos, inativos, novos no período e por profissional responsável | [dashboard-pacientes.md](endpoints/dashboard-pacientes.md) |
| `GET /api/v1/dashboard/users` | Detalhe de usuários: ativos, convidados e inativos por perfil | [dashboard-usuarios.md](endpoints/dashboard-usuarios.md) |
| `GET /api/v1/dashboard/follow-ups` | Detalhe de registros: válidos no período por dia, formulário e autor | [dashboard-registros.md](endpoints/dashboard-registros.md) |
| `GET /api/v1/dashboard/alerts` | Detalhe de alertas: emitidos no período por dia, severidade e origem, e pendentes agora | [dashboard-alertas.md](endpoints/dashboard-alertas.md) |
| `GET /api/v1/management-reports` | Catálogo dos relatórios da Figura 43 com o total de exportações (admin, Enterprise) | [management-reports-catalogo.md](endpoints/management-reports-catalogo.md) |
| `GET /api/v1/management-reports/recent` | Relatórios exportados recentemente, lidos da auditoria | [management-reports-recentes.md](endpoints/management-reports-recentes.md) |
| `GET /api/v1/management-reports/alerts` | Alertas e intercorrências no período: origem, severidade, status, tempo até a resolução, pacientes, série diária | [management-reports-alertas.md](endpoints/management-reports-alertas.md) |
| `GET /api/v1/management-reports/alerts/pdf` | O mesmo relatório em PDF (binário), gerado na hora e auditado | [management-reports-alertas-pdf.md](endpoints/management-reports-alertas-pdf.md) |
| `GET /api/v1/management-reports/caregivers` | Atividade dos cuidadores no período: vínculos, registros, ausências e alertas resolvidos | [management-reports-cuidadores.md](endpoints/management-reports-cuidadores.md) |
| `GET /api/v1/management-reports/caregivers/pdf` | O mesmo relatório em PDF (binário), gerado na hora e auditado | [management-reports-cuidadores-pdf.md](endpoints/management-reports-cuidadores-pdf.md) |
| `GET /api/v1/audit-events` | Lista a auditoria por período, ação, usuário, sistema, gravidade e busca (admin da própria organização; master de todas) | [audit-events-listar.md](endpoints/audit-events-listar.md) |
| `GET /api/v1/audit-events/actions` | Catálogo de ações auditadas, com rótulo e gravidade | [audit-events-acoes.md](endpoints/audit-events-acoes.md) |
| `GET /api/v1/audit-events/export` | Exporta a auditoria em CSV (binário, fora do envelope), gerado na hora e auditado | [audit-events-exportar.md](endpoints/audit-events-exportar.md) |
| `GET /api/v1/audit-events/:eventId` | Detalhe de um evento, com os valores gravados | [audit-events-detalhe.md](endpoints/audit-events-detalhe.md) |

Os caminhos de Swagger usam `SWAGGER_PATH=docs` e só existem com `SWAGGER_ENABLED=true`. O documento OpenAPI é gerado em runtime; consulte a rota JSON do ambiente para conferir a versão publicada. `/health/live` é excluída do OpenAPI de propósito, mas permanece documentada aqui.

## Autenticação

Sessão stateful com token **opaco**: o login devolve o valor bruto uma única vez e o banco guarda apenas o SHA-256 dele. Não há JWT, não há nada legível dentro do token e o cliente não deve tentar interpretá-lo.

```http
Authorization: Bearer <token devolvido em data.accessToken>
```

Cada requisição recompõe o contexto no banco, então revogação, expiração, inativação do usuário e inativação da organização valem **na chamada seguinte**, sem esperar o token expirar.

| Tipo de sessão | Origem | Validade | Alcance |
| --- | --- | --- | --- |
| `normal` | Login de conta sem troca pendente | 12 horas absolutas e 30 minutos sem atividade | Todas as rotas autenticadas |
| `password_change` | Login de conta com troca obrigatória | 10 minutos absolutos | Apenas [primeiro acesso](endpoints/auth-primeiro-acesso.md) e [logout](endpoints/auth-logout.md) |

Cada requisição aceita renova a janela de inatividade da sessão normal; o prazo absoluto não é renovado. A organização efetiva **sempre** vem da sessão: nenhuma rota aceita `organizationId` do cliente como prova de autorização. Autorização por permissão nomeada usa o formato `recurso:acao`; falta de permissão responde `403 AUTH_FORBIDDEN`.

**Sessão no login e próprio cadastro (BE-27, decisões de Mateus em 2026-11-12).** O [login](endpoints/auth-login.md) devolve, além do token, `data.session`: usuário (com CPF **mascarado**), perfil, permissões efetivas em ordem alfabética e organização, com o plano resumido (código, nome, recursos e estado do termo; sem limites, uso nem preço). As permissões saem da mesma consulta que a API aplica a cada requisição. Na sessão restrita, o bloco identifica o usuário e a organização com `permissions: []`. Todo perfil, inclusive o master, tem a permissão `profile:manage`, que alcança **só o próprio cadastro**: [GET /profile](endpoints/profile-consultar.md) devolve o mesmo bloco com o CPF completo, [PATCH /profile](endpoints/profile-atualizar.md) edita nome, telefone e e-mail (trocar o e-mail pede a senha atual, apaga os links de recuperação pendentes e não encerra sessões) e [PUT /profile/password](endpoints/profile-alterar-senha.md) troca a senha como `PUT /auth/password`. Nenhuma dessas rotas recebe identificador de usuário. CPF, perfil e situação continuam só com o admin.

Todo usuário de organização cliente tem um de quatro **perfis fixos**: `admin`, `professional`, `caregiver` e `family`. O catálogo de permissões e a matriz de cada perfil são consultados em [GET /access-profiles](endpoints/access-profiles-listar.md); o administrador troca o perfil de um usuário por [PATCH /users/:userId/profile](endpoints/users-alterar-perfil.md). As permissões são relidas do banco a cada requisição, então a troca vale na chamada seguinte do usuário, sem revogar a sessão.

### Usuários e convite

O administrador da organização gerencia os usuários do próprio tenant pelas rotas `/api/v1/users` (BE-06, 2026-11-03). O usuário nasce `pending` no [cadastro](endpoints/users-criar.md), e o **convite** do UC03 sai por um de dois canais (BE-31, decisões de Mateus em 2026-11-12/13). A troca entre eles é só de configuração (`SMTP_ENABLED`):

- **SMTP desligado (produção hoje): senha provisória.** A senha é devolvida uma única vez ao administrador, que a entrega fora da API. O usuário entra só pela sessão restrita e vira `active` ao concluir o [primeiro acesso](endpoints/auth-primeiro-acesso.md). Vale 24 horas. A resposta é a de antes do BE-31, com o campo `channel: "temporary_password"` a mais.
- **SMTP ligado: link por e-mail.** O usuário nasce sem senha e recebe um link de uso único para a página de aceite do frontend (`INVITATION_ACCEPT_URL?token=…`), onde **ele mesmo** cadastra a senha. O link vale `INVITATION_TTL_HOURS` (padrão 72 h). O admin **não vê senha nenhuma**: a resposta traz `channel: "email"` e `delivery.status` (`sent` ou `failed`). Se o envio falhar, o link é revogado na hora. Com o SMTP ligado, o admin ainda pode pedir `channel: "temporary_password"`.

Vencido, perdido ou com o envio falho, o convite é [reemitido](endpoints/users-reemitir-convite.md), no mesmo canal ou trocando-o, e o anterior para de valer antes do envio. `invitation` em cada usuário mostra `channel`, `status` (`pending`, `expired` ou `invalidated`, este quando o link foi revogado), `expiresAt` e `sentAt`. O link também morre quando o e-mail do pendente [muda](endpoints/users-atualizar.md), quando o usuário é [inativado](endpoints/users-inativar.md) ou quando a organização é [inativada](endpoints/organizations-inativar.md). O primeiro administrador criado pelo master continua com senha provisória sem prazo.

Usuários `pending` e `active`, o primeiro administrador incluído, contam no limite de usuários efetivo do plano (personalizado do termo de vigência, senão `usage_plans.user_limit`). O limite é verificado no cadastro e na reativação, antes de qualquer token ou envio; com a vigência vencida, os dois são bloqueados. [Inativar](endpoints/users-inativar.md) revoga sessões, links de recuperação e convite na hora, sem apagar histórico; não existe exclusão.

Rotas públicas de autenticação: login, solicitação de recuperação, redefinição por token e, desde o BE-31, [consulta](endpoints/auth-convite-consultar.md) e [aceite](endpoints/auth-convite-aceitar.md) do convite por link. Todo o resto exige Bearer, e o OpenAPI marca isso no esquema `bearer`.

> **Não existe SMTP configurado em nenhum ambiente** (decisão de 2026-09-22). Por isso, em produção o convite de usuário é a senha provisória. A solicitação de recuperação responde `202` com `meta.message` orientando a procurar o administrador, mas não cria token nem envia mensagem. O canal operacional de recuperação é a [redefinição administrativa](endpoints/auth-redefinir-senha-usuario.md) (recuperação assistida, 2026-10-29): senha temporária válida por 24 horas, reemitida pelo administrador quando vence ou se perde. O envio por link passa a valer apenas quando houver servidor de e-mail.

A senha tem de 8 a 128 **caracteres**, aceita espaços e Unicode e não tem regra de composição. O armazenamento usa Argon2id.

### Plano de uso, vigência e solicitação de mudança

O [catálogo](endpoints/plans-listar.md) segue o **Quadro 2 do TCC** (decisão de Mateus em 2026-11-04): **Basic**, até 10 usuários e 200 pacientes ativos, limites fixos, R$ 499,00/mês; **Enterprise**, até 50 usuários e 1.000 pacientes ativos, expansível conforme contratação, R$ 1.990,00/mês mais adicional conforme volume. O preço é informativo. Cada organização cliente tem um **termo de vigência** corrente (BE-07): plano, início, fim opcional e, só no Enterprise, limites expandidos (nunca abaixo do catálogo). O **limite efetivo** é o expandido, senão o do catálogo. O administrador consulta tudo em [GET /organizations/me/plan](endpoints/plans-consultar-proprio.md) e pede outro plano por [POST /plan-change-requests](endpoints/plan-change-requests-criar.md); o plano só muda quando o master [aprova](endpoints/plan-change-requests-aprovar.md). O master também [atribui, renova ou expande](endpoints/plans-atribuir.md) diretamente. Com a vigência vencida, a leitura e o registro continuam; só novos cadastros e reativações de usuário e de paciente são bloqueados (`409 USER_PLAN_EXPIRED` / `PATIENT_PLAN_EXPIRED`). O **consumo** exibido (`usage`) e o limite aplicado usam a mesma contagem (BE-08); limite abaixo do uso, após rebaixamento, só impede crescer, sem inativar ninguém. O limite de pacientes conta pacientes **ativos** e vale no cadastro e na reativação de pacientes (BE-09); `usage.patients` usa a mesma contagem. Não há pagamento, cobrança nem renovação automática. Vigência, vencimento e fluxo de decisão são decisões do agente de 2026-11-03, pendentes de confirmação de Mateus.

**Aviso de vencimento (BE-28, 2026-11-12; UC04 alternativo; decisões de Mateus).** Sem rota própria. Um job envia por **e-mail** aos **administradores ativos** da organização cliente um aviso por marco do termo corrente: sete dias antes da data de fim, um dia antes e no vencimento, sempre às **08:00 de Brasília**. O master não recebe cópia, e o admin não pode desligar o aviso. Se a execução das 08:00 se perder numa queda, o marco sai na volta, mas só o mais recente que ainda faz sentido (o de 7 dias não sai depois do marco de 1 dia, nem o de 1 dia depois do fim). Renovar, trocar o plano ou aprovar uma solicitação antes do envio cancela os e-mails pendentes do termo antigo, e o termo novo tem os próprios marcos. Um termo aberto depois das 08:00 espera a execução do dia seguinte. O e-mail traz organização, plano, data de fim, o efeito do vencimento e como pedir a renovação, sem dado de paciente. Na tela, o mesmo aviso aparece em `term.expiryWarning` e `meta.message` de [GET /organizations/me/plan](endpoints/plans-consultar-proprio.md).

- **Redis só agenda:** a fila BullMQ `plan-expiry-notices` tem o scheduler `plan-expiry-notice-daily` (cron `0 8 * * *`, fuso `America/Sao_Paulo`), uma recuperação na subida e novas tentativas só quando há e-mail pendente. Não roda o tempo todo. Uma execução que falha (banco ou Redis indisponível) tenta de novo com espera exponencial a partir de 30 s, até 6 vezes, e nenhum e-mail sai antes do instante do seu marco.
- **Implantação:** sem caso especial. Um termo corrente já vencido, de qualquer data, recebe o aviso de vencimento uma vez na primeira execução.
- **Estado no PostgreSQL:** avisos em `plan_expiry_notices` (um por termo e marco) e e-mails em `plan_expiry_notice_deliveries` (um por aviso e administrador), com a mesma reserva e as mesmas tentativas do BE-17 (1 min, 5 min, 30 min, 2 h).
- **Reconferência antes de enviar.** O e-mail fica `skipped` com `ORGANIZATION_INACTIVE`, `TERM_SUPERSEDED`, `NOTICE_OUTDATED` ou `RECIPIENT_REVOKED` (inativado ou deixou de ser admin).
- **SMTP desligado:** fica `skipped` com `CHANNEL_DISABLED` e não é reenviado quando o SMTP for ligado.
- **Auditoria:** `plan_expiry_notice.generated`.

### Pacientes

Profissionais e administradores mantêm o cadastro dos pacientes pelas rotas `/api/v1/patients` (BE-09, 2026-11-04; RF006/RF016; UC07). Os campos são os do MER mais os da Figura 35 e o complemento do endereço (decisões de Mateus): obrigatórios só **nome, data de nascimento e profissional responsável**; o CPF é opcional e, quando informado, **único na organização inclusive entre inativos** (`409 PATIENT_DUPLICATE_CPF`). O plano de saúde do paciente é texto livre e não tem relação com o plano comercial da organização. O responsável é gravado como vínculo (`user_patients`, o `usuarios_pacientes` do MER) e trocá-lo encerra o vínculo anterior sem apagá-lo. `status` é só a situação **cadastral** (`active`/`inactive`); situação clínica não é gravada. Inativar é a exclusão lógica do paciente (`status = inactive` e `deleted_at` preenchido juntos; nenhuma linha é apagada): tira o paciente da listagem principal e libera a vaga, preservando tudo; paciente inativo é legível, não é editado e volta pela reativação, que passa pelo limite do plano. **Alcance:** `admin` e `professional` veem todos os pacientes da organização; `caregiver` e `family` só os vinculados a eles no papel do próprio perfil (vínculos de cuidado, abaixo); o vínculo de responsável não conta. Paciente fora do alcance responde `404`.

### Vínculos de cuidadores e familiares

Administradores e profissionais vinculam cuidadores e familiares a pacientes pelas rotas `/api/v1/patient-links` (BE-10, 2026-11-04; RF005/RF016; UC03/UC07/UC14; decisões de Mateus). O papel vem do perfil do usuário (`caregiver` ou `family`); um paciente tem quantos cuidadores e familiares precisar, com um vínculo vigente por par usuário–paciente. O vínculo vale até ser revogado, sem data de término; revogar grava `deleted_at`, preserva a linha e corta o acesso na requisição seguinte. A listagem inclui o vínculo de responsável, que só muda na edição do paciente. Trocar o perfil de um usuário revoga os vínculos de cuidado que não cabem no novo perfil; inativar o usuário não revoga. O cuidador vinculado lê o cadastro completo do paciente; o familiar, só o recorte da Figura 37 (BE-19, seção "Visão do familiar"); nenhum dos dois escreve. O seletor [GET /patient-links/eligible-users](endpoints/patient-links-usuarios-elegiveis.md) devolve só id, nome, perfil e status, para o profissional escolher responsável, cuidador ou familiar sem `users:read`. Auditoria `patient_link.created|updated|revoked`, sem o conteúdo de tipo e observação.

### Formulários de acompanhamento

Profissionais e administradores montam os formulários que o cuidador preencherá nas visitas pelas rotas `/api/v1/forms` (BE-11, 2026-11-04; RF008, RF013 na parte de formulário; UC09; decisões de Mateus). O formulário é **versionado**: nasce em rascunho, e [publicar](endpoints/forms-publicar.md) congela o rascunho como a versão N+1 vigente; versões publicadas e seus campos nunca mudam, e as respostas (BE-12) ficam presas à versão que responderam. Editar um publicado é [salvar um rascunho](endpoints/forms-salvar-rascunho.md) da próxima versão repetindo a `fieldKey` dos campos que continuam (a chave fixa o tipo do campo); publicar sobre uma versão vigente exige `confirmImpact: true` (`409 FORM_IMPACT_CONFIRMATION_REQUIRED`). O público é a organização inteira ou uma lista de pacientes ativos (`audience` `organization`/`patients`, sem entidade de grupo); a frequência esperada é opcional (`interval` de 1 a 365 em `hours`, `days` ou `weeks`) e alimenta o alerta de ausência do BE-16 (um alerta por período vencido sem envio). Há seis tipos de campo — `number` (casas decimais 0–3, unidade opcional, sem mínimo/máximo clínico), `scale` (inteiros de mínimo a máximo), `boolean`, `text`, `single_choice` e `multiple_choice` —, cada um obrigatório, opcional ou desabilitado; a **pressão arterial são dois campos `number`** (sistólica e diastólica, mmHg). Formulário sem campos é recusado (`422 FORM_EMPTY`), e rascunho só com campos desabilitados não é publicado. Nome, descrição, tipo de acompanhamento, frequência e público mudam por [PATCH](endpoints/forms-atualizar.md), sem nova versão. [Desativar](endpoints/forms-desativar.md) é a exclusão do UC09: preserva versões, campos, rascunho e lista de pacientes e bloqueia escrita (`409 FORM_INACTIVE`) até a [reativação](endpoints/forms-reativar.md). **Alcance:** `admin` e `professional` leem e configuram todos os formulários da organização; o `caregiver` só lê formulários ativos da organização inteira ou que listem paciente vinculado a ele, sem rascunho; o `family` recebe `403`. `parseFieldAnswer` (`src/modules/Form/parsers/fieldAnswer.parser.ts`) fixa o contrato de valor de cada tipo, em que `0` e `false` são valores e não ausência, e é aplicado pelo registro de acompanhamento (BE-12); regras de alerta por campo apontam para a `fieldKey` (BE-15). Auditoria `form.created|updated|draft_saved|draft_discarded|published|deactivated|reactivated`, sem conteúdo de campo nem dado de paciente além do id.

### Registros de acompanhamento

O cuidador registra a visita pelas rotas `/api/v1/follow-ups` (BE-12, 2026-11-04; RF009; UC11; decisões de Mateus). [Registrar](endpoints/follow-ups-registrar.md) grava, numa transação, o registro (paciente, cuidador da sessão, `visitedAt` informado — padrão agora, nunca no futuro — e o envio em `submittedAt`, observações), a resposta (formulário e **versão vigente** respondidos; um formulário por registro) e um item por campo preenchido; falha em qualquer passo não deixa nada gravado. Só o `caregiver` registra, e só para paciente **ativo** com vínculo de cuidador vigente, em formulário **ativo** que valha para ele; o cliente envia `formVersionId`, e versão substituída durante o preenchimento é recusada (`409 FOLLOW_UP_FORM_VERSION_OUTDATED`). Envio sem nenhum valor é `422 FOLLOW_UP_EMPTY` (`0` e `false` são valores; as observações sozinhas não bastam); tipo, casas, escala, opções, campo desabilitado ou alheio e obrigatório ausente saem em `422 FOLLOW_UP_INVALID_ANSWERS` por campo; **valor fora de faixa clínica é gravado**, nunca recusado. Cancelar é não enviar. Os valores passam pelas regras de alerta (BE-15) logo depois do commit, fora da transação: falha na avaliação não desfaz o registro, que fica pendente para uma varredura. Correção é por [anulação com motivo](endpoints/follow-ups-anular.md): o registro continua no histórico como `annulled`; o autor anula os próprios e `admin`/`professional` (permissão nova `follow_ups:annul`) anulam qualquer um, sem prazo e uma única vez. [Listar](endpoints/follow-ups-listar.md) (por `patientId`, filtro `status`) e [consultar](endpoints/follow-ups-consultar.md) exigem `patient_history:read`: `admin` e `professional` leem a organização inteira; `caregiver` e `family`, só pacientes vinculados; o familiar recebe só registros válidos, sem os anulados (BE-19). Cada resposta sai com os metadados do campo **na versão respondida**. Os filtros do histórico (UC12) vieram no BE-18; ver "Histórico e visão consolidada". Auditoria `follow_up.created` (`formId`, `formVersionId`, `itemCount`) e `follow_up.annulled` (`ownRecord`, `reasonLength`), sem valores clínicos nem o texto do motivo.

### Histórico e visão consolidada

O histórico do UC12 (BE-18, 2026-11-06; RF010/RF016; decisões de Mateus) é a [listagem de registros](endpoints/follow-ups-listar.md) com filtros opcionais, combinados com E:
- `from`/`to`: dias `AAAA-MM-DD` inclusivos, pela data da **visita** no fuso `America/Sao_Paulo`;
- `fieldKey`: parâmetro, pela identidade do campo entre versões;
- `section`: categoria de informação, a seção do campo, sem diferenciar maiúsculas;
- `authorUserId`: responsável;
- `formId`: tipo de formulário;
- `status`: situação do registro.

O registro filtrado sai completo. Período sem registro é `200` com lista vazia, `total: 0` e `meta.message` "Nenhum registro de acompanhamento no período e nos filtros selecionados." (BE-29).

A [visão consolidada](endpoints/patients-visao-consolidada.md) (`GET /patients/:patientId/overview`, Figura 36) reúne numa chamada:
- os contadores: registros válidos, alertas abertos e medicamentos ativos;
- a última visita;
- os 5 últimos valores de cada campo `number`/`scale` de registros válidos, sem classificação clínica;
- até 10 medicamentos ativos e os 5 alertas mais recentes, nos formatos de `GET /medications` e `GET /alerts`.

Blocos de medicamento e alerta saem `null` para quem não tem `medications:read` ou `alerts:read`. Paciente sem nenhum registro válido traz `meta.message` "Este paciente ainda não tem registro de acompanhamento." (BE-29).

As duas rotas exigem `patient_history:read` e o mesmo alcance de paciente: admin e profissional na organização inteira, cuidador e familiar só com vínculo vigente. O familiar não vê registros anulados no histórico (BE-19); a visão consolidada já conta só os válidos. Fora do alcance, a resposta é `404 PATIENT_NOT_FOUND` antes de qualquer contagem. O histórico de paciente inativo continua legível.

### Visão do familiar

O familiar acompanha o paciente vinculado **só lendo**, pelas mesmas rotas dos outros perfis (BE-19, 2026-11-06; RF016; UC14; decisões de Mateus). Não há rota própria. O painel é a [visão consolidada](endpoints/patients-visao-consolidada.md), os registros recentes são o [histórico](endpoints/follow-ups-listar.md), os gráficos de evolução vêm de [GET /patients/:id/evolution](endpoints/patients-evolucao.md) (BE-20, mesma resposta do profissional), e os alertas vêm de [GET /alerts](endpoints/alerts-listar.md) e da [caixa de notificações](endpoints/notifications-listar.md).

O que muda quando o perfil da sessão é `family`:

- **Cadastro** ([GET /patients](endpoints/patients-listar.md), [GET /patients/:id](endpoints/patients-consultar.md)): recorte da Figura 37.
  - Saem nome, nascimento, sexo, condições, status, responsável e datas.
  - `cpf`, `phone`, `email`, `healthPlan`, `notes` e todas as partes de `address` saem mascarados com `********` (máscara fixa, aplicada também a campo vazio, para não revelar tamanho nem existência do dado), no mesmo formato.
  - A busca `search` procura só no nome, nunca no CPF.
- **Parentesco:** `viewerLink` traz o vínculo de quem consulta (`role` e `linkType`, o parentesco). Também vem para o cuidador; é `null` para admin e profissional.
- **Registros:** só os válidos. O anulado não aparece na lista, nem com `status=annulled` (lista vazia). O detalhe responde `404 FOLLOW_UP_NOT_FOUND`.
- **Anexos:** só de registro válido. Para registro anulado, a listagem responde `404 FOLLOW_UP_NOT_FOUND` e o download, `404 ATTACHMENT_NOT_FOUND`.
- **Alertas, notificações e medicamentos:** completos, como para o cuidador. Um alerta pode apontar para um registro anulado (`followUp.status = annulled`), que o familiar não abre.

Garantias que já existiam e continuam testadas:

- **Somente leitura:** toda escrita do familiar responde `403 AUTH_FORBIDDEN` (paciente, registro, anulação, anexo, medicamento, resolução de alerta, vínculo). Ele não gera relatório nem exporta auditoria.
- **Vínculo a cada requisição:** o vínculo é relido a cada chamada. Revogado, as leituras passam a `404` na requisição seguinte.
- **Identificador alheio:** `patientId`, `followUpId` ou `attachmentId` de outro paciente ou de outra organização responde `404`, sem conteúdo.
- **Sem vínculo (BE-29, decisão de Mateus em 2026-11-12):** a página do familiar continua acessível, sem "acesso negado". `GET /patients` devolve `200` com lista vazia e `meta.message` "Você ainda não tem paciente vinculado. Peça ao profissional responsável para liberar o seu acesso.", com ou sem filtros e em qualquer página; o cuidador sem vínculo recebe "Você ainda não tem paciente vinculado. Peça ao profissional responsável ou ao administrador para vincular você a um paciente.". Vínculo revogado conta como inexistente já na requisição seguinte, e a mensagem some quando um vínculo novo é criado. Com vínculo, busca sem resultado traz o aviso genérico "Nenhum paciente encontrado para os filtros informados." (inclusive quando o único vínculo é com paciente inativo e a lista é a de ativos). Detalhe por id fora do alcance continua `404 PATIENT_NOT_FOUND`, sem mensagem.
- **Sem dados no período (BE-29):** histórico, visão consolidada e evolução vazios trazem `meta.message` informativa (ver as seções abaixo).

**Fora do escopo:** próxima visita, adesão e estado resumido da Figura 37 (adiados ou fora de escopo no BE-26; ver [Capacidades dos protótipos sem API](#capacidades-dos-protótipos-sem-api)).

### Evolução e indicadores

A [evolução do paciente](endpoints/patients-evolucao.md) (`GET /patients/:patientId/evolution`; BE-20, 2026-11-09; RF011; UC10/UC14; decisões de Mateus) devolve, por parâmetro numérico, os pontos do período e três indicadores, sem classificação clínica:

- **média:** aritmética simples, com pelo menos 1 medição;
- **variação:** último valor − primeiro, com pelo menos 2;
- **tendência:** inclinação da reta de mínimos quadrados em unidade por dia, com direção pelo sinal (`rising`, `falling`, `flat`), com pelo menos 3 medições em 2 instantes distintos.

Indicador sem amostra mínima sai `null` e entra em `unavailable` com o motivo, como pede o UC10. Um ponto é uma medição de registro válido; o período é `from`/`to` em dias da visita no fuso `America/Sao_Paulo`, com padrão nos últimos 30 dias e no máximo 366 dias. Campos `number` com unidade diferente entre versões, ou `scale` com faixa diferente, viram séries separadas e nunca se misturam numa média; período sem medição é `200` com `series: []` e `meta.message` "Nenhuma medição no período selecionado." (BE-29). Indicadores com 3 casas decimais.

A rota exige `patient_evolution:read` (admin, profissional e familiar; o cuidador não tem) e o alcance de paciente das demais leituras; fora dele, `404 PATIENT_NOT_FOUND`. O familiar recebe a mesma resposta do profissional. O painel operacional da organização (BE-22) está em [Painel operacional da organização](#painel-operacional-da-organização).

### Relatório do paciente e PDF

O [relatório do paciente](endpoints/patients-relatorio.md) (`GET /patients/:patientId/report`) e sua [exportação em PDF](endpoints/patients-relatorio-pdf.md) (`GET /patients/:patientId/report/pdf`) entregam o mesmo conteúdo (BE-21, 2026-11-09; RF012, RF016; UC10; decisões de Mateus): identificação do paciente sem CPF, contato, endereço, plano de saúde e observações do cadastro; período com a regra do BE-20 (padrão de 30 dias, no máximo 366); resumo e lista completa dos registros **válidos** (no máximo 1.000, senão `422 REPORT_TOO_MANY_RECORDS`); as mesmas `series` do `/evolution`, com o motivo de cada indicador indisponível; e os medicamentos ativos no momento da geração. Alertas não entram. O PDF é **gerado na hora e não fica guardado**: não há catálogo de relatórios, link posterior nem XLSX (P21/P27), e cada pedido é reautorizado. Período vazio gera o relatório com o aviso "Nenhum registro válido no período.". Falha na geração responde `500 REPORT_EXPORT_FAILED` e a nova tentativa é repetir o pedido. Só a exportação em PDF é auditada (`patient_report.exported` com paciente e período, sem dado clínico). As duas rotas exigem `reports:generate` (admin e profissional); cuidador e familiar recebem `403`.

### Painel operacional da organização

O [painel operacional](endpoints/dashboard-resumo.md) (`GET /dashboard`) e os quatro detalhes por indicador ([pacientes](endpoints/dashboard-pacientes.md), [usuários](endpoints/dashboard-usuarios.md), [registros](endpoints/dashboard-registros.md), [alertas](endpoints/dashboard-alertas.md)) atendem o UC05 (BE-22, 2026-11-09; RF015; Figura 33; decisões de Mateus). Só o **admin** (`dashboard:read`) e só organização cujo plano tem `operational_dashboard` — o **Enterprise** do Quadro 2; no Basic, `403 DASHBOARD_PLAN_FEATURE_UNAVAILABLE`. Pacientes e usuários ativos são a foto de agora (usuário ativo = `status = active`, sem os convidados `pending`). Registros contam pela data da **visita**, só válidos; alertas **emitidos** contam pela geração, de todas as origens e em qualquer status, e **pendentes** são os `open` agora. O período segue a regra do BE-20 (dias no fuso `America/Sao_Paulo`, padrão de 30 dias, no máximo 366) e cada número de período vem com o **período anterior de mesmo tamanho** e a diferença absoluta. O resumo traz ainda o gráfico de registros por dia, até 5 alertas prioritários (abertos, por severidade e recência) e os 5 últimos registros. Período sem registro responde `200` com zeros e `meta.message`; falha ao carregar é `500 INTERNAL_ERROR` sem `detail`, e a nova tentativa é repetir a chamada. Sem auditoria e sem cache. A migration `1791600000000-AddDashboardIndexes` só cria índices.

### Relatórios gerenciais

Os relatórios gerenciais do plano Enterprise (BE-30, 2026-11-12; Quadro 2; Figura 43; RF012, RF015; decisões de Mateus) são uma capacidade nova, sem UC no TCC. A especificação, no formato de UC, está no vault, em `2026-11-12-relatorios-gerenciais`.

**Acesso:**

- Só o **admin** gera, com a permissão nova `management_reports:generate`. O admin passa a ter 36 permissões.
- Só organização cujo plano tem `management_reports`, o **Enterprise**. No Basic, a resposta é `403 MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE`, antes de qualquer consulta.

**Tipos de relatório:**

- **Acompanhamento individual:** é o relatório do paciente acima.
- **[Alertas e intercorrências](endpoints/management-reports-alertas.md):**
  - parte dos alertas das três origens emitidos no período, com o status de agora;
  - intercorrência = alerta `critical`;
  - traz contagens por origem, severidade e status, o tempo até a resolução (média e mediana em horas), até 10 pacientes com mais alertas, a série diária e as 200 intercorrências mais recentes;
  - acima de 10.000 alertas, a resposta é `422 MANAGEMENT_REPORT_TOO_MANY_ALERTS`.
- **[Atividade dos cuidadores](endpoints/management-reports-cuidadores.md):**
  - uma linha por cuidador, com pacientes vinculados, registros válidos e anulados, pacientes com e sem registro, alertas de ausência dos pacientes dele e alertas que ele resolveu;
  - não há nota, percentual nem classificação.

**Filtros:** período com a regra do BE-20 e `condition` por trecho da condição principal ou secundária, sem diferenciar maiúsculas. Período sem dados responde `200` com zeros e `meta.message`.

**PDF e recentes:**

- Os PDFs ([alertas](endpoints/management-reports-alertas-pdf.md), [cuidadores](endpoints/management-reports-cuidadores-pdf.md)) têm o mesmo conteúdo do JSON e seguem o visual do sistema.
- São gerados na hora, não ficam guardados, e a exportação é auditada (`management_report.exported`). Não há CSV nem XLSX.
- O [catálogo](endpoints/management-reports-catalogo.md) e os [recentes](endpoints/management-reports-recentes.md) são montados pelos eventos de exportação, gerenciais e do PDF do paciente.
- A leitura em JSON não é auditada.

**Privacidade:** nenhum relatório traz valor clínico registrado, CPF, contato ou endereço, e o nome do arquivo não leva nome de pessoa.

### Recursos do plano

Como cada recurso do Quadro 2 (`usage_plans.features`, exposto em `session.organization.plan.features` e `GET /organizations/me/plan`) é aplicado pela API:

| Recurso | Planos | Aplicação |
| --- | --- | --- |
| `patient_management`, `health_records`, `patient_history`, `automatic_alerts`, `responsive_access` | Basic e Enterprise | Funcionalidades básicas, presentes nos dois planos; não há checagem porque nenhum plano fica sem elas. |
| `extended_registration` | Enterprise | Aplicado pelos limites do plano (50 usuários e 1.000 pacientes ativos) e pela expansão contratada (`usage_plans.expandable`), em `checkPlanSeat` (BE-07/BE-08). |
| `operational_dashboard` | Enterprise | Checado em `/dashboard` (`403 DASHBOARD_PLAN_FEATURE_UNAVAILABLE`, BE-22). |
| `management_reports` | Enterprise | Checado em `/management-reports` (`403 MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE`, BE-30). |
| `custom_deployment` | Enterprise | Serviço contratado, sem checagem na API. |

O relatório do paciente (UC10) é funcionalidade do caso de uso e existe nos dois planos. Termo vencido não tira recurso nenhum; ele só bloqueia o crescimento (BE-07).

### Auditoria

A trilha de auditoria (BE-23, 2026-11-09; RF017; UC06; RNF007; Figura 45; decisões de Mateus) é gravada por todos os módulos **na mesma transação** da ação — falha ao gravar o evento desfaz a ação — e consultada pelas rotas `/api/v1/audit-events`: [listar](endpoints/audit-events-listar.md) com filtros de período (regra do BE-20 sobre o instante do evento), ação, usuário, Sistema/Automação, gravidade e busca; [detalhe](endpoints/audit-events-detalhe.md) com os valores gravados; [catálogo de ações](endpoints/audit-events-acoes.md) para o filtro; e [exportação CSV](endpoints/audit-events-exportar.md) gerada na hora (UTF-8 com BOM, `;`, até 10.000 eventos, `422 AUDIT_EXPORT_TOO_MANY_EVENTS` acima; falha `500 AUDIT_EXPORT_FAILED` e nova tentativa repetindo o pedido), que grava `audit_events.exported` sem o termo da busca. Filtro sem resultado é `200` com lista vazia e `meta.message`. **Alcance:** `audit_events:read|export` — o `admin` vê só a própria organização (o `organizationId` é ignorado) e o `platform_admin` vê todas, com `organizationId` opcional; para o master, os dados pessoais de outra organização saem **mascarados** — nome do responsável, do paciente e do usuário afetado com a inicial de cada palavra (`P**** L***`); formulário, medicamento, organização e IP saem completos —, e a busca por nome só procura na organização da sessão. Desde o BE-23 cada evento guarda o **perfil do autor no instante da ação** e o **IP do cliente** (regra `TRUST_PROXY`; `null` em job e nos eventos anteriores); a gravidade (`info`, `normal`, `warning`, `critical`) vem de um catálogo fixo por ação, e `alert.generated` usa a severidade do alerta. Os eventos guardam só ids, códigos e nomes de campos alterados — nunca senha, token ou valor clínico —, e o detalhe ainda mascara chaves sensíveis. Leituras não são auditadas. A trilha é **imutável**: não há rota de edição ou exclusão e o PostgreSQL recusa `UPDATE` e `DELETE` em `audit_events` (trigger `audit_events_immutable`); retenção indefinida até política LGPD futura (BE-25). Logs operacionais (pino) ficam separados da trilha. Migration `1791700000000-AuditEventQuery`.

### Anexos de registro

O cuidador anexa fotos e documentos ao registro de acompanhamento pelas rotas `/api/v1/follow-ups/:followUpId/attachments` (BE-13, 2026-11-05; RF009/RF016; UC11; decisões de Mateus). O TCC previa S3; por decisão de Mateus o arquivo fica num **volume Docker privado** da API (`vitacare-storage`, montado em `STORAGE_PATH`), sem URL pública: todo download passa pela API e é reautorizado a cada chamada. [Enviar](endpoints/follow-up-attachments-enviar.md) é `multipart/form-data` com uma única parte `file`, **depois** do registro, só pelo `caregiver` **autor** do registro, com vínculo vigente, registro válido (não anulado) e paciente ativo, sem prazo. Aceita **JPEG, PNG, WEBP e PDF** reconhecidos pelo **conteúdo** (não pela extensão), até **10 MB** (10 485 760 bytes), **5 anexos ativos** por registro. O arquivo só é gravado depois de todas as checagens, dentro da transação, e é apagado se a transação falhar. [Listar](endpoints/follow-up-attachments-listar.md) e [baixar](endpoints/follow-up-attachments-baixar.md) exigem `patient_history:read` no alcance do registro; o familiar vinculado só alcança anexos de registro válido (BE-19). O download é binário, `Content-Disposition: attachment` e `Cache-Control: private, no-store`. [Remover](endpoints/follow-up-attachments-remover.md) (`204`) cabe ao autor ou a `admin`/`professional` (`follow_ups:annul`): a linha recebe `deleted_at` e o arquivo é apagado do volume. Anexos de registro anulado (exceto para o familiar) ou de paciente inativo continuam legíveis. Auditoria `follow_up_attachment.created` e `follow_up_attachment.removed` com o **nome do arquivo** (decisão de Mateus).

### Medicamentos e agenda de lembretes

Profissionais e administradores mantêm os medicamentos de cada paciente pelas rotas `/api/v1/medications` (BE-14, 2026-11-05; RF007; UC08; decisões de Mateus). O medicamento tem nome, **dose decimal com unidade** de lista fechada (`mg`, `mcg`, `g`, `ml`, `iu`, `drops`, `tablet`, `capsule`, `application`; o MER tinha `dosagem_mg INT`), via de administração opcional em lista fechada (só no DER) e observação. A **agenda** é uma lista de horários `HH:mm` que se repete a cada N dias (1–30; 1 = diário) entre a data de início e um fim opcional (sem fim = uso contínuo), sempre no fuso **`America/Sao_Paulo`**; cada horário é uma linha de `medication_reminders` (o `lembretes_medicamentos` do MER) válida de `created_at` até `deleted_at`. [Cadastrar](endpoints/medications-criar.md) grava medicamento e agenda numa transação; `remindersEnabled` liga os lembretes automáticos (padrão `false`). [Editar](endpoints/medications-atualizar.md) início, fim, intervalo, horários ou lembretes **encerra** a agenda vigente e grava a nova no mesmo instante, para que um horário antigo nunca mais seja válido; [inativar](endpoints/medications-inativar.md) encerra a agenda no instante da inativação, preservando tudo, e [reativar](endpoints/medications-reativar.md) recria a mesma agenda a partir de agora. **Sobreposição** (mesmo horário de outro medicamento ativo do paciente num dia comum, de hoje em diante) volta em `scheduleConflicts` como aviso e **nunca bloqueia**. Toda resposta traz `nextScheduledAt` (próximo horário, em UTC). Paciente inativo não recebe medicamento novo, nem edição ou reativação (`409 MEDICATION_PATIENT_INACTIVE`). **Alcance:** escrevem `admin` e `professional`; [listar](endpoints/medications-listar.md) (por `patientId`) e [consultar](endpoints/medications-consultar.md) exigem `medications:read`, que desde o BE-14 vale também para `caregiver` e `family` **só nos pacientes vinculados**; o familiar lê o medicamento completo (BE-19). O disparo dos lembretes é do BE-16 (seção de ausência e lembretes abaixo) e a entrega aos vinculados, do BE-17 (seção de notificações); tomada, adesão, atraso e "Suspenso" (Figura 41) não são modelados (BE-26). Auditoria `medication.created|updated|deactivated|reactivated`, com nomes de campos alterados e sem nome do medicamento, dose ou observação.

### Regras e alertas por valor registrado

Profissionais e administradores configuram limiares pelas rotas `/api/v1/alert-rules` e todos os perfis com `alerts:read` consultam os alertas pelas rotas `/api/v1/alerts` (BE-15, 2026-11-05; RF013, RF014; UC09 passo 5, UC11 passo 6, UC13; decisões de Mateus). Uma [regra](endpoints/alert-rules-criar.md) monitora um campo `number` ou `scale` da versão vigente de um formulário ativo, pela `fieldKey` (segue o campo nas versões seguintes), com **um operador** (`gt`, `gte`, `lt`, `lte`) e **um valor de referência** decimal (até 3 casas) que o profissional define — o sistema não traz limiar clínico padrão nem usa números das telas. Faixa = duas regras. Severidade `critical`, `warning` ou `info` (Figura 42), só rótulo. A regra é **geral** (todos os pacientes do formulário) ou **própria de um paciente** ativo a que o formulário se aplica; a regra própria ativa de um paciente num campo **substitui** as gerais desse campo para ele. Várias regras no mesmo campo disparam de forma independente. [Editar](endpoints/alert-rules-atualizar.md) muda nome, descrição, operador, referência e severidade; [inativar](endpoints/alert-rules-inativar.md) e [reativar](endpoints/alert-rules-reativar.md) seguem `status`+`deleted_at`. Logo depois do commit de cada [registro de acompanhamento](endpoints/follow-ups-registrar.md), os itens numéricos são comparados (decimal exato) com as regras ativas criadas até o envio; o valor é sempre gravado, e cada regra × item gera **no máximo um** alerta (`UNIQUE`), com cópia de campo, valor, operador e referência no disparo. Falha nessa avaliação não desfaz o registro: um job do BullMQ (scheduler no Redis, a cada 60 s) avalia os pendentes. Sem regra ativa para um parâmetro, nada é alertado. [Listar](endpoints/alerts-listar.md) (por `patientId`, filtro `severity`) e [consultar](endpoints/alerts-consultar.md) seguem o alcance de pacientes (cuidador e familiar só os vinculados; o familiar lê o alerta completo, BE-19); o estado do registro de origem (`valid`/`annulled`) aparece no alerta. Ausência recorrente e lembretes de medicamento entram pela seção seguinte (BE-16); destinatários, notificação, leitura e resolução, pela seção de notificações (BE-17). Auditoria `alert_rule.created|updated|deactivated|reactivated` (sem a referência) e `alert.generated` como evento de sistema (`ruleId`, `followUpId`, `severity`, sem valor clínico).

### Ausência de registro e lembretes de medicamento

Sem rota própria (BE-16, 2026-11-05; RF014; UC13; UC09 passo 4; UC08; RNF007/008; decisões de Mateus): dois disparadores por relógio do UC13 gravam alertas na mesma tabela e saem por [listar](endpoints/alerts-listar.md) e [consultar](endpoints/alerts-consultar.md) alertas, com `source` `absence` ou `medication_reminder` e o bloco da origem (`absence` ou `medicationReminder`; os campos de `reading` saem `null`). **Ausência:** para cada paciente ativo e formulário ativo com frequência esperada que vale para ele, sai um alerta `warning` a cada período vencido sem envio válido do formulário, sem tolerância, contado do último envio ou do início do monitoramento, o mais recente, no fuso de Brasília; um envio novo reinicia a contagem, e pausar o par (paciente ou formulário inativo, frequência retirada, paciente fora da lista) e voltar recomeça do zero. **Lembrete:** cada horário da agenda vigente de medicamento ativo com `remindersEnabled` gera um lembrete `info` (`<medicamento> <dose> <unidade> às <HH:mm>.`); paciente inativo consome o horário sem lembrete, e editar a agenda ou inativar o medicamento cancela o que ainda não saiu. **Redis só agenda:** a fila BullMQ `automation` tem os schedulers `absence-sweep` e `medication-reminder-sweep` (60 s); o estado (pares monitorados e cursores) fica no PostgreSQL, cada item é travado com `SKIP LOCKED` e chaves únicas por prazo e por horário impedem repetição. Atraso ou queda do worker ou do Redis só adiam: na volta, cada prazo e horário vencido sai uma vez, com o instante esperado guardado e `generatedAt` mostrando quando saiu. A entrega aos usuários é do BE-17 (seção seguinte). Auditoria `alert.generated` como evento de sistema (`source`, `formId` + `dueAt` ou `medicationId` + `reminderId` + `scheduledAt`, `severity`), sem valor clínico.

### Notificações, leitura e resolução

BE-17, 2026-11-06; RF014, RF016; UC13 passos 3 e 5 e fluxo alternativo; decisões de Mateus.

**Destinatários.** Todo alerta, das três origens, escolhe os destinatários **na mesma transação** que o grava:

- os usuários com vínculo vigente e autorizado com o paciente: profissional responsável, cuidadores e familiares, com usuário ativo e perfil compatível com o papel;
- os administradores ativos que ligaram o opt-in `organizationAlerts` ("Administrador, quando configurado"). Quem é as duas coisas recebe uma vez.

Profissional sem vínculo não é notificado, mas lê os alertas da organização em `GET /alerts`. Quem ganha vínculo depois não recebe notificação de alerta antigo. Alertas anteriores à migration `1791500000000` não têm notificação.

**Canais.** Cada usuário recebe conforme as [preferências](endpoints/notifications-preferencias-consultar.md): uma matriz **origem × canal**, todas ligadas por padrão. As origens são `reading`, `absence` e `medicationReminder`; os canais são `inApp`, `push` e `email`.

- **Caixa interna:** [GET /notifications](endpoints/notifications-listar.md) e o [contador](endpoints/notifications-contar-nao-lidas.md).
- **Push do navegador (PWA):** o usuário permite no navegador e o frontend [inscreve](endpoints/notifications-push-inscrever.md) o navegador com a chave de [push/config](endpoints/notifications-push-config.md). O push chega com o app fechado. O endpoint precisa ser de serviço de push conhecido (Google, Mozilla, Microsoft, Apple); o frontend [revoga](endpoints/notifications-push-revogar.md) antes do logout.
- **E-mail:** sai pelo SMTP do projeto, para o e-mail de login.

**Preferência desligada** não apaga nem esconde o alerta: ele continua em [GET /alerts](endpoints/alerts-listar.md) (UC13, fluxo alternativo). Com as três chaves de uma origem desligadas, o usuário não recebe nada dessa origem.

**Conteúdo fora do sistema.** Push e e-mail aparecem na tela bloqueada e na caixa de e-mail, então levam só tipo, severidade e nome do paciente. Nunca valor, parâmetro, regra, formulário ou medicamento.

**Entrega.** A fila BullMQ `notifications` roda o scheduler `notification-delivery-sweep` a cada 10 s; o estado fica em `notification_deliveries` no PostgreSQL. Cada envio é reservado com `SKIP LOCKED` e **reconferido** antes de sair. Fica `skipped`, com o motivo, quando:

- o usuário foi inativado, perdeu o vínculo ou deixou de ser admin com opt-in (`RECIPIENT_REVOKED`);
- a preferência foi desligada (`PREFERENCE_DISABLED`);
- a inscrição foi revogada (`PUSH_SUBSCRIPTION_REVOKED`);
- o alerta foi resolvido (`ALERT_RESOLVED`);
- a organização foi inativada (`ORGANIZATION_INACTIVE`; organização inativa também não gera notificação nova);
- o canal está desligado no servidor (`CHANNEL_DISABLED`). Hoje o SMTP está desligado e o push só liga com chaves VAPID.

Falha temporária (rede, `429`, `5xx`, SMTP `4xx`) tenta de novo após 1 min, 5 min, 30 min e 2 h, até 5 tentativas; falha definitiva fica `failed`. Inscrição expirada (`404`/`410`) é revogada. Não há promessa de exatamente uma vez: uma queda entre o envio e a gravação pode repetir um push ou e-mail.

**Leitura e resolução.** A leitura é **individual**, inclusive do familiar: [uma](endpoints/notifications-marcar-lida.md) ou [todas](endpoints/notifications-marcar-todas-lidas.md), e aparece em `notification.readAt` de `GET /alerts`. [Resolver](endpoints/alerts-resolver.md) é do alerta e vale para todos, com autor e data, pela permissão nova `alerts:resolve` (admin, profissional e cuidador, no próprio alcance; o familiar não resolve). `GET /alerts` filtra por `status`.

**Alcance.** A caixa mostra só pacientes ainda ao alcance: a revogação do vínculo esconde também as notificações antigas.

**Auditoria.** Grava `alert.resolved`, `notification_preferences.updated` (chaves alteradas) e `push_subscription.created|revoked` (sem `endpoint`). Leitura e tentativas não são auditadas.

**Fora do escopo.** Relatório diário, aviso de acesso do familiar, "medicação pendente após 30 min", 2FA e sessão de 30 min (Figura 46, P28); aviso de plano vencido.

### Administração da plataforma

Existe uma única **organização de plataforma** (`kind = platform`), sem plano e sempre ativa. Os usuários dela com perfil `platform_admin` são os **administradores master**: cadastram, listam, consultam, editam, inativam e reativam as organizações clientes pelas rotas `/api/v1/organizations`. O master faz login como qualquer usuário, com o código da organização de plataforma. A primeira conta nasce de `npm run seed:platform`. Desde o BE-23 o master também tem `audit_events:read` e `audit_events:export` e consulta a auditoria de **todas** as organizações ([Auditoria](#auditoria)).

Permissões com prefixo `platform_` (`platform_organizations:create`, `:read`, `:update`, `:change_status`) **só valem** em sessão da organização de plataforma: concedidas a um perfil de organização cliente, são descartadas ao resolver a sessão. O administrador de uma organização cliente usa `/api/v1/organizations/me` com `organization:read` e `organization:update`.

### Auditoria de acesso

Todo evento de acesso é gravado em `audit_events`, sempre dentro de uma organização e na mesma transação da escrita que o originou, com o perfil do autor e o IP do cliente desde o BE-23. A consulta e a exportação estão em [Auditoria](#auditoria) (BE-23, RF017, UC06).

| `action` | Origem |
| --- | --- |
| `auth.login_succeeded` | Login aceito em conta sem troca pendente. |
| `auth.login_failed` | Login recusado, quando o código corresponde a uma organização existente. Com autor se o e-mail é de uma conta dela; como evento de sistema se não é. |
| `auth.first_access_started` | Login aceito em conta com troca obrigatória. |
| `auth.first_access_completed` | Senha definitiva gravada pela sessão restrita. |
| `auth.logout` | Sessão encerrada pelo próprio usuário. |
| `auth.password_changed` | Troca da própria senha. |
| `auth.password_recovered` | Senha redefinida por token de recuperação. |
| `auth.admin_password_reset` | Senha temporária emitida por administrador. |
| `organization.platform_seeded` | Organização de plataforma e primeiro master criados por `npm run seed:platform`. Evento de sistema. |
| `organization.created` | Organização cliente cadastrada pelo master. |
| `user.created` | Primeiro administrador criado junto com a organização; `after_values.reason = "first_administrator"`. |
| `organization.updated` | Dados cadastrais alterados; `after_values.changedFields` lista só os **nomes** dos campos. |
| `organization.deactivated` | Organização inativada; sessões e links de recuperação dela revogados. |
| `organization.reactivated` | Organização reativada. |
| `plan.assigned` | Termo de plano aberto pelo master (atribuição ou aprovação); `entity_type = organization_plan_term`, `after_values` com `usagePlanId`, `endsAt`, `userLimit`, `patientLimit` e, na aprovação, `changeRequestId`. |
| `plan_expiry_notice.generated` | Aviso de vencimento do plano gerado pelo job das 08:00 (BE-28); evento de sistema, `entity_type = organization_plan_term`, `after_values` com `milestone` (`seven_days`, `one_day` ou `expired`), `endsAt` e `recipients` (quantidade de administradores), sem e-mail. Gravidade `warning`. |
| `patient.created` | Paciente cadastrado; `after_values.responsibleUserId`. |
| `patient.updated` | Dados alterados; `after_values.fields` lista só os **nomes** dos campos. |
| `patient.responsible_changed` | Responsável trocado; `after_values` com `fromUserId` e `toUserId`. |
| `patient.deactivated` | Paciente inativado. |
| `patient.reactivated` | Paciente reativado. |
| `form.created` | Formulário criado em rascunho; `entity_type = follow_up_form`, `after_values` com `audience` e `fieldCount`. |
| `form.updated` | Dados ou público alterados; `after_values.fields` lista só os **nomes** das propriedades, mais `patientsAdded`/`patientsRemoved` (ids) quando a lista mudou. |
| `form.draft_saved` | Rascunho da próxima versão salvo; `after_values.fieldCount`. |
| `form.draft_discarded` | Rascunho descartado. |
| `form.published` | Rascunho publicado; `after_values` com `versionNumber` e `impactConfirmed`. |
| `form.deactivated` | Formulário desativado. |
| `form.reactivated` | Formulário reativado. |
| `follow_up_attachment.created` | Anexo enviado; `entity_type = follow_up_attachment`, `after_values` com `followUpId`, `fileName`, `contentType`, `sizeBytes`. |
| `follow_up_attachment.removed` | Anexo removido; `after_values` com `followUpId`, `fileName`, `contentType`, `sizeBytes`, `ownAttachment`. |
| `plan_change_request.created` | Solicitação registrada pelo administrador; `after_values.requestedPlanId`. |
| `plan_change_request.cancelled` | Solicitação cancelada pelo administrador. |
| `plan_change_request.approved` | Solicitação aprovada pelo master. |
| `plan_change_request.rejected` | Solicitação recusada pelo master. |

Ação do master sobre outra organização gera **duas** linhas com o mesmo `request_id`: uma na organização alvo, como evento de sistema com `after_values.platformActorUserId`, porque a FK de autoria só aceita autor da própria organização; e outra na organização de plataforma, com o master como autor.

O evento guarda organização, autor, ação, entidade, `request_id` e o momento. **Nada digitado na requisição entra ali**: nem e-mail, nem senha, nem IP. A única exceção é o nome original do arquivo nos eventos de anexo, por decisão de Mateus (2026-11-05), mesmo sendo texto livre. Para investigar uma tentativa, correlacione o `request_id` do evento com o log estruturado da mesma requisição. O log HTTP mascara o parâmetro de query `search` (na URL e na query interpretada) como `[Redacted]`, porque a busca de usuários recebe nome ou e-mail.

## Contrato transversal

Toda rota sob `/api` compartilha o mesmo envelope de sucesso e o mesmo formato de erro. As exceções estão listadas adiante.

### Envelope de sucesso

```json
{
  "data": { "id": "7f3a", "fullName": "Ana Souza" },
  "meta": { "requestId": "01J8X", "timestamp": "2026-09-17T12:00:00.000Z" }
}
```

Listagem paginada acrescenta `meta.pagination`:

```json
{
  "data": [{ "id": "7f3a" }, { "id": "91bd" }],
  "meta": {
    "requestId": "01J8Y",
    "timestamp": "2026-09-17T12:00:01.000Z",
    "pagination": { "page": 2, "limit": 20, "total": 143, "totalPages": 8 }
  }
}
```

Escrita pode acrescentar `meta.message`:

```json
{
  "data": { "id": "c40e" },
  "meta": {
    "requestId": "01J8Z",
    "timestamp": "2026-09-17T12:00:02.000Z",
    "message": "Paciente cadastrado com sucesso."
  }
}
```

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `data` | objeto, lista ou `null` | Conteúdo da operação. Operação sem conteúdo devolve `200` com `data: null`, não `204`; a única exceção é a remoção de anexo (`DELETE`, `204` sem corpo), decidida por Mateus em 2026-11-05. |
| `meta.requestId` | texto | Identificador de correlação com o log. Sempre presente. Um `X-Request-Id` recebido no formato `[A-Za-z0-9-]{16,64}` (por exemplo o de um proxy nginx) é adotado, para correlacionar com o log do proxy; header ausente ou fora do formato gera um UUID. |
| `meta.timestamp` | texto ISO 8601 | Momento em que a resposta foi construída. Sempre presente. |
| `meta.message` | texto, opcional | Texto amigável em português definido pelo caso de uso: confirmação de escrita ou aviso de resultado vazio (orientação de quem não tem vínculo, ausência de dados no período). Exibível ao usuário; o frontend não deve tomar decisão comparando o texto. |
| `meta.pagination` | objeto, opcional | `page`, `limit`, `total` e `totalPages`. Só em resultado paginado. |

### Rotas fora do envelope

| Rota | Motivo |
| --- | --- |
| `GET /health/live` | Mantém o formato do indicador de saúde. |
| `GET /health/ready` | Mantém o relatório de dependências, com `status`, `info`, `error` e `details`. |
| `GET /api/docs` | HTML da interface Swagger. |
| `GET /api/docs-json` | Documento OpenAPI, formato fixado pela especificação. |
| `GET /api/v1/follow-ups/:followUpId/attachments/:attachmentId/content` | Conteúdo binário do anexo; os erros continuam no formato JSON. |
| `DELETE /api/v1/follow-ups/:followUpId/attachments/:attachmentId` | `204 No Content`, sem corpo. |
| `GET /api/v1/patients/:patientId/report/pdf` | PDF binário do relatório; os erros continuam no formato JSON. |
| `GET /api/v1/management-reports/alerts/pdf` | PDF binário do relatório de alertas; os erros continuam no formato JSON. |
| `GET /api/v1/management-reports/caregivers/pdf` | PDF binário da atividade dos cuidadores; os erros continuam no formato JSON. |
| `GET /api/v1/audit-events/export` | CSV da auditoria (UTF-8 com BOM); os erros continuam no formato JSON. |

### Formato de erro

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      { "field": "email", "code": "IS_EMAIL", "message": "Informe um e-mail valido." },
      { "field": "idade", "code": "MIN", "message": "idade must not be less than 0" }
    ]
  },
  "meta": {
    "requestId": "01J8Y",
    "timestamp": "2026-09-17T12:00:01.000Z",
    "path": "/api/v1/pacientes",
    "method": "POST",
    "status": 422
  }
}
```

Erro inesperado suprime o `detail` e não expõe a causa:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Nao foi possivel concluir a operacao. Tente novamente.",
    "detail": null,
    "fields": null
  },
  "meta": {
    "requestId": "01J8Z",
    "timestamp": "2026-09-17T12:00:02.000Z",
    "path": "/api/v1/pacientes",
    "method": "GET",
    "status": 500
  }
}
```

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `error.code` | texto | Código estável no formato `DOMINIO_MOTIVO`, em SCREAMING_SNAKE. É contrato com o frontend: trate por `code`, nunca comparando `message`. |
| `error.message` | texto | Mensagem amigável, em português, exibível ao usuário final. |
| `error.detail` | texto ou `null` | Frase técnica escrita pela aplicação. Nunca stack, nunca mensagem crua de driver, nunca valor de campo clínico ou de identidade. `null` em erro inesperado. |
| `error.fields` | lista ou `null` | Um item por restrição violada, com `field`, `code` e `message` opcional. Campo aninhado aparece como `pai.filho`. |
| `meta.requestId` | texto | Correlação com o log do servidor. Cite-o ao reportar um erro. |
| `meta.timestamp` | texto ISO 8601 | Momento em que o filtro construiu a resposta. |
| `meta.path` | texto | URL requisitada, incluindo query string. |
| `meta.method` | texto | Método HTTP da requisição. |
| `meta.status` | inteiro | Código HTTP retornado, repetido no corpo. |

### Códigos HTTP

| Status | Uso |
| --- | --- |
| `202` | Pedido aceito sem afirmar o efeito, como a solicitação de recuperação de senha. |
| `400` | Corpo malformado ou JSON inválido. Parâmetro de rota fora do formato responde `422`. |
| `401` | Não autenticado: token ausente, expirado, revogado ou de tipo incompatível com a rota. |
| `403` | Autenticado sem permissão de perfil ou sem vínculo com o paciente. |
| `404` | Recurso inexistente **ou** pertencente a outra organização. A API não distingue os dois casos de propósito. |
| `409` | Conflito de estado: duplicidade, transição inválida, limite de plano atingido. |
| `413` | Arquivo acima do limite (anexos). |
| `415` | Conteúdo de arquivo fora dos tipos aceitos (anexos). |
| `422` | Validação de campo. O JSON está correto; os valores não. |
| `429` | Limite de requisições excedido. |
| `500` | Erro inesperado. `detail` é `null`. |
| `503` | Dependência indisponível, como Redis fora do ar na proteção contra abuso. |

Códigos transversais de `error.code`: `BAD_REQUEST`, `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`. Cada módulo declara os seus em `<modulo>.errors.ts` e a nota do endpoint lista os possíveis por status.

### Paginação, filtros e períodos

Toda listagem paginada recebe `page` (inteiro, mínimo 1, padrão 1) e `limit` (inteiro de 1 a 100, padrão 20) e devolve `meta.pagination` (`page`, `limit`, `total`, `totalPages`). Página além da última responde `200` com `data: []` e o `total` real. São paginadas: `GET /organizations`, `/plan-change-requests`, `/users`, `/patients`, `/patient-links`, `/patient-links/eligible-users`, `/forms`, `/follow-ups`, `/alert-rules`, `/alerts`, `/medications`, `/notifications` e `/audit-events`. Os anexos de um registro (no máximo 5) e o catálogo de planos saem inteiros, sem `meta.pagination`.

Filtros são parâmetros de query combinados com E; a nota de cada rota lista os aceitos, a ordenação fixa e os limites. Parâmetro desconhecido ou fora do formato responde `422 VALIDATION_FAILED` com o item em `fields`. Resultado vazio é sempre `200` com lista vazia, nunca `404`. Algumas leituras acrescentam `meta.message` quando não há dados — `GET /patients` (orientação a cuidador e familiar sem vínculo ou aviso de busca vazia), `/follow-ups`, `/patients/:id/overview`, `/patients/:id/evolution` (BE-29), `/audit-events` e o painel; a página além da última, com `total` maior que zero, não traz a mensagem.

Períodos (`from`/`to` em histórico, evolução, relatório, painel e auditoria) são dias `AAAA-MM-DD` inclusivos no fuso `America/Sao_Paulo`; a regra de padrão, máximo de 366 dias e `422 PERIOD_TOO_LONG` está na nota de cada rota. Instantes nas respostas saem em ISO 8601 UTC.

## Guia de integração dos clientes (desktop e mobile)

A mesma API e os mesmos contratos atendem o frontend React/PWA em computador, tablet e celular (RF019, RNF002). O backend não diferencia dispositivo nem navegador: não lê `User-Agent`, não tem rota ou formato por plataforma e não mantém estado de tela. Responsividade, layout e compatibilidade visual com Chrome, Edge, Safari e Firefox (RNF001–003) são validadas no frontend.

**Origem e CORS.** O frontend de outra origem só é aceito se estiver em `CORS_ORIGINS`; em produção, lista vazia desliga o CORS. O preflight libera `Authorization` e `Content-Type`, e a resposta expõe `Content-Disposition`, para o navegador entregar ao frontend o nome dos arquivos baixados. A sessão vai no header `Authorization: Bearer <token>`, não em cookie, então `CORS_CREDENTIALS` fica `false`.

**Sessão.** Faça login, guarde o token só pelo tempo da sessão e envie-o em toda rota protegida. `401` em qualquer chamada significa sessão encerrada (logout, expiração, inativação, organização inativada ou troca de senha): volte ao login. Com `data.state = password_change_required`, só [primeiro acesso](endpoints/auth-primeiro-acesso.md) e [logout](endpoints/auth-logout.md) respondem. `403` é falta de permissão do perfil; `404` cobre recurso inexistente, de outra organização ou de paciente sem vínculo, sem distinção.

**Sessão do usuário como cache.** Guarde `data.session` do login junto do token e use-o para montar o menu e redirecionar ao painel do perfil (`session.profile.code`), mostrar ou esconder ações (`session.permissions`) e esconder o painel e os relatórios gerenciais no plano sem `operational_dashboard` ou `management_reports` (`session.organization.plan.features`). O CPF do login vem mascarado; a tela de dados pessoais lê [GET /profile](endpoints/profile-consultar.md), que traz o completo. Recarregue a sessão por `GET /profile` depois de [editar o próprio cadastro](endpoints/profile-atualizar.md) (ou use o `data` da própria resposta), depois de o admin trocar o seu perfil e ao receber um `403` inesperado: as permissões são relidas a cada requisição, e a lista guardada pode ter ficado velha. Depois de trocar o e-mail, o login seguinte já usa o e-mail novo; a troca de senha encerra todas as sessões e exige login de novo. A sessão restrita traz `permissions: []` e só serve para exibir nome e organização na tela de primeiro acesso.

**Página de aceite do convite (BE-31).** Com o SMTP ligado, o convidado recebe por e-mail o link `INVITATION_ACCEPT_URL?token=<token>`. A página nessa URL:

1. lê `token` da query string da página e não o envia em URL da API nem o grava em log, analytics ou `localStorage`;
2. chama [POST /auth/invitations/inspect](endpoints/auth-convite-consultar.md) com `{ token }` no corpo e mostra nome, organização, perfil e validade. Um `422 AUTH_INVITATION_INVALID_OR_EXPIRED` significa link inválido, vencido, já usado ou revogado: mostre `error.message`, que orienta a pedir um novo convite ao administrador;
3. pede a senha (8 a 128 caracteres) e a confirmação, e chama [POST /auth/invitations/accept](endpoints/auth-convite-aceitar.md) com `{ token, newPassword }`;
4. no `200`, mostra `meta.message` e redireciona ao login com `organizationCode` e `email` da resposta já preenchidos. O aceite **não** abre sessão: o usuário entra pelo login, que devolve a sessão normal e o bloco `session`.

As duas rotas são públicas e somam um limite de 30 tentativas por IP por hora (`429 AUTH_TEMPORARILY_BLOCKED`). Enquanto o acesso for por IP, sem HTTPS, o link trafega sem criptografia.

**Tela de usuários (BE-31).** No cadastro e na reemissão, `data.channel` diz o que mostrar: `temporary_password` exibe a senha e `expiresAt` uma única vez; `email` exibe `meta.message`, que confirma o envio com a validade ou avisa a falha, e nunca traz senha. Trate `invitation.status = invalidated` como convite a reemitir e ofereça a opção "gerar senha provisória" (`channel: "temporary_password"`) para quem não recebe e-mail. Com o SMTP ligado, a resposta espera o servidor de e-mail; com o SMTP fora do ar, pode levar cerca de 30 s até `failed`.

**Erros por campo.** `422` traz `error.fields` com `field` (campo aninhado como `pai.filho`), `code` e `message`; use-os para marcar o campo no formulário. Os demais erros trazem só `error.code` estável e `error.message` exibível. Trate pelo `code`, cite `meta.requestId` ao reportar e espere `429 RATE_LIMITED` se o limite de requisições estourar.

**Lista vazia e `meta.message`.** Quando `data` vier vazio (ou, na visão consolidada e na evolução, sem registros e com `series: []`), exiba `meta.message` se ele existir, no lugar de uma tabela ou gráfico vazio; sem `meta.message`, use o texto padrão da tela. É assim que o familiar e o cuidador sem paciente vinculado veem a orientação para pedir acesso ao profissional responsável (UC14, BE-29) — a resposta é `200`, não um erro. O texto vem pronto em português; não compare o conteúdo para decidir fluxo.

```json
{
  "data": [],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-12T12:30:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 },
    "message": "Você ainda não tem paciente vinculado. Peça ao profissional responsável para liberar o seu acesso."
  }
}
```

**Envio de arquivo.** O anexo vai em `multipart/form-data`, campo `file`, um arquivo por requisição: JPEG, PNG, WEBP ou PDF detectados pelo conteúdo, até 10 MiB ([enviar anexo](endpoints/follow-up-attachments-enviar.md)).

**Downloads.** As rotas binárias são o [anexo](endpoints/follow-up-attachments-baixar.md), o [PDF do relatório](endpoints/patients-relatorio-pdf.md), os PDFs gerenciais ([alertas](endpoints/management-reports-alertas-pdf.md), [cuidadores](endpoints/management-reports-cuidadores-pdf.md)) e o [CSV da auditoria](endpoints/audit-events-exportar.md). Todas exigem Bearer, então o link direto não funciona: busque com `fetch` e o header, confira `response.ok` e o `Content-Type` (erro chega em JSON), leia o nome em `Content-Disposition: attachment; filename="..."` e entregue o `Blob` ao usuário. As respostas saem com `Cache-Control: private, no-store`, cada pedido é reautorizado, e PDF e CSV são gerados na hora: em falha (`500`), repita o pedido.

**Mesmo comportamento em qualquer cliente.** Paginação, filtros, períodos e o recorte por perfil (inclusive a visão mascarada do familiar) são aplicados no servidor e valem igual para desktop e mobile.

## Capacidades dos protótipos sem API

Os protótipos do TCC (Figuras 31–46) mostram elementos que **não têm rota nem dado na API**. O encaminhamento de cada um foi decidido por Mateus em 2026-11-11 (BE-26; P23–P28 e P32). Em 2026-11-12, o BE-30 reviu o item dos relatórios gerenciais, que passaram a existir; os demais continuam como estavam. O frontend deve omitir ou adaptar estes elementos, sem simular dados:

| Elemento da tela | Figura | Encaminhamento | O que o frontend usa |
| --- | --- | --- | --- |
| Link "Inscreva-se" | 31 | fora de escopo | nada; organizações são cadastradas pelo administrador master |
| Busca global "paciente, registro ou alerta" | 33–46 | adiada | `GET /patients?search` ou campo oculto; registros e alertas pelos filtros de `GET /follow-ups` e `GET /alerts` |
| Status Crítico/Observação, medições Normal/Atenção, estado "Estável" | 34, 36, 37 | fora de escopo (R04/R10) | só `status` cadastral `active`/`inactive`; alertas abertos e severidade podem aparecer como fatos, sem rótulo clínico |
| Medicamento "Suspenso" e "suspensa em" | 41 | mapeado, sem estado novo | `status = inactive` e `deactivatedAt`; reativar por `POST /medications/{medicationId}/reactivate` |
| "Há N dias" no medicamento | 41 | já atendido | calculado a partir de `startDate` |
| Condição associada ao medicamento | 41 | adiada | nada no medicamento; as condições ficam no paciente (`mainCondition`, `secondaryConditions`) |
| "Prescrever Med." | 41 | sem prescrição eletrônica | `POST /medications` (cadastro do UC08) |
| Próxima visita, agenda, "visita agendada não confirmada" | 37, 42 | adiada | nada; a cobrança de registro é o alerta de ausência (`source = absence`) |
| Adesão %, tomada, "medicamento não administrado" | 37, 41, 42 | adiada | nada; adesão pode ser um campo `scale` do formulário, que entra no histórico e na evolução |
| Lembrete de medicação pendente após 30 min | 46 | adiada | nada; o lembrete do horário (`source = medication_reminder`) continua |
| Formato XLSX | 43 | adiada | PDF gerado na hora |
| Relatório diário às 7h | 46 | adiada | nada |
| Aviso ao admin quando familiar acessa | 46 | aviso adiado | consulta pela auditoria: `GET /audit-events` com a ação `auth.login_succeeded` |
| 2FA dos administradores | 46 | adiada | nada; login só com e-mail e senha |
| Seletor "sessão máxima sem atividade" | 46 | valor fixo | informativo: 30 min sem atividade e 12 h absolutas, iguais para todos |
| Aba Integrações; plano "Pro - Clínica", armazenamento, registros/mês | 46 | fora de escopo / catálogo Basic e Enterprise | `GET /organizations/me/plan` |

Já atendidos pela API: relatórios Alertas e Intercorrências e Atividade dos Cuidadores (o "Eficiência" da Figura 43), filtro Condição, cards "N gerados" e lista de recentes (`/management-reports`, BE-30, plano Enterprise); logout (`POST /auth/logout`); resolver alerta, aba Resolvidos e marcar todos como lidos (`POST /alerts/{alertId}/resolve`, filtro `status`, `POST /notifications/read-all`); push e e-mail por preferência (`/notifications/preferences`), com o push indisponível no navegador enquanto o acesso for por IP sem HTTPS.

## Manutenção do manual

Ao criar ou alterar um endpoint, atualize controller/DTO/Swagger, a nota em `endpoints/`, esta tabela e exemplos de request/response na mesma tarefa. Valide exemplos contra o código e teste HTTP; registre no vault a tarefa e qualquer alteração frente a requisitos ou contratos anteriores em `09-sistemas/vitacare/evolucao/`. A tarefa só tem documentação alinhada quando o manual, OpenAPI e notas do vault descrevem o comportamento executado.

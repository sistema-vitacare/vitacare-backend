---
title: Manual de integração da API VitaCare
status: atual
updated: 2026-11-06
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
| `GET /api/v1/organizations/me` | Consulta a organização da sessão | [organizations-consultar-propria.md](endpoints/organizations-consultar-propria.md) |
| `PATCH /api/v1/organizations/me` | Atualiza a organização da sessão | [organizations-atualizar-propria.md](endpoints/organizations-atualizar-propria.md) |
| `POST /api/v1/organizations` | Cadastra organização e primeiro administrador (plataforma) | [organizations-criar.md](endpoints/organizations-criar.md) |
| `GET /api/v1/organizations` | Lista organizações clientes (plataforma) | [organizations-listar.md](endpoints/organizations-listar.md) |
| `GET /api/v1/organizations/:organizationId` | Consulta qualquer organização (plataforma) | [organizations-consultar.md](endpoints/organizations-consultar.md) |
| `PATCH /api/v1/organizations/:organizationId` | Atualiza qualquer organização (plataforma) | [organizations-atualizar.md](endpoints/organizations-atualizar.md) |
| `POST /api/v1/organizations/:organizationId/deactivate` | Inativa organização (plataforma) | [organizations-inativar.md](endpoints/organizations-inativar.md) |
| `POST /api/v1/organizations/:organizationId/reactivate` | Reativa organização (plataforma) | [organizations-reativar.md](endpoints/organizations-reativar.md) |
| `GET /api/v1/access-profiles` | Lista os perfis de acesso da organização e suas permissões | [access-profiles-listar.md](endpoints/access-profiles-listar.md) |
| `POST /api/v1/users` | Cadastra usuário pendente e devolve a senha provisória do convite | [users-criar.md](endpoints/users-criar.md) |
| `GET /api/v1/users` | Lista os usuários da organização | [users-listar.md](endpoints/users-listar.md) |
| `GET /api/v1/users/:userId` | Consulta um usuário da organização | [users-consultar.md](endpoints/users-consultar.md) |
| `PATCH /api/v1/users/:userId` | Edita nome, e-mail, CPF ou telefone | [users-atualizar.md](endpoints/users-atualizar.md) |
| `POST /api/v1/users/:userId/deactivate` | Inativa o usuário e revoga o acesso | [users-inativar.md](endpoints/users-inativar.md) |
| `POST /api/v1/users/:userId/reactivate` | Reativa o usuário, respeitando o limite do plano | [users-reativar.md](endpoints/users-reativar.md) |
| `POST /api/v1/users/:userId/invitation` | Reemite o convite de usuário pendente | [users-reemitir-convite.md](endpoints/users-reemitir-convite.md) |
| `PATCH /api/v1/users/:userId/profile` | Troca o perfil de acesso de um usuário da organização | [users-alterar-perfil.md](endpoints/users-alterar-perfil.md) |
| `POST /api/v1/patients` | Cadastra paciente com o profissional responsável | [patients-criar.md](endpoints/patients-criar.md) |
| `GET /api/v1/patients` | Lista os pacientes ao alcance da sessão (ativos por padrão) | [patients-listar.md](endpoints/patients-listar.md) |
| `GET /api/v1/patients/:patientId` | Consulta um paciente, ativo ou inativo | [patients-consultar.md](endpoints/patients-consultar.md) |
| `GET /api/v1/patients/:patientId/overview` | Visão consolidada: contadores, últimas medições, medicamentos ativos e alertas recentes | [patients-visao-consolidada.md](endpoints/patients-visao-consolidada.md) |
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

Todo usuário de organização cliente tem um de quatro **perfis fixos**: `admin`, `professional`, `caregiver` e `family`. O catálogo de permissões e a matriz de cada perfil são consultados em [GET /access-profiles](endpoints/access-profiles-listar.md); o administrador troca o perfil de um usuário por [PATCH /users/:userId/profile](endpoints/users-alterar-perfil.md). As permissões são relidas do banco a cada requisição, então a troca vale na chamada seguinte do usuário, sem revogar a sessão.

### Usuários e convite sem e-mail

O administrador da organização gerencia os usuários do próprio tenant pelas rotas `/api/v1/users` (BE-06, 2026-11-03). Como não há SMTP, o **convite** é uma senha provisória devolvida uma única vez no [cadastro](endpoints/users-criar.md): o administrador a entrega fora da API, o usuário nasce `pending`, entra só pela sessão restrita e vira `active` ao concluir o [primeiro acesso](endpoints/auth-primeiro-acesso.md). A senha vale 24 horas; vencida ou perdida, o administrador a [reemite](endpoints/users-reemitir-convite.md), e a anterior para de valer. Usuários `pending` e `active` — o primeiro administrador incluído — contam no limite de usuários efetivo do plano (personalizado do termo de vigência, senão `usage_plans.user_limit`), verificado no cadastro e na reativação; com a vigência vencida, ambos são bloqueados. [Inativar](endpoints/users-inativar.md) revoga sessões, links de recuperação e convite na hora, sem apagar histórico; não existe exclusão.

Rotas públicas de autenticação: login, solicitação de recuperação e redefinição por token. Todo o resto exige Bearer, e o OpenAPI marca isso no esquema `bearer`.

> **Não existe SMTP configurado em nenhum ambiente** (decisão de 2026-09-22). A solicitação de recuperação responde `202` com `meta.message` orientando a procurar o administrador, mas não cria token nem envia mensagem. O canal operacional de recuperação é a [redefinição administrativa](endpoints/auth-redefinir-senha-usuario.md) (recuperação assistida, 2026-10-29): senha temporária válida por 24 horas, reemitida pelo administrador quando vence ou se perde. O envio por link passa a valer apenas quando houver servidor de e-mail.

A senha tem de 8 a 128 **caracteres**, aceita espaços e Unicode e não tem regra de composição. O armazenamento usa Argon2id.

### Plano de uso, vigência e solicitação de mudança

O [catálogo](endpoints/plans-listar.md) segue o **Quadro 2 do TCC** (decisão de Mateus em 2026-11-04): **Basic**, até 10 usuários e 200 pacientes ativos, limites fixos, R$ 499,00/mês; **Enterprise**, até 50 usuários e 1.000 pacientes ativos, expansível conforme contratação, R$ 1.990,00/mês mais adicional conforme volume. O preço é informativo. Cada organização cliente tem um **termo de vigência** corrente (BE-07): plano, início, fim opcional e, só no Enterprise, limites expandidos (nunca abaixo do catálogo). O **limite efetivo** é o expandido, senão o do catálogo. O administrador consulta tudo em [GET /organizations/me/plan](endpoints/plans-consultar-proprio.md) e pede outro plano por [POST /plan-change-requests](endpoints/plan-change-requests-criar.md); o plano só muda quando o master [aprova](endpoints/plan-change-requests-aprovar.md). O master também [atribui, renova ou expande](endpoints/plans-atribuir.md) diretamente. Com a vigência vencida, a leitura e o registro continuam; só novos cadastros e reativações de usuário e de paciente são bloqueados (`409 USER_PLAN_EXPIRED` / `PATIENT_PLAN_EXPIRED`). O **consumo** exibido (`usage`) e o limite aplicado usam a mesma contagem (BE-08); limite abaixo do uso, após rebaixamento, só impede crescer, sem inativar ninguém. O limite de pacientes conta pacientes **ativos** e vale no cadastro e na reativação de pacientes (BE-09); `usage.patients` usa a mesma contagem. Não há pagamento, cobrança nem renovação automática. Vigência, vencimento e fluxo de decisão são decisões do agente de 2026-11-03, pendentes de confirmação de Mateus.

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

O registro filtrado sai completo. Período sem registro é `200` com lista vazia e `total: 0`.

A [visão consolidada](endpoints/patients-visao-consolidada.md) (`GET /patients/:patientId/overview`, Figura 36) reúne numa chamada:
- os contadores: registros válidos, alertas abertos e medicamentos ativos;
- a última visita;
- os 5 últimos valores de cada campo `number`/`scale` de registros válidos, sem classificação clínica;
- até 10 medicamentos ativos e os 5 alertas mais recentes, nos formatos de `GET /medications` e `GET /alerts`.

Blocos de medicamento e alerta saem `null` para quem não tem `medications:read` ou `alerts:read`.

As duas rotas exigem `patient_history:read` e o mesmo alcance de paciente: admin e profissional na organização inteira, cuidador e familiar só com vínculo vigente. O familiar não vê registros anulados no histórico (BE-19); a visão consolidada já conta só os válidos. Fora do alcance, a resposta é `404 PATIENT_NOT_FOUND` antes de qualquer contagem. O histórico de paciente inativo continua legível.

### Visão do familiar

O familiar acompanha o paciente vinculado **só lendo**, pelas mesmas rotas dos outros perfis (BE-19, 2026-11-06; RF016; UC14; decisões de Mateus). Não há rota própria. O painel é a [visão consolidada](endpoints/patients-visao-consolidada.md), os registros recentes são o [histórico](endpoints/follow-ups-listar.md), e os alertas vêm de [GET /alerts](endpoints/alerts-listar.md) e da [caixa de notificações](endpoints/notifications-listar.md).

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
- **Sem vínculo:** `GET /patients` devolve lista vazia; a mensagem orientativa ("solicite permissão ao profissional responsável") fica com o frontend.

**Fora do escopo:** próxima visita e adesão (Figura 37) dependem do BE-26; gráficos com fórmulas de evolução, do BE-20.

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

Existe uma única **organização de plataforma** (`kind = platform`), sem plano e sempre ativa. Os usuários dela com perfil `platform_admin` são os **administradores master**: cadastram, listam, consultam, editam, inativam e reativam as organizações clientes pelas rotas `/api/v1/organizations`. O master faz login como qualquer usuário, com o código da organização de plataforma. A primeira conta nasce de `npm run seed:platform`.

Permissões com prefixo `platform_` (`platform_organizations:create`, `:read`, `:update`, `:change_status`) **só valem** em sessão da organização de plataforma: concedidas a um perfil de organização cliente, são descartadas ao resolver a sessão. O administrador de uma organização cliente usa `/api/v1/organizations/me` com `organization:read` e `organization:update`.

### Auditoria de acesso

Todo evento de acesso é gravado em `audit_events`, sempre dentro de uma organização e na mesma transação da escrita que o originou. A consulta e a exportação desses registros são objeto da tarefa 14 (RF017, UC06); hoje eles apenas são gravados e **nenhuma rota os devolve**.

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
| `meta.message` | texto, opcional | Confirmação amigável definida pelo caso de uso. |
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

### Paginação

`PaginationQueryDto` vale para toda rota de listagem: `page` inteiro mínimo 1, padrão 1; `limit` inteiro de 1 a 100, padrão 20. O resultado alimenta `meta.pagination`. **Nenhuma rota atual recebe esses parâmetros.** Cada rota futura documenta seus próprios filtros, ordenação e limites antes de ser publicada.

## Manutenção do manual

Ao criar ou alterar um endpoint, atualize controller/DTO/Swagger, a nota em `endpoints/`, esta tabela e exemplos de request/response na mesma tarefa. Valide exemplos contra o código e teste HTTP; registre no vault a tarefa e qualquer alteração frente a requisitos ou contratos anteriores em `09-sistemas/vitacare/evolucao/`. A tarefa só tem documentação alinhada quando o manual, OpenAPI e notas do vault descrevem o comportamento executado.

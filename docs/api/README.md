---
title: Manual de integração da API VitaCare
status: atual
updated: 2026-11-04
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
| `GET /api/v1/follow-ups` | Lista os registros de um paciente ao alcance, da visita mais recente para a mais antiga | [follow-ups-listar.md](endpoints/follow-ups-listar.md) |
| `GET /api/v1/follow-ups/:followUpId` | Consulta um registro com as respostas e os campos da versão respondida | [follow-ups-consultar.md](endpoints/follow-ups-consultar.md) |
| `POST /api/v1/follow-ups/:followUpId/annul` | Anula um registro com motivo, preservando-o no histórico | [follow-ups-anular.md](endpoints/follow-ups-anular.md) |
| `POST /api/v1/follow-ups/:followUpId/attachments` | Anexa um arquivo (JPEG, PNG, WEBP ou PDF, até 10 MB) ao registro; só o cuidador autor, até 5 por registro | [follow-up-attachments-enviar.md](endpoints/follow-up-attachments-enviar.md) |
| `GET /api/v1/follow-ups/:followUpId/attachments` | Lista os anexos ativos de um registro ao alcance | [follow-up-attachments-listar.md](endpoints/follow-up-attachments-listar.md) |
| `GET /api/v1/follow-ups/:followUpId/attachments/:attachmentId/content` | Baixa o arquivo (binário, fora do envelope), reautorizado a cada chamada | [follow-up-attachments-baixar.md](endpoints/follow-up-attachments-baixar.md) |
| `DELETE /api/v1/follow-ups/:followUpId/attachments/:attachmentId` | Remove o anexo e apaga o arquivo (`204`) | [follow-up-attachments-remover.md](endpoints/follow-up-attachments-remover.md) |
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

Administradores e profissionais vinculam cuidadores e familiares a pacientes pelas rotas `/api/v1/patient-links` (BE-10, 2026-11-04; RF005/RF016; UC03/UC07/UC14; decisões de Mateus). O papel vem do perfil do usuário (`caregiver` ou `family`); um paciente tem quantos cuidadores e familiares precisar, com um vínculo vigente por par usuário–paciente. O vínculo vale até ser revogado, sem data de término; revogar grava `deleted_at`, preserva a linha e corta o acesso na requisição seguinte. A listagem inclui o vínculo de responsável, que só muda na edição do paciente. Trocar o perfil de um usuário revoga os vínculos de cuidado que não cabem no novo perfil; inativar o usuário não revoga. Cuidador e familiar vinculados leem o cadastro completo do paciente até o BE-19 e não escrevem. O seletor [GET /patient-links/eligible-users](endpoints/patient-links-usuarios-elegiveis.md) devolve só id, nome, perfil e status, para o profissional escolher responsável, cuidador ou familiar sem `users:read`. Auditoria `patient_link.created|updated|revoked`, sem o conteúdo de tipo e observação.

### Formulários de acompanhamento

Profissionais e administradores montam os formulários que o cuidador preencherá nas visitas pelas rotas `/api/v1/forms` (BE-11, 2026-11-04; RF008, RF013 na parte de formulário; UC09; decisões de Mateus). O formulário é **versionado**: nasce em rascunho, e [publicar](endpoints/forms-publicar.md) congela o rascunho como a versão N+1 vigente; versões publicadas e seus campos nunca mudam, e as respostas (BE-12) ficam presas à versão que responderam. Editar um publicado é [salvar um rascunho](endpoints/forms-salvar-rascunho.md) da próxima versão repetindo a `fieldKey` dos campos que continuam (a chave fixa o tipo do campo); publicar sobre uma versão vigente exige `confirmImpact: true` (`409 FORM_IMPACT_CONFIRMATION_REQUIRED`). O público é a organização inteira ou uma lista de pacientes ativos (`audience` `organization`/`patients`, sem entidade de grupo); a frequência esperada é opcional (`interval` de 1 a 365 em `hours`, `days` ou `weeks`) e não gera cálculo de ausência neste card. Há seis tipos de campo — `number` (casas decimais 0–3, unidade opcional, sem mínimo/máximo clínico), `scale` (inteiros de mínimo a máximo), `boolean`, `text`, `single_choice` e `multiple_choice` —, cada um obrigatório, opcional ou desabilitado; a **pressão arterial são dois campos `number`** (sistólica e diastólica, mmHg). Formulário sem campos é recusado (`422 FORM_EMPTY`), e rascunho só com campos desabilitados não é publicado. Nome, descrição, tipo de acompanhamento, frequência e público mudam por [PATCH](endpoints/forms-atualizar.md), sem nova versão. [Desativar](endpoints/forms-desativar.md) é a exclusão do UC09: preserva versões, campos, rascunho e lista de pacientes e bloqueia escrita (`409 FORM_INACTIVE`) até a [reativação](endpoints/forms-reativar.md). **Alcance:** `admin` e `professional` leem e configuram todos os formulários da organização; o `caregiver` só lê formulários ativos da organização inteira ou que listem paciente vinculado a ele, sem rascunho; o `family` recebe `403`. `parseFieldAnswer` (`src/modules/Form/parsers/fieldAnswer.parser.ts`) fixa o contrato de valor de cada tipo, em que `0` e `false` são valores e não ausência, e é aplicado pelo registro de acompanhamento (BE-12); regras de alerta por campo são do BE-15. Auditoria `form.created|updated|draft_saved|draft_discarded|published|deactivated|reactivated`, sem conteúdo de campo nem dado de paciente além do id.

### Registros de acompanhamento

O cuidador registra a visita pelas rotas `/api/v1/follow-ups` (BE-12, 2026-11-04; RF009; UC11; decisões de Mateus). [Registrar](endpoints/follow-ups-registrar.md) grava, numa transação, o registro (paciente, cuidador da sessão, `visitedAt` informado — padrão agora, nunca no futuro — e o envio em `submittedAt`, observações), a resposta (formulário e **versão vigente** respondidos; um formulário por registro) e um item por campo preenchido; falha em qualquer passo não deixa nada gravado. Só o `caregiver` registra, e só para paciente **ativo** com vínculo de cuidador vigente, em formulário **ativo** que valha para ele; o cliente envia `formVersionId`, e versão substituída durante o preenchimento é recusada (`409 FOLLOW_UP_FORM_VERSION_OUTDATED`). Envio sem nenhum valor é `422 FOLLOW_UP_EMPTY` (`0` e `false` são valores; as observações sozinhas não bastam); tipo, casas, escala, opções, campo desabilitado ou alheio e obrigatório ausente saem em `422 FOLLOW_UP_INVALID_ANSWERS` por campo; **valor fora de faixa clínica é gravado**, nunca recusado. Cancelar é não enviar. A avaliação de alertas é do BE-15 e não roda na transação: o registro nasce marcado como ainda não avaliado, sem risco de perder o dado clínico. Correção é por [anulação com motivo](endpoints/follow-ups-anular.md): o registro continua no histórico como `annulled`; o autor anula os próprios e `admin`/`professional` (permissão nova `follow_ups:annul`) anulam qualquer um, sem prazo e uma única vez. [Listar](endpoints/follow-ups-listar.md) (por `patientId`, filtro `status`) e [consultar](endpoints/follow-ups-consultar.md) exigem `patient_history:read`: `admin` e `professional` leem a organização inteira; `caregiver` e `family`, só pacientes vinculados (o familiar recebe o registro completo até o BE-19). Cada resposta sai com os metadados do campo **na versão respondida**. Filtros do histórico (UC12) são do BE-18. Auditoria `follow_up.created` (`formId`, `formVersionId`, `itemCount`) e `follow_up.annulled` (`ownRecord`, `reasonLength`), sem valores clínicos nem o texto do motivo.

### Anexos de registro

O cuidador anexa fotos e documentos ao registro de acompanhamento pelas rotas `/api/v1/follow-ups/:followUpId/attachments` (BE-13, 2026-11-05; RF009/RF016; UC11; decisões de Mateus). O TCC previa S3; por decisão de Mateus o arquivo fica num **volume Docker privado** da API (`vitacare-storage`, montado em `STORAGE_PATH`), sem URL pública: todo download passa pela API e é reautorizado a cada chamada. [Enviar](endpoints/follow-up-attachments-enviar.md) é `multipart/form-data` com uma única parte `file`, **depois** do registro, só pelo `caregiver` **autor** do registro, com vínculo vigente, registro válido (não anulado) e paciente ativo, sem prazo. Aceita **JPEG, PNG, WEBP e PDF** reconhecidos pelo **conteúdo** (não pela extensão), até **10 MB** (10 485 760 bytes), **5 anexos ativos** por registro. O arquivo só é gravado depois de todas as checagens, dentro da transação, e é apagado se a transação falhar. [Listar](endpoints/follow-up-attachments-listar.md) e [baixar](endpoints/follow-up-attachments-baixar.md) exigem `patient_history:read` no alcance do registro (familiar vinculado incluído até o BE-19). O download é binário, `Content-Disposition: attachment` e `Cache-Control: private, no-store`. [Remover](endpoints/follow-up-attachments-remover.md) (`204`) cabe ao autor ou a `admin`/`professional` (`follow_ups:annul`): a linha recebe `deleted_at` e o arquivo é apagado do volume. Anexos de registro anulado ou de paciente inativo continuam legíveis. Auditoria `follow_up_attachment.created` e `follow_up_attachment.removed` com o **nome do arquivo** (decisão de Mateus).

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

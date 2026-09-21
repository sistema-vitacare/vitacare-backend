# Módulo Auth — Design

**Data:** 2026-09-21  
**Escopo:** RF001, RF002, UC01 e UC02  
**Estado:** aprovado por Mateus em 2026-09-21

## Objetivo

Implementar autenticação multi-organização com primeiro acesso obrigatório,
sessões revogáveis, logout, troca de senha, recuperação por e-mail e
redefinição administrativa. A entrega deve preservar o isolamento entre
organizações, impedir enumeração de contas, registrar eventos de segurança sem
segredos e manter código, OpenAPI, manual da API e vault sincronizados.

O módulo não cria autocadastro público nem fluxo comercial de onboarding. O
primeiro administrador é provisionado por comando operacional, e usuários
posteriores são cadastrados administrativamente com senha temporária. O envio
de convite fica fora desta entrega.

## Decisões de produto

- Não haverá inscrição pública de organização ou administrador.
- O bootstrap cria organização e primeiro administrador de forma atômica.
- Usuários recebem senha temporária e precisam substituí-la no primeiro login.
- O login recebe `organizationCode`, `email` e `password`, pois o e-mail é
  único apenas dentro da organização.
- `organizationCode` é público, único, normalizado em minúsculas e imutável
  pela API. Aceita de 3 a 50 caracteres no padrão
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- A recuperação autônoma usa link com token opaco, de uso único, válido por 15
  minutos e enviado por SMTP quando essa integração estiver habilitada.
- SMTP pode permanecer desabilitado no ambiente atual sem impedir o boot ou o
  deploy. Testes usam um entregador falso e não dependem de servidor externo.
- Administrador autorizado pode redefinir a senha de outro usuário da mesma
  organização. A operação gera senha temporária e exige troca no próximo
  login.
- Senhas usam Argon2id, aceitam entre 8 e 128 caracteres, espaços e Unicode e
  não exigem regras artificiais de composição.
- A aplicação permite múltiplas sessões simultâneas por usuário.

## Abordagem arquitetural

Sessões serão stateful e usarão tokens Bearer opacos. O cliente recebe um
segredo aleatório de 256 bits; apenas seu hash criptográfico fica no
PostgreSQL. O guard consulta a sessão e o estado corrente do usuário e da
organização em cada requisição. Assim, logout, inativação e troca de senha
revogam acesso imediatamente, sem lista adicional de revogação de JWT.

PostgreSQL é a fonte de verdade de sessões, tokens de recuperação e auditoria.
Redis guarda somente contadores efêmeros de abuso. Se Redis estiver
indisponível, login e recuperação falham com `503`, pois não é seguro liberar
tentativas ilimitadas. SMTP fica atrás de uma interface de entrega com
implementação real configurável e implementação falsa para testes.

O módulo `Auth` concentra os casos de uso e as bordas de autenticação. Acesso a
dados fica em repositórios do módulo; controllers conhecem apenas HTTP, DTOs,
Swagger e casos de uso. Entidades nunca são retornadas pela API. O guard monta
`RequestContext` com usuário, organização, perfil e permissões obtidos do
estado persistido, nunca de identificadores fornecidos pelo cliente como prova
de autorização.

## Componentes

O módulo terá casos de uso separados para:

- `Login`;
- `Logout`;
- `CompleteFirstAccess`;
- `ChangePassword`;
- `RequestPasswordRecovery`;
- `ResetPassword`;
- `ResetUserPasswordAsAdmin`.

Responsabilidades compartilhadas ficam fora das pastas dos casos de uso:

- `PasswordHasher`: cria e verifica hashes Argon2id;
- `TokenService`: gera segredos e calcula hashes estáveis para persistência;
- `AuthRateLimiter`: aplica contadores e bloqueios no Redis;
- `PasswordRecoveryMailer`: entrega o link por SMTP;
- `AuthGuard`: autentica Bearer e preenche o contexto;
- `PermissionsGuard`: aplica permissões declaradas por decorator;
- repositórios de autenticação, sessão, recuperação e auditoria.

O comando de bootstrap reutiliza serviços de domínio e uma transação TypeORM,
sem chamar controllers nem HTTP.

## Persistência e migration

Uma nova migration explícita fará as seguintes alterações.

### `organizations`

Adicionar `code varchar(50)`, `NOT NULL`, com índice único. Organizações já
existentes recebem código determinístico `org-<uuid-sem-hifens>` antes da
restrição `NOT NULL`. Novos códigos amigáveis são definidos no bootstrap. A
aplicação não oferece operação para alterar o código.

### `users`

Adicionar:

- `must_change_password boolean NOT NULL DEFAULT true`;
- `password_changed_at timestamptz NULL`.

Usuário com `password_hash IS NULL`, status diferente de `active`, organização
inativa ou `deleted_at` preenchido não pode autenticar. Usuários provisionados
com senha temporária ficam ativos e com `must_change_password = true`.

### `auth_sessions`

Campos: UUID, organização, usuário, hash único do token, tipo
`normal|password_change`, expiração absoluta, última atividade, revogação,
motivo de revogação, criação, atualização e `deleted_at`. FKs compostas ligam
usuário e organização para impedir sessão cruzada entre tenants.

Sessão normal expira após 30 minutos de inatividade ou 12 horas desde a
emissão. Sessão `password_change` expira após 10 minutos e autoriza somente a
conclusão do primeiro acesso e o logout. O token bruto nunca é persistido.

### `password_reset_tokens`

Campos: UUID, organização, usuário, hash único do token, expiração, consumo,
revogação, criação, atualização e `deleted_at`. FKs compostas impedem vínculo
entre tenants. Nova solicitação revoga tokens ainda utilizáveis do mesmo
usuário. Token consumido, revogado ou expirado nunca é reutilizado.

Todas as novas tabelas têm `deleted_at timestamptz` anulável. Índices atendem
busca por hash, usuário/organização, expiração e revogação. `down` remove apenas
os objetos criados por esta migration, em ordem segura.

## Contratos HTTP

Todas as rotas usam o envelope transversal `{ data, meta }` e o formato de erro
vigente. Respostas contendo token ou senha temporária enviam
`Cache-Control: no-store`. Exemplos usam dados sintéticos.

### `POST /api/v1/auth/login`

Rota pública. Recebe `organizationCode`, `email` e `password`.

Login normal devolve:

```json
{
  "state": "authenticated",
  "accessToken": "segredo-opaco",
  "tokenType": "Bearer",
  "expiresAt": "2026-09-21T22:00:00.000Z",
  "idleTimeoutSeconds": 1800
}
```

Primeiro acesso devolve um token restrito:

```json
{
  "state": "password_change_required",
  "accessToken": "segredo-opaco",
  "tokenType": "Bearer",
  "expiresAt": "2026-09-21T10:10:00.000Z"
}
```

Organização desconhecida/inativa, usuário desconhecido/inativo e senha
incorreta retornam o mesmo `AUTH_INVALID_CREDENTIALS`.

### `POST /api/v1/auth/password/first-access`

Exige Bearer do tipo `password_change`. Recebe `newPassword`. Atualiza a senha,
marca `must_change_password = false`, define `password_changed_at`, revoga o
desafio e exige novo login. Não cria sessão normal implicitamente.

### `POST /api/v1/auth/logout`

Exige Bearer normal ou restrito. Revoga apenas a sessão apresentada e devolve
sucesso sem conteúdo de domínio. Uma nova chamada com o token já revogado é
tratada como não autenticada.

### `PUT /api/v1/auth/password`

Exige Bearer normal. Recebe `currentPassword` e `newPassword`. Após validar a
senha atual, atualiza o hash e revoga todas as sessões do usuário, inclusive a
sessão corrente. O cliente precisa autenticar novamente.

### `POST /api/v1/auth/password-recovery/request`

Rota pública. Recebe `organizationCode` e `email`. Sempre responde `202` com a
mesma mensagem, independentemente de organização, usuário, status ou estado do
SMTP.

Com SMTP desabilitado, a aplicação não cria token sem possibilidade de entrega
e registra apenas evento operacional sem PII. Com SMTP habilitado, revoga token
anterior, cria novo token e tenta entregar o link construído a partir de uma
URL de frontend configurável. Se a entrega falhar, revoga o token recém-criado,
registra a falha sem endereço ou segredo e mantém a resposta genérica.

### `POST /api/v1/auth/password-recovery/reset`

Rota pública. Recebe `token` e `newPassword`. Token válido é consumido na mesma
transação que altera a senha, limpa `must_change_password` e revoga todas as
sessões. Token inválido, usado, revogado ou expirado produz o mesmo erro.

### `POST /api/v1/auth/users/:userId/temporary-password`

Exige sessão normal e permissão `users:reset_password`. O alvo precisa ser
outro usuário da mesma organização. A API gera a senha temporária, retorna-a
uma única vez, atualiza o hash, marca `must_change_password = true` e revoga
todas as sessões do alvo. Alvo de outro tenant ou inexistente retorna `404`;
tentativa de redefinir a própria conta por essa rota retorna conflito de
estado.

## Bootstrap operacional

Um script executado por `npm run auth:bootstrap -- <opções>` recebe código e
dados da organização, plano existente, nome/e-mail/CPF do administrador e dados
não secretos necessários. Ele:

1. valida código, UUID do plano, e-mail e CPF;
2. cria organização, perfil `admin` e primeiro usuário em uma transação;
3. garante a existência da permissão global `users:reset_password` e a concede
   ao perfil;
4. gera senha temporária forte, persiste somente seu hash e mostra o segredo
   uma única vez no terminal;
5. recusa duplicidades sem imprimir valores pessoais completos.

O script não recebe senha por argumento, evitando segredo em histórico de
shell. Reexecução com identificadores já usados falha de forma segura, sem
criação parcial.

## Política de abuso

Login permite até cinco falhas por combinação organização/e-mail e por IP em
uma janela de 15 minutos. Ao atingir o limite, aplica bloqueio de 15 minutos.
Login bem-sucedido limpa o contador da conta, mas não apaga auditoria.

Recuperação permite até três solicitações por conta e dez por IP em uma hora.
Identificadores usados nas chaves Redis são normalizados e transformados em
hash; e-mail não aparece em texto legível nas chaves. Expiração do Redis remove
contadores automaticamente. Bloqueio temporário não altera `users.status`.

## Erros públicos

O catálogo `auth.errors.ts` inclui ao menos:

| Código | HTTP | Uso |
| --- | --- | --- |
| `AUTH_INVALID_CREDENTIALS` | 401 | Organização, conta, estado ou senha inválidos no login. |
| `AUTH_UNAUTHENTICATED` | 401 | Bearer ausente, malformado, expirado ou revogado. |
| `AUTH_FORBIDDEN` | 403 | Sessão válida sem permissão exigida. |
| `AUTH_USER_NOT_FOUND` | 404 | Alvo inexistente ou pertencente a outro tenant. |
| `AUTH_RESET_TOKEN_INVALID_OR_EXPIRED` | 422 | Token de recuperação inutilizável. |
| `AUTH_CURRENT_PASSWORD_INVALID` | 422 | Senha atual não confere na troca autenticada. |
| `AUTH_PASSWORD_REUSE` | 422 | Nova senha igual à senha vigente. |
| `AUTH_INVALID_STATE` | 409 | Operação incompatível com a própria conta ou estado. |
| `AUTH_TEMPORARILY_BLOCKED` | 429 | Limite de tentativas ou solicitações atingido. |
| `AUTH_DEPENDENCY_UNAVAILABLE` | 503 | Redis indisponível em operação protegida. |

Mensagens são amigáveis em português; `detail` é escrito pela aplicação e não
contém stack, mensagem de driver, e-mail, CPF, senha ou token.

## Auditoria e atomicidade

Login normal cria sessão, atualiza `last_access_at` e grava
`auth.login_succeeded` na mesma transação. Primeiro acesso registra
`auth.first_access_started`; sua conclusão registra
`auth.first_access_completed`. Logout, troca própria, recuperação concluída e
redefinição administrativa também geram eventos.

Alterações de senha, consumo de token, revogação de sessões e evento de
auditoria correspondente são transacionais. Auditoria registra IDs, ação e
metadados autorizados, nunca credenciais ou seus hashes. Falhas individuais de
login ficam nos contadores e logs estruturados; somente o bloqueio consolidado
gera `auth.login_blocked`, evitando transformar ataques em volume ilimitado na
tabela de auditoria.

## Configuração

Configuração tipada e validada incluirá segredos e prazos de autenticação,
habilitação SMTP, host, porta, TLS, usuário, senha, remetente e URL de
recuperação do frontend. Argon2id usará os parâmetros seguros padrão da versão
fixada de `node-argon2`; eles não serão enfraquecidos por variáveis de ambiente.
Variáveis SMTP obrigatórias serão validadas condicionalmente apenas quando SMTP
estiver habilitado.

`.env.example` terá valores ilustrativos sem credenciais. Logs continuarão
redigindo `authorization` e passarão a redigir campos sensíveis dos DTOs quando
capturados pela instrumentação.

## Estratégia de testes

### Unitários

- casos de uso principais e alternativos;
- Argon2id e comparação segura;
- geração/hash de tokens;
- parsers sem exposição de entidade;
- guard normal, restrito, expirado e revogado;
- permissões;
- contadores Redis e tradução de indisponibilidade;
- mailer SMTP por interface falsa.

### HTTP/e2e

- envelopes, status, headers `no-store`, validação e OpenAPI;
- credenciais inválidas indistinguíveis;
- primeiro acesso e novo login;
- logout e recusa posterior;
- troca própria e revogação de múltiplas sessões;
- solicitação de recuperação para conta existente e inexistente com corpo
  idêntico;
- token válido, expirado, usado e substituído;
- redefinição administrativa, falta de permissão, tentativa sobre si mesmo e
  alvo de outro tenant;
- usuário e organização inativos;
- limites por conta e IP;
- Redis indisponível.

### Integração controlada

Migration executada, consultada e revertida em PostgreSQL descartável. Testes
com duas organizações verificam FKs compostas, isolamento e respostas `404`.
Redis controlado verifica TTL e bloqueios. SMTP externo não é requisito de
teste: o entregador falso comprova destinatário, URL e ausência de segredo nos
logs. Suítes que dependam de serviços não disponíveis são reportadas como
puladas, separadamente das aprovadas.

## Documentação e rastreabilidade

Cada endpoint terá DTOs e decorators Swagger, `@ApiEnvelope` e `@ApiErrors`,
nota própria em `docs/api/endpoints/` e entrada no índice. O manual explicará o
Bearer opaco, expiração, primeiro acesso, SMTP opcional e códigos de erro.

O vault receberá nota de tarefa, nota de evolução para as decisões posteriores
ao TCC, ADR de autenticação e sessões, atualização das notas de autenticação,
UC01/UC02, pendências P01/P03/P04, backlog e rastreabilidade. O estado será
marcado como implementado ou validado somente com evidência correspondente.

## Critérios de aceite

- Nenhuma operação usa ID de organização enviado pelo cliente como prova de
  autorização.
- Usuário/organização inativos e sessão revogada perdem acesso imediatamente.
- Primeiro acesso não obtém sessão normal antes da troca de senha.
- Recuperação não permite enumeração e não reutiliza token.
- Alterações de senha revogam todas as sessões relevantes.
- Redefinição administrativa não atravessa tenant e exige permissão explícita.
- Banco nunca armazena senha ou token bruto.
- Logs e auditoria não contêm credenciais, tokens, e-mail ou CPF completos.
- Build, lint, testes unitários e e2e pertinentes passam.
- Migration passa por `show`, `run` e `revert` em PostgreSQL descartável.
- Código, OpenAPI, manual e vault descrevem o mesmo comportamento.

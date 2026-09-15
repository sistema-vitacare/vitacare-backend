# VitaCare Backend — instruções para agentes de desenvolvimento

Este arquivo orienta Codex e Claude neste repositório. `AGENTS.md` e `CLAUDE.md` devem ter **conteúdo idêntico**; toda mudança de orientação deve atualizar os dois arquivos na mesma alteração.

## Missão e limites do produto

O VitaCare é um SaaS B2B para organizações que acompanham pacientes crônicos e idosos. Centraliza pacientes, responsáveis pelo cuidado, formulários e registros de visita, medicamentos e lembretes, alertas, histórico, indicadores, relatórios e auditoria. Atende profissionais de saúde, cuidadores, familiares e administradores da organização. A responsabilidade deste repositório é **somente a API/backend**; o frontend React/PWA fica em outro repositório.

O produto deve separar os dados de cada organização e restringir a leitura de dados de saúde aos usuários autorizados. O familiar tem uma visão simplificada e **somente de leitura** do paciente ao qual foi vinculado. Alertas apoiam o acompanhamento; o sistema não presta atendimento emergencial, não faz diagnóstico automatizado e não substitui avaliação profissional. Não inferir sincronização offline, prescrição eletrônica ou automação de emergência a partir de nomes e exemplos das telas.

## Fontes e como decidir

1. **Em toda conversa/tarefa aberta neste repositório**, consulte primeiro o vault em `C:\Obsidian\mateus-dev` (em WSL, `/mnt/c/Obsidian/mateus-dev`): `AGENTS.md`/`CLAUDE.md` do vault, `02-projetos/vitacare-backend/vitacare-backend.md`, `09-sistemas/vitacare/vitacare-mapa-documentacao.md`, o backlog e os registros de evolução relacionados. Busque notas pertinentes antes de decidir; uma conversa nova não deve depender do histórico de outro chat.
2. Compare com o estado real deste checkout: `README.md`, `src/modules/README.md`, configuração, contratos, migrations e testes. Verifique no código qualquer informação de ambiente ou versão antes de reutilizá-la. A origem acadêmica é `04-recursos/documentacoes/vitacare/vitacare-fonte-tcc.md`, com o PDF aprovado preservado no vault.
3. Para cada funcionalidade, leia seu RF, UC, nota de domínio, tabelas relacionadas, protótipo, cenários de teste e itens pertinentes de `09-sistemas/vitacare/pendencias/`. Use `09-sistemas/vitacare/qualidade/vitacare-rastreabilidade.md` para ligar entrega e evidência.
4. Diferencie **requisito do TCC**, **decisão posterior de Mateus**, **implicação técnica derivada** e **pendência**. Protótipos mostram campos e possibilidades, mas seus números de exemplo, limiares clínicos e detalhes sem UC não são constantes nem contratos fechados. O cronograma e as 262h do TCC tratam do sistema inteiro; a meta posterior de concluir o backend em até dois meses e as 15 tarefas agrupadas são planejamento do backend.
5. Instruções atuais de Mateus prevalecem. O código existente registra escolhas de implementação já feitas; se contradisser um requisito ou decisão de produto, exponha a divergência antes de consolidar o comportamento. Se o vault não estiver acessível em outro ambiente, use o contexto deste arquivo, indique exatamente qual fonte faltou e deixe a sincronização pendente de forma explícita, sem inventar detalhes.

## Sincronização obrigatória entre repositório e vault

**Toda alteração do que foi estipulado inicialmente deve ser registrada no vault.** Isso inclui regra de negócio, estrutura de dados, fluxo de usuário, papel/permissão, campo, validação, cálculo, plano, alerta, contrato de endpoint, erro, arquivo, integração, comportamento operacional, prioridade ou qualquer outra diferença frente ao TCC aprovado, a uma decisão posterior, a um contrato publicado ou à documentação vigente. A mudança não se torna uma nova regra aprovada apenas por aparecer no código. Registre também cada tarefa executada e cada decisão, mesmo quando a tarefa implementa o previsto sem divergência. O objetivo é que documento final, notas, Swagger, manual da API e backend descrevam **o mesmo comportamento entregue**.

- **Pasta canônica de mudanças:** `09-sistemas/vitacare/evolucao/` no vault. Mantenha `vitacare-evolucao.md` como índice e uma nota por mudança em `AAAA-MM-DD-<assunto>.md`, com origem/versão anterior, decisão e responsável, motivo, RF/UC/RNF afetados, comportamento novo, dados/contratos alterados, impacto para usuário/frontend, código/migration/testes, evidência de validação e estado (proposto, decidido, implementado ou validado). Não reescrever o PDF original nem ocultar a divergência.
- **Pasta de execução das tarefas:** `02-projetos/vitacare-backend/tarefas/` no vault, uma nota `AAAA-MM-DD-<tarefa>.md` por tarefa ou fatia concluída, com objetivo, fontes lidas, checkpoints, decisões, alterações realizadas, endpoints, testes, pendências e links para as notas de evolução. Decisões arquiteturais reutilizáveis têm ADR própria em `14-decisoes-tecnicas/`, ligada à tarefa e ao índice de evolução.
- Ao tomar uma decisão, registre a diferença em evolução e atualize as notas canônicas atingidas (RF/UC, domínio, dados, pendências, backlog e rastreabilidade). Ao entregar código, complete a nota com o comportamento **realmente implementado**, paths, migration, teste e resultado. Mantenha os índices e wikilinks do vault; use frontmatter, datas, nomes e demais regras de `AGENTS.md`/`CLAUDE.md` do próprio vault.
- Antes de encerrar cada tarefa, confira em ambas as direções: requisito/decisão → código, teste, Swagger e `docs/api/`; código e endpoints → nota de tarefa, evolução quando houver desvio, nota canônica e manual. Uma pendência ou mudança ainda não aprovada deve aparecer como tal, nunca como funcionalidade entregue. Se escrita no vault estiver indisponível, prepare o texto da nota, reporte o impedimento e **não declare a documentação sincronizada**.

Esta rotina vale igualmente para Codex e Claude. Os dois usam as mesmas pastas, os mesmos links e os mesmos arquivos de instrução deste repositório; cada novo chat consulta o estado atualizado do vault e do checkout em vez de assumir que o outro agente já registrou a decisão.

## Manual Markdown e Swagger da API

`docs/api/README.md` é o índice e manual de integração legível por pessoas e agentes. `docs/api/padrao-endpoint.md` define a estrutura obrigatória de uma nota por endpoint em `docs/api/endpoints/`. **Todo endpoint real**, inclusive health e documentação, deve ter nota Markdown ligada no índice e também constar do Swagger quando aplicável; novas rotas precisam das duas formas de documentação na mesma entrega. As rotas técnicas excluídas do OpenAPI, como `/health/live`, continuam obrigatoriamente documentadas no manual.

Cada nota descreve método/URL, propósito, autenticação e permissão, headers, parâmetros de path/query, corpo com **todas as propriedades** (nome, tipo, formato/unidade, obrigatório, default, limites, significado), exemplos completos de request e response JSON, cada status/erro, paginação/filtros/ordem, efeitos e regras, vínculo RF/UC, versionamento e origem no código. Para rota sem body ou com HTML, diga isso explicitamente; não invente JSON. Use exemplos sintéticos e confirme a nota contra DTO, controller, teste e OpenAPI gerado. Alterou contrato? Atualize a nota, o índice, Swagger e o registro do vault na mesma tarefa. Não documente endpoint planejado como se estivesse disponível.

## Estado atual do repositório

- API NestJS 11/TypeScript em Node.js 22, com Docker e **um único serviço `api`** em `compose.yaml`. PostgreSQL e Redis são externos; não adicionar containers de banco ou Redis ao Compose sem nova instrução.
- TypeORM já é a escolha de ORM neste checkout. Entidades de domínio ainda não existem; migrations ficam em `src/database/migrations/`. `synchronize: false` e `migrationsRun: false` são intencionais para o banco externo. Uma mudança de schema exige migration explícita e validação em ambiente controlado; não executar migration em base real por suposição.
- `RedisService` oferece cache; BullMQ está configurado para filas sobre o Redis externo. A infraestrutura existe, mas regras de negócio de cache, agendamento, retenção, repetição e entrega ainda precisam ser decididas por fluxo. Não tratar uma fila como fonte permanente de verdade dos eventos clínicos.
- A API já tem prefixo/versão configuráveis, Swagger/OpenAPI, DTO de paginação, filtro uniforme de erros, validação global estrita, rate limit, Helmet, CORS por ambiente e logs estruturados. Preserve o pipeline em `src/app.setup.ts` e os contratos públicos ao acrescentar módulos.
- `/health/live` verifica apenas o processo; `/health/ready` verifica PostgreSQL e Redis. Não trocar essas semânticas.
- Há testes unitários e e2e da infraestrutura, mas **nenhum módulo de negócio está implementado**. A existência da infraestrutura não comprova conectividade real, schema aplicado, S3 configurado ou deploy. O TCC prevê Lightsail e S3; o checkout atual não entrega essas integrações.

## Ordem de desenvolvimento

O backlog tem 15 tarefas principais, agrupadas por dependência. A semana indicada é janela de planejamento, não estimativa contratual. Trabalhe em uma fatia funcional concluída por vez e registre o RF/UC relacionado:

1. Base de dados, contratos transversais, isolamento e auditoria inicial.
2. Autenticação, logout e recuperação de senha (RF001–002; UC01–02).
3. Organizações e bootstrap do primeiro administrador (RF003; UC03).
4. Usuários, perfis, permissões e vínculos com pacientes (RF004–005/016; UC03).
5. Plano vigente, limites e solicitação de mudança (RF018; UC04/R07).
6. Pacientes, cadastro, consulta e inativação (RF006/016; UC07).
7. Formulários, campos, aplicabilidade, frequência e preservação de versões (RF008/013; UC09).
8. Registros de acompanhamento, respostas e anexos (RF009; UC11).
9. Medicamentos e agenda de lembretes (RF007; UC08).
10. Regras, eventos de alerta e notificações (RF013–014; UC13).
11. Histórico do paciente e visão familiar (RF010/016; UC12/14).
12. Evolução, indicadores e relatório PDF do paciente (RF011–012; UC10/14).
13. Painel operacional da organização (RF015; UC05).
14. Consulta e exportação da auditoria, mantendo a gravação desde as primeiras tarefas (RF017; UC06).
15. Integração com frontend, qualidade, operação e deploy (RF019; RNF001–009).

RF018 é desejável no quadro de requisitos, mas R07 e os fluxos de cadastro dependem de limites de plano; não descartá-lo como detalhe opcional. RF019 exige que a mesma API atenda desktop e mobile; a responsividade visual pertence ao frontend.

## Pendências que bloqueiam contratos e migrations

O registro canônico é `09-sistemas/vitacare/pendencias/vitacare-pendencias.md`, com P01–P32 em três notas. Resolva a pendência pertinente **antes** de fixar um comportamento público ou schema que dependa dela. Faça escolhas técnicas rotineiras coerentes com o código e documente-as; peça definição de produto somente quando alternativas mudarem regras, acesso ou dados.

- Identidade e acesso: quem cria a primeira organização e o administrador; e-mail global ou por organização; descoberta do tenant no login; herança Administrador/Profissional; matriz de ação, campo e vínculo; recuperação por link (UC02) ou código de 6 dígitos (Figura 32); validade, revogação e convite.
- Plano e paciente: Basic/Enterprise do texto versus Pro da tela; usuários/pacientes contados, vigência e concorrência; campos ausentes do MER, critérios de duplicidade e diferença entre inativação e exclusão.
- Formulários e dados clínicos: formulário vigente, versão e vínculo a paciente/grupo; frequência esperada; tipos, unidades e precisão; pressão sistólica/diastólica; valores `0` e `false`; semântica de campos opcionais/desabilitados.
- Alertas e medicamentos: operador, severidade, ausência recorrente, fuso/tolerância, origens de alerta, destinatários e preferências; efeito de edição/inativação nos jobs; leitura e resolução; adesão/tomada só quando houver modelo e regra definidos.
- Indicadores e operação: fórmulas de média/variação/tendência, amostra mínima e estados do painel; relatórios adicionais/XLSX; fluxos S3/e-mail/push; retenção, backup/restore, SLO/RPO/RTO e governança de dados sensíveis. Exemplos das figuras não fecham essas regras.

O DER, MER de 19 tabelas e protótipos divergem em campos, FKs, nulabilidade e tipos. Use `09-sistemas/vitacare/dados/vitacare-comparacao-der-mer.md` e `vitacare-integridade-dados.md` antes do primeiro schema. Não copiar `DATETIME`, `ENUM` vazio ou `INT` para dinheiro, dose, referência e timestamps diretamente para PostgreSQL. Registre a decisão física e teste constraints de tenant e relacionamentos.

## Regras permanentes de implementação

- Derive a organização do contexto autenticado, não de um ID enviado pelo cliente como prova de autorização. Aplique autorização por organização, perfil/permissão e vínculo do paciente em listagem, detalhe, escrita, filtros, agregados, exportações, arquivos, notificações e jobs. Teste negativas com **duas organizações**, diferentes perfis e paciente sem vínculo.
- Mantenha autoria e data do registro; a autoria vem da sessão, não do corpo da requisição. Inativação de usuário, paciente, medicamento ou formulário preserva registros e histórico. Revogação de usuário/vínculo deve impedir acesso posterior.
- Salve registro, resposta e itens de forma atômica; campo deve pertencer ao formulário vigente e este ao paciente permitido. Formulário vazio não é publicado, submissão vazia não é aceita, e valor fora da faixa de alerta é **salvo** e avaliado como evento, sem virar erro de validação clínica.
- Preserve a interpretação de respostas antigas quando o formulário mudar. Separe evento de alerta persistido da entrega; preferência de notificação desligada não apaga o evento. Desenhe deduplicação e recuperação de jobs temporizados e não afirme entrega se e-mail/push/S3 falhou.
- Use DTOs explícitos com validação e Swagger, paginação/filtros consistentes, erros por campo úteis e tipos/unidades definidos. Uma operação HTTP não deve ter regra de domínio no controller. Evite expor dados de saúde ou identidade além do permitido pelo perfil, inclusive em logs, auditoria e PDF.
- Não colocar credenciais, tokens, conexão completa ou dados pessoais reais no código, testes, documentação ou vault. Use `.env.example` e variáveis validadas; máscaras em auditoria e logs. LGPD é requisito do produto, mas o TCC não define sozinho bases, retenção ou processo de direitos.

## Organização do código e validação

Organize funcionalidades por domínio em `src/modules/<dominio>/`. Prefira operações explícitas em arquivos `*.useCase.ts` (`Login.useCase.ts`, `RegisterFollowUp.useCase.ts` etc.), conforme o backlog e a preferência registrada de Mateus. Controllers cuidam de HTTP/DTO/status/Swagger; use cases cuidam das regras; services só quando forem uma camada útil de orquestração ou integração. Entidades `*.entity.ts`, repositórios, enums, types, parsers, integrações e testes entram onde o fluxo precisar. Registre entidades via `TypeOrmModule.forFeature([...])` no módulo; não acesse repository diretamente do controller. Mantenha imports compartilhados pelo alias `@/` já usado no projeto.

Antes de considerar uma tarefa pronta, valide fluxo principal, alternativas, permissão, integridade e evidência ligada ao RF/UC. Escolha testes que exercitem a regra e suas falhas, em especial dois tenants, vínculo revogado, gravação parcial, histórico após inativação, `0`/`false`, jobs repetidos e dados insuficientes para cálculos. Testes com PostgreSQL/Redis/S3 reais exigem ambiente controlado e devem ser reportados separadamente dos mocks.

Comandos locais do checkout: `npm run build`, `npm run lint`, `npm test -- --runInBand` e `npm run test:e2e -- --runInBand`. Rode os checks pertinentes ao código alterado e informe o resultado. Para alterações somente nestes arquivos de instruções, confira que `AGENTS.md` e `CLAUDE.md` são idênticos e rode `git diff --check`. Não marcar checklist do vault ou declarar deploy/migration executados sem evidência real.

Responda ao Mateus em português brasileiro, de modo objetivo. Ao entregar código, explique o comportamento, a decisão tomada, como validou e quais pendências de produto ainda afetam a funcionalidade.

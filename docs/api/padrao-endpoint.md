---
title: Padrão das notas de endpoint da API VitaCare
status: template
updated: 2026-09-17
---

# Padrão das notas de endpoint

Crie **um arquivo Markdown por combinação de método e caminho** em `docs/api/endpoints/`, com nome minúsculo, sem acentos e com hífens. A nota deve funcionar como manual de integração e permitir que outra IA reconstrua o contrato sem reler o controller. Use YAML no topo com `title`, `status` (`atual`, `planejado` ou `obsoleto`), `updated`, `method`, `path` e `source`. Indique a versão/prefixo padrão e as variáveis que alteram o caminho. Apenas notas `atual` entram na tabela de rotas disponíveis do índice.

## Conteúdo obrigatório

1. **Propósito e regra:** quem usa, efeito da chamada, requisito RF/UC/RNF e notas do vault, inclusive limitações. Separe decisão implementada de requisito ainda pendente.
2. **Acesso:** autenticação, esquema/token, perfil/permissão, organização e vínculo com paciente. Diga explicitamente se a rota é pública.
3. **Request:** método e URL, `Content-Type`/`Accept` e demais headers; tabelas de parâmetros de path, query e body. Para **cada propriedade**, inclusive objetos aninhados e itens de listas, informe nome/caminho JSON, tipo, formato ou unidade, obrigatório/opcional, `null` permitido, default, enum/limite e significado. Se alguma categoria não existir, escreva “nenhum”.
4. **Envelope e códigos de erro:** mostre a resposta de sucesso **já envelopada** em `{ data, meta }`, como o cliente realmente a recebe, e nunca o DTO nu. Liste os valores de `error.code` possíveis por status, vindos do catálogo `<modulo>.errors.ts`; não invente código no texto da nota. Se a rota estiver entre as exceções do envelope (`/health/*`, `/api/docs*`), diga isso explicitamente e explique por quê.
5. **Exemplo completo:** comando `curl` copiável com dados sintéticos e um JSON de request válido; para GET sem body, não criar body fictício. Mostre resposta de sucesso com status e JSON completo, e tabela de **todas** as propriedades retornadas, inclusive campos aninhados. Para download/HTML, informe tipo de conteúdo e formato real, sem inventar JSON.
6. **Erros:** liste cada status que o fluxo pode produzir, condição e exemplo JSON do formato real. Explique validação de campos, conflito, ausência, falta de permissão, expiração, falha de serviço e comportamento idempotente quando pertinentes. Marque exemplos ilustrativos que não tenham teste/contrato fechado.
7. **Coleções e datas:** paginação, filtros, ordenação, cursor se houver, fuso, formato de instante e unidade clínica/monetária. Distinga ausência, `null`, `0` e `false`.
8. **Rastreabilidade:** paths do controller, DTO, use case, teste HTTP/integração, migration e nota de tarefa/evolução no vault. Registre data da última conferência com código e OpenAPI. Se o contrato mudou, cite a nota de evolução que explica antes/depois.

## Esqueleto para copiar

Os marcadores abaixo são placeholders e **não representam um endpoint existente**:

````markdown
---
title: <Operação>
status: atual
updated: AAAA-MM-DD
method: POST
path: /api/v1/<recurso>
source: src/modules/<dominio>/<controller>.ts
---

# POST /api/v1/<recurso> — <operação>

## Propósito e acesso
Regra, RF/UC, perfil, tenant e vínculo. Autenticação: ...

## Request
Headers: ...
Path: nenhum.
Query: nenhum.

| Propriedade JSON | Tipo / formato / unidade | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `campo` | texto | sim | não | 1 a 100 caracteres | ... |

```bash
curl -i -X POST 'https://api.example.com/api/v1/<recurso>' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{"campo":"valor-sintetico"}'
```

## Respostas
`201 Created`

```json
{"id":"exemplo","campo":"valor-sintetico"}
```

| Propriedade JSON | Tipo / formato / unidade | Null | Significado |
| --- | --- | --- | --- |
| `id` | texto | não | ... |
| `campo` | texto | não | ... |

| Status | Condição | Corpo |
| --- | --- | --- |
| `400` | Validação | Exemplo JSON abaixo. |

## Paginação, datas e efeitos
Não aplicável, ou detalhar.

## Origem e validação
Controller/DTO/use case/teste, OpenAPI, notas do vault e data.
````

Ao preencher o esqueleto, remova seções que não se aplicam somente depois de explicitar “nenhum” ou “não aplicável”. Não use valores clínicos de protótipos como regra. Um exemplo ou tabela que não corresponde ao código é um erro de documentação; corrija antes de marcar a tarefa concluída.

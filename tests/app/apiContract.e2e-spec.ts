import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';

import { bootFullApp, type FullApp } from './fullApp.fixtures';

/**
 * Contrato publicado para os clientes (BE-24): toda rota real da API inteira
 * tem operacao no OpenAPI (salvo as tecnicas excluidas de proposito), nota em
 * `docs/api/endpoints/` e linha no indice do manual; e o OpenAPI mantem as
 * regras transversais — Bearer e 401 nas rotas protegidas, envelope nas
 * respostas JSON, erros no formato JSON e 422 onde ha entrada validada.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithInfrastructure =
  databaseUrl && redisUrl ? describe : describe.skip;

const DOCS_DIR = join(__dirname, '..', '..', 'docs', 'api');

/** Rotas reais que ficam fora do OpenAPI de proposito. */
const OUTSIDE_OPENAPI = [
  'GET /health/live',
  'GET /api/docs',
  'GET /api/docs-json',
];

/** Rotas que respondem sem Bearer. */
const PUBLIC = [
  'GET /api/v1',
  'GET /health/ready',
  'POST /api/v1/auth/invitations/accept',
  'POST /api/v1/auth/invitations/inspect',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/password-recovery/request',
  'POST /api/v1/auth/password-recovery/reset',
];

/** Respostas de sucesso fora do envelope `{ data, meta }`, com o tipo publicado. */
const OUTSIDE_ENVELOPE: Record<string, string[]> = {
  'GET /health/ready': ['application/json'],
  'GET /api/v1/follow-ups/:followUpId/attachments/:attachmentId/content': [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ],
  'DELETE /api/v1/follow-ups/:followUpId/attachments/:attachmentId': [],
  'GET /api/v1/patients/:patientId/report/pdf': ['application/pdf'],
  'GET /api/v1/management-reports/alerts/pdf': ['application/pdf'],
  'GET /api/v1/management-reports/caregivers/pdf': ['application/pdf'],
  'GET /api/v1/audit-events/export': ['text/csv'],
};

interface Schema {
  $ref?: string;
  properties?: Record<string, unknown>;
  allOf?: Schema[];
}

interface Operation {
  security?: unknown[];
  requestBody?: unknown;
  parameters?: Array<{ in: string }>;
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}

interface OpenApi {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
}

/** `/x/{id}` e `/x/:id` viram a mesma chave. */
const routeKey = (method: string, path: string) =>
  `${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/g, ':$1')}`;

const frontmatter = (file: string) => {
  const text = readFileSync(join(DOCS_DIR, 'endpoints', file), 'utf8');
  const block = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const value = (key: string) =>
    new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1].trim();

  return { method: value('method'), path: value('path') };
};

describeWithInfrastructure(
  'contrato publicado da API (OpenAPI e manual)',
  () => {
    let t: FullApp;
    let openApi: OpenApi;
    let routes: string[];
    let operations: Array<{ key: string; operation: Operation }>;

    const schemaOf = (schema: Schema | undefined): Schema => {
      if (!schema?.$ref) return schema ?? {};

      return openApi.components.schemas[schema.$ref.split('/').pop()!];
    };

    const propertiesOf = (schema: Schema | undefined): string[] => {
      const resolved = schemaOf(schema);

      return [
        ...Object.keys(resolved.properties ?? {}),
        ...(resolved.allOf ?? []).flatMap(propertiesOf),
      ];
    };

    beforeAll(async () => {
      t = await bootFullApp(databaseUrl!, redisUrl!);

      const response = await request(t.server()).get('/api/docs-json');

      openApi = response.body as OpenApi;
      operations = Object.entries(openApi.paths).flatMap(([path, item]) =>
        Object.entries(item).map(([method, operation]) => ({
          key: routeKey(method, path),
          operation,
        })),
      );

      // Rotas registradas de fato no Express, inclusive as da documentacao.
      const router = (
        t.app.getHttpAdapter().getInstance() as {
          router: {
            stack: Array<{
              route?: { path: string; methods: Record<string, boolean> };
            }>;
          };
        }
      ).router;

      // Camadas de middleware valem para todos os metodos e os arquivos do
      // Swagger UI ficam sob /api/docs/: nenhum dos dois e rota da API.
      routes = [
        ...new Set(
          router.stack.flatMap((layer) => {
            const route = layer.route;

            if (!route || route.path.startsWith('/api/docs/')) return [];

            const methods = Object.keys(route.methods);

            return methods.length > 2
              ? []
              : methods.map((method) => routeKey(method, route.path));
          }),
        ),
      ].sort();
    }, 120000);

    afterAll(async () => {
      await t?.close();
    }, 120000);

    it('toda rota registrada esta no OpenAPI, salvo as tecnicas excluidas de proposito', () => {
      const documented = operations.map((operation) => operation.key);

      expect(
        routes.filter((route) => !documented.includes(route)).sort(),
      ).toEqual([...OUTSIDE_OPENAPI].sort());
      expect(documented.filter((key) => !routes.includes(key))).toEqual([]);
    });

    it('toda rota registrada tem nota em docs/api/endpoints e linha no indice do manual', () => {
      const notes = readdirSync(join(DOCS_DIR, 'endpoints'))
        .filter((file) => file.endsWith('.md'))
        .map((file) => ({ file, ...frontmatter(file) }));
      const noted = notes.map((note) => routeKey(note.method!, note.path!));
      const index = readFileSync(join(DOCS_DIR, 'README.md'), 'utf8');
      const indexed = [
        ...index.matchAll(
          /^\| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|[^|]*\| \[[^\]]+\]\(endpoints\/([^)]+)\) \|$/gm,
        ),
      ].map(([, method, path, file]) => ({
        key: routeKey(method, path),
        file,
      }));

      expect(notes.filter((note) => !note.method || !note.path)).toEqual([]);
      expect(routes.filter((route) => !noted.includes(route))).toEqual([]);
      expect(noted.filter((key) => !routes.includes(key))).toEqual([]);
      expect(new Set(noted).size).toBe(noted.length);
      expect(indexed.map((row) => row.key).sort()).toEqual([...routes].sort());

      for (const row of indexed) {
        const note = notes.find((candidate) => candidate.file === row.file);

        expect([row.key, note && routeKey(note.method!, note.path!)]).toEqual([
          row.key,
          row.key,
        ]);
      }
    });

    it('so as rotas publicas dispensam Bearer; toda protegida declara Bearer e 401', () => {
      const open = operations
        .filter(({ operation }) => !operation.security?.length)
        .map(({ key }) => key)
        .sort();

      expect(open).toEqual([...PUBLIC].sort());

      for (const { key, operation } of operations) {
        if (PUBLIC.includes(key)) continue;

        expect([key, Object.keys(operation.responses)]).toEqual([
          key,
          expect.arrayContaining(['401']),
        ]);
      }
    });

    it('todo sucesso JSON sai no envelope; os binarios e o 204 declaram o proprio tipo', () => {
      for (const { key, operation } of operations) {
        const successes = Object.entries(operation.responses).filter(
          ([status]) => status.startsWith('2'),
        );

        expect([key, successes.length > 0]).toEqual([key, true]);

        if (key in OUTSIDE_ENVELOPE) {
          const types = successes.flatMap(([, response]) =>
            Object.keys(response.content ?? {}),
          );

          expect([key, types.sort()]).toEqual([key, OUTSIDE_ENVELOPE[key]]);
          continue;
        }

        for (const [status, response] of successes) {
          expect([key, status, Object.keys(response.content ?? {})]).toEqual([
            key,
            status,
            ['application/json'],
          ]);
          expect([
            key,
            status,
            propertiesOf(response.content!['application/json'].schema),
          ]).toEqual([key, status, expect.arrayContaining(['data', 'meta'])]);
        }
      }
    });

    it('todo erro declarado e JSON e toda entrada validada declara 422', () => {
      for (const { key, operation } of operations) {
        for (const [status, response] of Object.entries(operation.responses)) {
          if (!/^[45]/.test(status)) continue;

          expect([key, status, Object.keys(response.content ?? {})]).toEqual([
            key,
            status,
            ['application/json'],
          ]);
        }

        const validatesInput =
          operation.requestBody !== undefined ||
          (operation.parameters ?? []).some((parameter) =>
            ['path', 'query'].includes(parameter.in),
          );

        if (validatesInput) {
          expect([key, Object.keys(operation.responses)]).toEqual([
            key,
            expect.arrayContaining(['422']),
          ]);
        }
      }
    });

    it('as rotas fora do envelope estao listadas no manual', () => {
      const manual = readFileSync(join(DOCS_DIR, 'README.md'), 'utf8');
      const section =
        /### Rotas fora do envelope\n([\s\S]*?)\n### /.exec(manual)?.[1] ?? '';
      const listed = [
        ...section.matchAll(/^\| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|/gm),
      ].map(([, method, path]) => routeKey(method, path));

      expect(listed.sort()).toEqual(
        [
          ...Object.keys(OUTSIDE_ENVELOPE),
          'GET /health/live',
          'GET /api/docs',
          'GET /api/docs-json',
        ].sort(),
      );
    });
  },
);

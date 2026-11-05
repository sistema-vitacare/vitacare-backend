import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';

import { setupApp } from '@/app.setup';
import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AttachmentController } from '@/modules/Attachment/attachment.controller';
import { ATTACHMENT_USE_CASES } from '@/modules/Attachment/attachment.module';
import { AttachmentUploadInterceptor } from '@/modules/Attachment/http/attachmentUpload.interceptor';
import { AttachmentRepository } from '@/modules/Attachment/repositories/attachment.repository';
import { ATTACHMENT_MAX_BYTES } from '@/modules/Attachment/types/attachment.types';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { FileStorageService } from '@/storage/fileStorage.service';

import { sessionOf } from '../Patient/patient.fixtures';
import {
  ATTACHMENT_ID,
  FOLLOW_UP_ID,
  PNG_HEAD,
  attachmentRow,
} from './attachment.fixtures';

interface SchemaObject {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: string[];
  required?: string[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
}

interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        security?: unknown[];
        requestBody?: {
          content: Record<string, { schema?: SchemaObject }>;
        };
        responses: Record<
          string,
          { content?: Record<string, { schema?: SchemaObject }> }
        >;
      }
    >
  >;
  components: { schemas: Record<string, SchemaObject> };
}

const SESSIONS = {
  'Bearer admin': sessionOf(ProfileCode.ADMIN),
  'Bearer professional': sessionOf(ProfileCode.PROFESSIONAL),
  'Bearer caregiver': sessionOf(ProfileCode.CAREGIVER),
  'Bearer family': sessionOf(ProfileCode.FAMILY),
} as const;

class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session =
      SESSIONS[(request.headers.authorization ?? '') as keyof typeof SESSIONS];

    if (!session) {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Bearer ausente ou malformado.',
      });
    }

    request.context = session;

    return true;
  }
}

const PNG = Buffer.concat([PNG_HEAD, Buffer.from('resto da imagem')]);

describe('Attachment HTTP (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let storage: FileStorageService;
  const attachments = {
    upload: jest.fn(),
    list: jest.fn(),
    findForDownload: jest.fn(),
    remove: jest.fn(),
  };

  const server = (): App => app.getHttpServer() as App;
  const base = `/api/v1/follow-ups/${FOLLOW_UP_ID}/attachments`;

  const post = (who = 'caregiver') =>
    request(server()).post(base).set('Authorization', `Bearer ${who}`);

  const errorCode = (response: { body: unknown }) =>
    (response.body as { error: { code: string } }).error.code;

  const tempFiles = () => readdir(storage.tempDir);

  const storedFiles = async () =>
    (
      await readdir(join(root, 'attachments'), { recursive: true }).catch(
        () => [],
      )
    ).length;

  /** O repositorio dublado aprova as checagens e grava o arquivo, como o real. */
  const acceptUpload = () =>
    attachments.upload.mockImplementation(
      async (_command: unknown, store: () => Promise<void>) => {
        await store();
        return { kind: 'created', attachment: attachmentRow() };
      },
    );

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'vitacare-attachment-http-'));
    storage = new FileStorageService({
      getOrThrow: () => root,
    } as unknown as ConfigService);
    await storage.onModuleInit();

    const moduleRef = await Test.createTestingModule({
      controllers: [AttachmentController],
      providers: [
        ...ATTACHMENT_USE_CASES,
        AttachmentUploadInterceptor,
        { provide: FileStorageService, useValue: storage },
        { provide: AttachmentRepository, useValue: attachments },
        { provide: APP_GUARD, useClass: StubAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    setupApp(app as NestExpressApplication, {
      apiPrefix: 'api',
      apiVersion: '1',
      isProduction: false,
      corsOrigins: [],
      corsCredentials: false,
      swaggerEnabled: true,
      swaggerPath: 'docs',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(() => jest.resetAllMocks());

  it('cuidador envia PNG: 201 envelopado, arquivo na chave e sem temporario', async () => {
    acceptUpload();

    const response = await post().attach('file', PNG, 'ferida.png');

    expect(response.status).toBe(201);
    expect(response.body as object).toMatchObject({
      data: { id: ATTACHMENT_ID, contentType: 'image/png' },
    });
    expect((response.body as { data: object }).data).not.toHaveProperty(
      'storageKey',
    );

    const [command] = attachments.upload.mock.calls[0] as [
      { storageKey: string; sizeBytes: number },
    ];

    expect(command.sizeBytes).toBe(PNG.length);
    await expect(storage.open(command.storageKey)).resolves.toMatchObject({
      size: PNG.length,
    });
    await expect(tempFiles()).resolves.toEqual([]);
  });

  it('acima de 10 MB responde 413 sem chamar o banco nem deixar temporario', async () => {
    const response = await post().attach(
      'file',
      Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, 1),
      'grande.pdf',
    );

    expect(response.status).toBe(413);
    expect(errorCode(response)).toBe('ATTACHMENT_TOO_LARGE');
    expect(attachments.upload).not.toHaveBeenCalled();
    await expect(tempFiles()).resolves.toEqual([]);
  });

  it('texto com extensao de imagem responde 415 e o temporario some', async () => {
    const response = await post().attach(
      'file',
      Buffer.from('nao sou imagem'),
      'foto.jpg',
    );

    expect(response.status).toBe(415);
    expect(errorCode(response)).toBe('ATTACHMENT_UNSUPPORTED_TYPE');
    await expect(tempFiles()).resolves.toEqual([]);
  });

  it('arquivo vazio responde 422 ATTACHMENT_EMPTY', async () => {
    const response = await post().attach('file', Buffer.alloc(0), 'vazio.png');

    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('ATTACHMENT_EMPTY');
  });

  it.each([
    ['corpo JSON', (call: request.Test) => call.send({ file: 'x' })],
    [
      'parte com outro nome',
      (call: request.Test) => call.attach('foto', PNG, 'a.png'),
    ],
    [
      'duas partes file',
      (call: request.Test) =>
        call.attach('file', PNG, 'a.png').attach('file', PNG, 'b.png'),
    ],
    [
      'campo de texto extra',
      (call: request.Test) =>
        call.field('nota', 'x').attach('file', PNG, 'a.png'),
    ],
  ])('%s responde 422 ATTACHMENT_FILE_REQUIRED', async (_label, build) => {
    const response = await build(post());

    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('ATTACHMENT_FILE_REQUIRED');
    expect(attachments.upload).not.toHaveBeenCalled();
    await expect(tempFiles()).resolves.toEqual([]);
  });

  it('checagem negativa no banco nao deixa arquivo nem temporario', async () => {
    attachments.upload.mockResolvedValue({ kind: 'limit_reached' });
    const before = await storedFiles();

    const response = await post().attach('file', PNG, 'a.png');

    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('ATTACHMENT_LIMIT_REACHED');
    await expect(tempFiles()).resolves.toEqual([]);
    await expect(storedFiles()).resolves.toBe(before);
  });

  it('so o cuidador envia: admin, profissional e familiar recebem 403 sem gravar', async () => {
    for (const who of ['admin', 'professional', 'family']) {
      const response = await post(who).attach('file', PNG, 'a.png');

      expect(response.status).toBe(403);
      expect(errorCode(response)).toBe('AUTH_FORBIDDEN');
    }
    expect(attachments.upload).not.toHaveBeenCalled();
    await expect(tempFiles()).resolves.toEqual([]);
  });

  it('sem sessao responde 401', async () => {
    const response = await request(server())
      .post(base)
      .attach('file', PNG, 'a.png');

    expect(response.status).toBe(401);
  });

  it('download sai binario, fora do envelope, com headers de anexo privado', async () => {
    const key = 'attachments/org/baixar';
    const temp = join(storage.tempDir, 'para-baixar');

    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(temp, PNG),
    );
    await storage.promote(temp, key);
    attachments.findForDownload.mockResolvedValue({
      ...attachmentRow({ fileName: 'curativo ç.png' }),
      storageKey: key,
    });

    const response = await request(server())
      .get(`${base}/${ATTACHMENT_ID}/content`)
      .set('Authorization', 'Bearer family')
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PNG);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-length']).toBe(String(PNG.length));
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="curativo _.png"; filename*=UTF-8''curativo%20%C3%A7.png`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('download de anexo fora do alcance responde 404 em JSON', async () => {
    attachments.findForDownload.mockResolvedValue(null);

    const response = await request(server())
      .get(`${base}/${ATTACHMENT_ID}/content`)
      .set('Authorization', 'Bearer family');

    expect(response.status).toBe(404);
    expect(errorCode(response)).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('remocao responde 204 sem corpo; familiar nao remove', async () => {
    attachments.remove.mockResolvedValue({
      kind: 'removed',
      storageKey: 'attachments/org/nao-existe',
    });

    const removed = await request(server())
      .delete(`${base}/${ATTACHMENT_ID}`)
      .set('Authorization', 'Bearer caregiver');

    expect(removed.status).toBe(204);
    expect(removed.text).toBe('');

    const family = await request(server())
      .delete(`${base}/${ATTACHMENT_ID}`)
      .set('Authorization', 'Bearer family');

    expect(family.status).toBe(403);
  });

  it('publica as quatro rotas no OpenAPI com bearer e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;
    const item = `${'/api/v1/follow-ups/{followUpId}/attachments'}/{attachmentId}`;
    const collection = '/api/v1/follow-ups/{followUpId}/attachments';
    const expected: Array<[string, string, string[]]> = [
      [
        collection,
        'post',
        ['201', '401', '403', '404', '409', '413', '415', '422'],
      ],
      [collection, 'get', ['200', '401', '403', '404', '422']],
      [`${item}/content`, 'get', ['200', '401', '403', '404', '422']],
      [item, 'delete', ['204', '401', '403', '404', '422']],
    ];

    for (const [path, method, statuses] of expected) {
      const operation = document.paths[path]?.[method];

      expect(operation).toBeDefined();
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(statuses.sort());
    }

    const upload = document.paths[collection].post;
    const body = upload.requestBody?.content['multipart/form-data'].schema;

    expect(body?.required).toEqual(['file']);
    expect(body?.properties?.file).toMatchObject({
      type: 'string',
      format: 'binary',
    });

    for (const [method, status] of [
      ['post', '201'],
      ['get', '200'],
    ] as const) {
      const schema = document.paths[collection][method].responses[status]
        .content?.['application/json'].schema as SchemaObject;
      const data = schema.properties?.data;

      expect(schema.required).toEqual(['data', 'meta']);
      expect(data?.$ref ?? data?.items?.$ref).toBe(
        '#/components/schemas/AttachmentDto',
      );
    }

    expect(
      document.paths[`${item}/content`].get.responses['200'].content?.[
        'image/png'
      ].schema,
    ).toEqual({ type: 'string', format: 'binary' });

    const dto = document.components.schemas.AttachmentDto;

    expect(dto.required?.sort()).toEqual([
      'contentType',
      'fileName',
      'followUpId',
      'id',
      'sizeBytes',
      'uploadedAt',
      'uploadedBy',
    ]);
    expect(dto.properties).not.toHaveProperty('storageKey');
  });
});

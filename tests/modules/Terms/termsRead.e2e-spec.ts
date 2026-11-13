import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { setupApp } from '@/app.setup';
import {
  TERMS_V1_CONTENT,
  TERMS_V1_HASH,
  TERMS_V1_TITLE,
} from '@/database/migrations/1792200000001-PublishTermsOfUseV1';
import { TermsAcceptanceRepository } from '@/modules/Terms/repositories/termsAcceptance.repository';
import { TermsVersionRepository } from '@/modules/Terms/repositories/termsVersion.repository';
import { TermsController } from '@/modules/Terms/terms.controller';
import { TERMS_USE_CASES } from '@/modules/Terms/terms.module';
import { TermsPageController } from '@/modules/Terms/termsPage.controller';
import type { TermsVersionRow } from '@/modules/Terms/types/terms.types';

/**
 * Leitura publica do termo (BE-32) pela HTTP, com o pipeline real de
 * `setupApp` e o repositorio trocado: JSON no envelope, pagina HTML fora dele,
 * nenhuma das duas pede token. O caminho no banco e coberto pelo e2e do aceite.
 */

const V1: TermsVersionRow = {
  id: '0b7f1f3e-0000-4000-8000-000000000001',
  version: 1,
  title: TERMS_V1_TITLE,
  content: TERMS_V1_CONTENT,
  contentHash: TERMS_V1_HASH,
  publishedAt: new Date('2026-11-13T12:00:00Z'),
};

describe('termo de uso publico (BE-32, HTTP)', () => {
  let app: INestApplication;
  let published: TermsVersionRow[] = [V1];

  const repo = {
    findCurrent: jest.fn(() => Promise.resolve(published.at(-1) ?? null)),
    findByVersion: jest.fn((version: number) =>
      Promise.resolve(published.find((row) => row.version === version) ?? null),
    ),
  };

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TermsController, TermsPageController],
      providers: [
        ...TERMS_USE_CASES,
        { provide: TermsVersionRepository, useValue: repo },
        { provide: TermsAcceptanceRepository, useValue: {} },
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
  });

  beforeEach(() => {
    published = [V1];
  });

  it('GET /api/v1/terms/current devolve o termo vigente no envelope, sem token', async () => {
    const response = await request(server()).get('/api/v1/terms/current');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        version: 1,
        title: TERMS_V1_TITLE,
        content: TERMS_V1_CONTENT,
        contentHash: TERMS_V1_HASH,
        publishedAt: '2026-11-13T12:00:00.000Z',
        pageUrl: '/termos?versao=1',
      },
      meta: { requestId: expect.any(String) as string },
    });
  });

  it('sem versao publicada, /current responde 404 TERMS_NOT_PUBLISHED', async () => {
    published = [];

    const response = await request(server()).get('/api/v1/terms/current');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: { code: 'TERMS_NOT_PUBLISHED' },
    });
  });

  it('GET /api/v1/terms/versions/:version devolve a versao ou 404', async () => {
    const found = await request(server()).get('/api/v1/terms/versions/1');
    const missing = await request(server()).get('/api/v1/terms/versions/2');
    const invalid = await request(server()).get('/api/v1/terms/versions/abc');

    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ data: { version: 1 } });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({
      error: { code: 'TERMS_VERSION_NOT_FOUND' },
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('GET /termos mostra a pagina HTML da versao vigente, fora do envelope', async () => {
    const response = await request(server()).get('/termos');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.text).toContain(`<title>${TERMS_V1_TITLE}</title>`);
    expect(response.text).toContain('O que o VitaCare não é');
    expect(response.text).toContain(TERMS_V1_HASH);
  });

  it('GET /termos?versao=1 mostra a versao pedida', async () => {
    published = [
      V1,
      { ...V1, version: 2, title: 'Termo v2', content: '# Termo v2\n\nNovo.' },
    ];

    const old = await request(server()).get('/termos?versao=1');
    const current = await request(server()).get('/termos');

    expect(old.status).toBe(200);
    expect(old.text).toContain('Versão 1');
    expect(current.text).toContain('Versão 2');
  });

  it.each(['abc', '0', '99', '1.5', '-1'])(
    'GET /termos?versao=%s responde pagina HTML 404, nunca JSON',
    async (versao) => {
      const response = await request(server()).get(`/termos?versao=${versao}`);

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.text).toContain('Versão do termo não encontrada.');
    },
  );

  it('GET /termos?versao=1&versao=2 responde 404 em HTML', async () => {
    const response = await request(server()).get('/termos?versao=1&versao=2');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
  });

  it('sem versao publicada, /termos responde 404 com aviso em HTML', async () => {
    published = [];

    const response = await request(server()).get('/termos');

    expect(response.status).toBe(404);
    expect(response.text).toContain('Termo ainda não publicado.');
  });

  it('o OpenAPI publica as rotas JSON e deixa a pagina de fora', async () => {
    const document = (await request(server()).get('/api/docs-json')).body as {
      paths: Record<string, unknown>;
    };

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/terms/current',
        '/api/v1/terms/versions/{version}',
      ]),
    );
    expect(
      Object.keys(document.paths).some((path) => path.includes('termos')),
    ).toBe(false);
  });
});

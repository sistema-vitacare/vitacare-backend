import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '@/modules/Auth/guards/public.decorator';

import { TermsVersionRepository } from './repositories/termsVersion.repository';
import { renderTermsPage } from './services/termsPage.renderer';

/** `?versao=` valido: inteiro positivo; o resto vira pagina 404, nunca JSON. */
const VERSION_PATTERN = /^[1-9]\d{0,5}$/;

/**
 * Pagina publica do termo (BE-32): `GET /termos`, fora do prefixo, da versao,
 * do envelope e do OpenAPI, como `/health`. Sempre publica, mesmo com o
 * Swagger desligado: e o documento linkado no rodape e no e-mail.
 */
@ApiExcludeController()
@Controller({ path: 'termos', version: VERSION_NEUTRAL })
export class TermsPageController {
  constructor(private readonly versions: TermsVersionRepository) {}

  @Get()
  @Public()
  async show(
    @Query('versao') versao: unknown,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-cache');

    if (versao === undefined) {
      const current = await this.versions.findCurrent();

      response
        .status(current ? HttpStatus.OK : HttpStatus.NOT_FOUND)
        .type('html')
        .send(renderTermsPage(current));

      return;
    }

    const row =
      typeof versao === 'string' && VERSION_PATTERN.test(versao)
        ? await this.versions.findByVersion(Number(versao))
        : null;

    response
      .status(row ? HttpStatus.OK : HttpStatus.NOT_FOUND)
      .type('html')
      .send(renderTermsPage(row, 'Versão do termo não encontrada.'));
  }
}

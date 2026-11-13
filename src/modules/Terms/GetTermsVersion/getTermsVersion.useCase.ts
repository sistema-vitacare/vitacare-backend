import { Injectable } from '@nestjs/common';

import { DomainException } from '@/common/errors/domain.exception';

import type { TermsVersionDto } from '../dtos/termsVersion.dto';
import { toTermsVersionResponse } from '../parsers/termsVersion.parser';
import { TermsVersionRepository } from '../repositories/termsVersion.repository';
import { TermsErrors } from '../terms.errors';

/** Qualquer versao publicada: prova do texto aceito depois de uma versao nova. */
@Injectable()
export class GetTermsVersionUseCase {
  constructor(private readonly versions: TermsVersionRepository) {}

  async execute(version: number): Promise<TermsVersionDto> {
    const row = await this.versions.findByVersion(version);

    if (!row) {
      throw new DomainException({
        ...TermsErrors.VERSION_NOT_FOUND,
        detail: `Versao ${version} do termo nao publicada.`,
      });
    }

    return toTermsVersionResponse(row);
  }
}

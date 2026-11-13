import { Injectable } from '@nestjs/common';

import { DomainException } from '@/common/errors/domain.exception';

import type { TermsVersionDto } from '../dtos/termsVersion.dto';
import { toTermsVersionResponse } from '../parsers/termsVersion.parser';
import { TermsVersionRepository } from '../repositories/termsVersion.repository';
import { TermsErrors } from '../terms.errors';

/** Termo vigente para o frontend exibir antes do aceite (BE-32). */
@Injectable()
export class GetCurrentTermsUseCase {
  constructor(private readonly versions: TermsVersionRepository) {}

  async execute(): Promise<TermsVersionDto> {
    const row = await this.versions.findCurrent();

    if (!row) {
      throw new DomainException({
        ...TermsErrors.NOT_PUBLISHED,
        detail: 'Nenhuma versao do termo foi publicada.',
      });
    }

    return toTermsVersionResponse(row);
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcceptTermsUseCase } from './AcceptTerms/acceptTerms.useCase';
import { TermsAcceptance } from './entities/termsAcceptance.entity';
import { TermsVersion } from './entities/termsVersion.entity';
import { GetCurrentTermsUseCase } from './GetCurrentTerms/getCurrentTerms.useCase';
import { GetTermsVersionUseCase } from './GetTermsVersion/getTermsVersion.useCase';
import { ListOwnTermsAcceptancesUseCase } from './ListOwnTermsAcceptances/listOwnTermsAcceptances.useCase';
import { ListTermsAcceptancesUseCase } from './ListTermsAcceptances/listTermsAcceptances.useCase';
import { TermsAcceptanceRepository } from './repositories/termsAcceptance.repository';
import { TermsVersionRepository } from './repositories/termsVersion.repository';
import { TermsController } from './terms.controller';
import { TermsPageController } from './termsPage.controller';

export const TERMS_USE_CASES = [
  GetCurrentTermsUseCase,
  GetTermsVersionUseCase,
  AcceptTermsUseCase,
  ListOwnTermsAcceptancesUseCase,
  ListTermsAcceptancesUseCase,
];

/**
 * Termo de uso e privacidade (BE-32): versoes publicadas por migration, pagina
 * publica e aceite obrigatorio. O bloqueio de quem nao aceitou fica no guard
 * global do `AuthModule`; este modulo depende dele, nunca o contrario.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TermsVersion, TermsAcceptance])],
  controllers: [TermsController, TermsPageController],
  providers: [
    ...TERMS_USE_CASES,
    TermsVersionRepository,
    TermsAcceptanceRepository,
  ],
})
export class TermsModule {}

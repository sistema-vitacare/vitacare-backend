import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreateOrganizationUseCase } from './CreateOrganization/createOrganization.useCase';
import { DeactivateOrganizationUseCase } from './DeactivateOrganization/deactivateOrganization.useCase';
import { Organization } from './entities/organization.entity';
import { GetOrganizationUseCase } from './GetOrganization/getOrganization.useCase';
import { ListOrganizationsUseCase } from './ListOrganizations/listOrganizations.useCase';
import { OrganizationController } from './organization.controller';
import { ReactivateOrganizationUseCase } from './ReactivateOrganization/reactivateOrganization.useCase';
import { OrganizationRepository } from './repositories/organization.repository';
import { UpdateOrganizationUseCase } from './UpdateOrganization/updateOrganization.useCase';

@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  controllers: [OrganizationController],
  providers: [
    CreateOrganizationUseCase,
    ListOrganizationsUseCase,
    GetOrganizationUseCase,
    UpdateOrganizationUseCase,
    DeactivateOrganizationUseCase,
    ReactivateOrganizationUseCase,
    OrganizationRepository,
  ],
})
export class OrganizationModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApprovePlanChangeRequestUseCase } from './ApprovePlanChangeRequest/approvePlanChangeRequest.useCase';
import { AssignOrganizationPlanUseCase } from './AssignOrganizationPlan/assignOrganizationPlan.useCase';
import { CancelPlanChangeRequestUseCase } from './CancelPlanChangeRequest/cancelPlanChangeRequest.useCase';
import { CreatePlanChangeRequestUseCase } from './CreatePlanChangeRequest/createPlanChangeRequest.useCase';
import { OrganizationPlanTerm } from './entities/organizationPlanTerm.entity';
import { PlanChangeRequest } from './entities/planChangeRequest.entity';
import { UsagePlan } from './entities/usagePlan.entity';
import { GetOrganizationPlanUseCase } from './GetOrganizationPlan/getOrganizationPlan.useCase';
import { ListPlanChangeRequestsUseCase } from './ListPlanChangeRequests/listPlanChangeRequests.useCase';
import { ListPlansUseCase } from './ListPlans/listPlans.useCase';
import { PlanController } from './plan.controller';
import { RejectPlanChangeRequestUseCase } from './RejectPlanChangeRequest/rejectPlanChangeRequest.useCase';
import { PlanRepository } from './repositories/plan.repository';

export const PLAN_USE_CASES = [
  ListPlansUseCase,
  GetOrganizationPlanUseCase,
  AssignOrganizationPlanUseCase,
  CreatePlanChangeRequestUseCase,
  ListPlanChangeRequestsUseCase,
  CancelPlanChangeRequestUseCase,
  ApprovePlanChangeRequestUseCase,
  RejectPlanChangeRequestUseCase,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsagePlan,
      OrganizationPlanTerm,
      PlanChangeRequest,
    ]),
  ],
  controllers: [PlanController],
  providers: [...PLAN_USE_CASES, PlanRepository],
})
export class PlanModule {}

import { Injectable } from '@nestjs/common';

import type { PlanDto } from '../dtos/plan.dto';
import { toPlanResponse } from '../parsers/plan.parser';
import { PlanRepository } from '../repositories/plan.repository';

/** Catalogo ativo (UC04 passo 2 e escolha do master no cadastro). */
@Injectable()
export class ListPlansUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(): Promise<PlanDto[]> {
    return (await this.plans.listCatalog()).map(toPlanResponse);
  }
}

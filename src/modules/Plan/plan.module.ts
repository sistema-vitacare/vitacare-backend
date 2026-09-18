import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsagePlan } from './entities/usagePlan.entity';

@Module({ imports: [TypeOrmModule.forFeature([UsagePlan])] })
export class PlanModule {}

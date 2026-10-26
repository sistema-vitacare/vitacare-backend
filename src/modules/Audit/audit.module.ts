import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/auditEvent.entity';

@Module({ imports: [TypeOrmModule.forFeature([AuditEvent])] })
export class AuditModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditController } from './audit.controller';
import { AuditEvent } from './entities/auditEvent.entity';
import { ExportAuditEventsUseCase } from './ExportAuditEvents/exportAuditEvents.useCase';
import { GetAuditEventUseCase } from './GetAuditEvent/getAuditEvent.useCase';
import { ListAuditActionsUseCase } from './ListAuditActions/listAuditActions.useCase';
import { ListAuditEventsUseCase } from './ListAuditEvents/listAuditEvents.useCase';
import { AuditEventQueryRepository } from './repositories/auditEventQuery.repository';
import { AuditCsvService } from './services/auditCsv.service';

export const AUDIT_USE_CASES = [
  ListAuditEventsUseCase,
  GetAuditEventUseCase,
  ListAuditActionsUseCase,
  ExportAuditEventsUseCase,
];

export const AUDIT_REPOSITORIES = [AuditEventQueryRepository];

export const AUDIT_SERVICES = [AuditCsvService];

/** Auditoria (BE-23): gravacao em `insertAuditEvent`; aqui, consulta e exportacao. */
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  controllers: [AuditController],
  providers: [...AUDIT_USE_CASES, ...AUDIT_REPOSITORIES, ...AUDIT_SERVICES],
})
export class AuditModule {}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { buildHttpLoggerOptions } from './common/http/httpLogger.options';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import { environmentValidationSchema } from './config/env.validation';
import redisConfig from './config/redis.config';
import mailConfig from './config/mail.config';
import notificationConfig from './config/notification.config';
import operationsConfig from './config/operations.config';
import securityConfig from './config/security.config';
import storageConfig from './config/storage.config';
import { DatabaseModule } from './database/database.module';
import { REDIS_CLIENT } from './redis/redis.constants';
import { RedisThrottlerStorage } from './redis/redisThrottler.storage';
import { HealthModule } from './health/health.module';
import { HeartbeatModule } from './health/heartbeat/heartbeat.module';
import { AccessModule } from './modules/Access/access.module';
import { AlertModule } from './modules/Alert/alert.module';
import { AutomationModule } from './modules/Automation/automation.module';
import { AuditModule } from './modules/Audit/audit.module';
import { AuthModule } from './modules/Auth/auth.module';
import { FollowUpModule } from './modules/FollowUp/followUp.module';
import { AttachmentModule } from './modules/Attachment/attachment.module';
import { FormModule } from './modules/Form/form.module';
import { HistoryModule } from './modules/History/history.module';
import { IndicatorModule } from './modules/Indicator/indicator.module';
import { MedicationModule } from './modules/Medication/medication.module';
import { NotificationModule } from './modules/Notification/notification.module';
import { PlanExpiryNoticeModule } from './modules/PlanExpiryNotice/planExpiryNotice.module';
import { OrganizationModule } from './modules/Organization/organization.module';
import { PlanModule } from './modules/Plan/plan.module';
import { ProfileModule } from './modules/Profile/profile.module';
import { PatientModule } from './modules/Patient/patient.module';
import { PatientAccessModule } from './modules/PatientAccess/patientAccess.module';
import { ReportModule } from './modules/Report/report.module';
import { DashboardModule } from './modules/Dashboard/dashboard.module';
import { UserModule } from './modules/User/user.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        redisConfig,
        securityConfig,
        mailConfig,
        notificationConfig,
        storageConfig,
        operationsConfig,
      ],
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: buildHttpLoggerOptions({
          level: config.getOrThrow<string>('app.logLevel'),
          environment: config.getOrThrow<string>('app.environment'),
        }),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, redis: Redis) => ({
        // Contagem no Redis: sobrevive a deploy e vale para todo processo.
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          {
            ttl: config.getOrThrow<number>('security.throttleTtlMs'),
            limit: config.getOrThrow<number>('security.throttleLimit'),
          },
        ],
      }),
    }),
    DatabaseModule,
    OrganizationModule,
    PlanModule,
    AccessModule,
    UserModule,
    ProfileModule,
    PatientModule,
    PatientAccessModule,
    FormModule,
    FollowUpModule,
    AttachmentModule,
    MedicationModule,
    HistoryModule,
    IndicatorModule,
    ReportModule,
    DashboardModule,
    AlertModule,
    NotificationModule,
    AutomationModule,
    PlanExpiryNoticeModule,
    AuditModule,
    AuthModule,
    RedisModule,
    QueueModule,
    StorageModule,
    HealthModule,
    HeartbeatModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

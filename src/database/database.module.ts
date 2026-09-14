import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './typeorm.options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions({
          host: config.getOrThrow<string>('database.host'),
          port: config.getOrThrow<number>('database.port'),
          username: config.getOrThrow<string>('database.username'),
          password: config.getOrThrow<string>('database.password'),
          database: config.getOrThrow<string>('database.database'),
          schema: config.getOrThrow<string>('database.schema'),
          ssl: config.getOrThrow<boolean>('database.ssl'),
          sslRejectUnauthorized: config.getOrThrow<boolean>(
            'database.sslRejectUnauthorized',
          ),
          poolSize: config.getOrThrow<number>('database.poolSize'),
          connectTimeoutMs: config.getOrThrow<number>(
            'database.connectTimeoutMs',
          ),
          migrationsTableName: config.getOrThrow<string>(
            'database.migrationsTableName',
          ),
        }),
        autoLoadEntities: true,
        retryAttempts: 5,
        retryDelay: 3000,
      }),
    }),
  ],
})
export class DatabaseModule {}

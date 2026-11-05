import { Global, Module } from '@nestjs/common';

import { FileStorageService } from './fileStorage.service';

@Global()
@Module({
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class StorageModule {}

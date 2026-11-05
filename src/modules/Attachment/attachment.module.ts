import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttachmentController } from './attachment.controller';
import { DownloadAttachmentUseCase } from './DownloadAttachment/downloadAttachment.useCase';
import { FollowUpAttachment } from './entities/followUpAttachment.entity';
import { AttachmentUploadInterceptor } from './http/attachmentUpload.interceptor';
import { ListAttachmentsUseCase } from './ListAttachments/listAttachments.useCase';
import { RemoveAttachmentUseCase } from './RemoveAttachment/removeAttachment.useCase';
import { AttachmentRepository } from './repositories/attachment.repository';
import { UploadAttachmentUseCase } from './UploadAttachment/uploadAttachment.useCase';

export const ATTACHMENT_USE_CASES = [
  UploadAttachmentUseCase,
  ListAttachmentsUseCase,
  DownloadAttachmentUseCase,
  RemoveAttachmentUseCase,
];

@Module({
  imports: [TypeOrmModule.forFeature([FollowUpAttachment])],
  controllers: [AttachmentController],
  providers: [
    ...ATTACHMENT_USE_CASES,
    AttachmentRepository,
    AttachmentUploadInterceptor,
  ],
})
export class AttachmentModule {}

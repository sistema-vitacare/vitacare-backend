import type { RequestContext } from '@/common/context/requestContext.type';

import type { AttachmentDto } from '../dtos/attachment.dto';
import type { AttachmentRow } from '../types/attachment.types';

/**
 * Familiar e cuidador vinculados veem os anexos ate o BE-19 (visao
 * simplificada); o `ctx` fica na assinatura para essa regra.
 */
export const toAttachmentResponse = (
  row: AttachmentRow,
  _ctx: RequestContext,
): AttachmentDto => ({
  id: row.id,
  followUpId: row.followUpId,
  fileName: row.fileName,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  uploadedBy: { id: row.uploadedBy.id, name: row.uploadedBy.name },
  uploadedAt: row.uploadedAt,
});

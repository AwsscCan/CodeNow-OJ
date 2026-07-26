import type { InferInsertModel } from "drizzle-orm";
import { adminAuditLogs } from "../../../db/schema";

export type AdminAuditAction = InferInsertModel<typeof adminAuditLogs>["action"];

export function adminAuditRow(input: {
  adminUserId: string;
  action: AdminAuditAction;
  targetType: string;
  targetId: string;
  requestId: string;
  now?: Date;
}) {
  return {
    id: crypto.randomUUID(),
    adminUserId: input.adminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId,
    metadataJson: "{}",
    createdAt: input.now ?? new Date(),
  } satisfies InferInsertModel<typeof adminAuditLogs>;
}


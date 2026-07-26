import { desc, lt } from "drizzle-orm";
import { createLocalDb } from "../../../../db/client";
import { adminAuditLogs } from "../../../../db/schema";
import { adminNotFound, privateJson, resolveAdmin, type ResolveAdmin } from "../_shared";

type RepositoryDb = ReturnType<typeof createLocalDb>;

export function createAdminAuditHandlers(resolve: ResolveAdmin = resolveAdmin) {
  return {
    async GET(request: Request) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get("limit") ?? 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) return privateJson({ error: { code: "INVALID_LIMIT", message: "Invalid limit" } }, { status: 400 });
      const cursorValue = url.searchParams.get("cursor");
      const cursor = cursorValue ? new Date(cursorValue) : null;
      if (cursor && Number.isNaN(cursor.getTime())) return privateJson({ error: { code: "INVALID_CURSOR", message: "Invalid cursor" } }, { status: 400 });
      const database = context.services.db as RepositoryDb;
      const query = database.select({
        id: adminAuditLogs.id, adminUserId: adminAuditLogs.adminUserId, action: adminAuditLogs.action,
        targetType: adminAuditLogs.targetType, targetId: adminAuditLogs.targetId,
        requestId: adminAuditLogs.requestId, createdAt: adminAuditLogs.createdAt,
      }).from(adminAuditLogs);
      const rows = await (cursor ? query.where(lt(adminAuditLogs.createdAt, cursor)) : query)
        .orderBy(desc(adminAuditLogs.createdAt)).limit(limit + 1);
      const items = rows.slice(0, limit);
      return privateJson({ items, nextCursor: rows.length > limit ? items.at(-1)?.createdAt.toISOString() ?? null : null });
    },
  };
}

export const { GET } = createAdminAuditHandlers();


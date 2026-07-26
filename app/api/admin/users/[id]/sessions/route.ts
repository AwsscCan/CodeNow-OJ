import { createAdminAccountService } from "../../../../../server/admin/admin-account-service";
import { adminNotFound, privateJson, requestId, resolveAdmin, type ResolveAdmin } from "../../../_shared";

export function createAdminUserSessionHandlers(resolve: ResolveAdmin = resolveAdmin) {
  return {
    async DELETE(request: Request, id: string) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const result = await createAdminAccountService(context.services.db).revokeSessions(context.userId, requestId(request), id);
      return result.ok
        ? privateJson({ success: true })
        : privateJson({ error: { code: result.code, message: result.message } }, { status: result.status });
    },
  };
}

const handlers = createAdminUserSessionHandlers();
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlers.DELETE(request, (await context.params).id);
}

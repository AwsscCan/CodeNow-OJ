import { createAdminAccountService } from "../../../../server/admin/admin-account-service";
import { adminNotFound, privateJson, readAdminBody, requestId, resolveAdmin, type ResolveAdmin } from "../../_shared";

export function createAdminUserHandlers(resolve: ResolveAdmin = resolveAdmin) {
  return {
    async PATCH(request: Request, id: string) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const body = await readAdminBody(request);
      if (!body || typeof body.action !== "string") {
        return privateJson({ error: { code: "INVALID_ACTION", message: "A valid action is required" } }, { status: 400 });
      }
      const service = createAdminAccountService(context.services.db);
      const result = body.action === "ban" && typeof body.reason === "string"
        ? await service.ban(context.userId, requestId(request), id, body.reason)
        : body.action === "unban"
          ? await service.unban(context.userId, requestId(request), id)
          : body.action === "reset-password"
            ? await service.resetPassword(context.userId, requestId(request), id)
            : null;
      if (!result) return privateJson({ error: { code: "INVALID_ACTION", message: "A valid action is required" } }, { status: 400 });
      if (!result.ok) return privateJson({ error: { code: result.code, message: result.message } }, { status: result.status });
      return privateJson(result.value && "temporaryPassword" in result.value
        ? { temporaryPassword: result.value.temporaryPassword }
        : { success: true });
    },
  };
}

const handlers = createAdminUserHandlers();
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlers.PATCH(request, (await context.params).id);
}

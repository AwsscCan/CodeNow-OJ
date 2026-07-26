import { createAdminContentService } from "../../../../../server/admin/admin-content-service";
import { adminNotFound, privateJson, readAdminBody, requestId, resolveAdmin, type ResolveAdmin } from "../../../_shared";

const contentTypes = new Set(["problem", "draft", "conversation"] as const);
type ContentType = "problem" | "draft" | "conversation";

export function createAdminContentDetailHandlers(resolve: ResolveAdmin = resolveAdmin) {
  return {
    async GET(request: Request, typeValue: string, id: string) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const type = typeValue as ContentType;
      if (!contentTypes.has(type)) return adminNotFound();
      const result = await createAdminContentService(context.services.db).detail(context.userId, type, id);
      return result.ok
        ? privateJson({ content: result.value })
        : privateJson({ error: { code: result.code, message: result.message } }, { status: result.status });
    },

    async PATCH(request: Request, typeValue: string, id: string) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const type = typeValue as ContentType;
      if (!contentTypes.has(type)) return adminNotFound();
      const body = await readAdminBody(request);
      if (!body || typeof body.deleted !== "boolean" || Object.keys(body).some((key) => key !== "deleted")) {
        return privateJson({ error: { code: "INVALID_MODERATION", message: "A deleted boolean is required" } }, { status: 400 });
      }
      const result = await createAdminContentService(context.services.db)
        .setDeleted(context.userId, requestId(request), type, id, body.deleted);
      return result.ok
        ? privateJson({ content: result.value })
        : privateJson({ error: { code: result.code, message: result.message } }, { status: result.status });
    },
  };
}

const handlers = createAdminContentDetailHandlers();
type RouteContext = { params: Promise<{ type: string; id: string }> };
export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  return handlers.GET(request, params.type, params.id);
}
export async function PATCH(request: Request, context: RouteContext) {
  const params = await context.params;
  return handlers.PATCH(request, params.type, params.id);
}

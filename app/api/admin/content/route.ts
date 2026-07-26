import { createAdminContentService } from "../../../server/admin/admin-content-service";
import { adminNotFound, privateJson, resolveAdmin, type ResolveAdmin } from "../_shared";

const contentTypes = new Set(["problem", "draft", "conversation"] as const);
type ContentType = "problem" | "draft" | "conversation";

export function createAdminContentHandlers(resolve: ResolveAdmin = resolveAdmin) {
  return {
    async GET(request: Request) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const url = new URL(request.url);
      const type = url.searchParams.get("type") as ContentType | null;
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const cursor = url.searchParams.get("cursor");
      if (!type || !contentTypes.has(type) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return privateJson({ error: { code: "INVALID_CONTENT_QUERY", message: "Invalid content query" } }, { status: 400 });
      }
      const result = await createAdminContentService(context.services.db).list(context.userId, type, cursor, limit);
      return result.ok
        ? privateJson(result.value)
        : privateJson({ error: { code: result.code, message: result.message } }, { status: result.status });
    },
  };
}

export const { GET } = createAdminContentHandlers();


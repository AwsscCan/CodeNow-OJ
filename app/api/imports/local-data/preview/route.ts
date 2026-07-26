import { getRuntimeServices } from "../../../../lib/auth";
import { createImportService, type ImportService } from "../../../../server/imports/import-service";
import { apiError, privateNoStore, readJson } from "../../../../server/problems/problem-api-context";

type ImportContext = { userId: string; service: ImportService };
type ResolveImportContext = (request: Request) => Promise<ImportContext | null>;

const resolveImportContext: ResolveImportContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id, service: createImportService(services.db) } : null;
};

export function createImportPreviewHandlers(resolveContext: ResolveImportContext = resolveImportContext) {
  return {
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body || !("manifest" in body)) return apiError(400, "INVALID_MANIFEST", "缺少导入清单");
      const result = await context.service.previewImport(context.userId, body.manifest);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      return Response.json({ ...result.value, expiresAt }, { headers: privateNoStore });
    },
  };
}

const handlers = createImportPreviewHandlers();
export const POST = handlers.POST;

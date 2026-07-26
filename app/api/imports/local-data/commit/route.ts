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

export function createImportCommitHandlers(resolveContext: ResolveImportContext = resolveImportContext) {
  return {
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
      if (!idempotencyKey) return apiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
      const body = await readJson(request);
      if (!body || !("manifest" in body) || !("previewFingerprint" in body) || !("decisions" in body)) {
        return apiError(400, "INVALID_IMPORT", "Import manifest, preview fingerprint, and decisions are required");
      }
      const result = await context.service.commitImport(context.userId, body.manifest, body.previewFingerprint, body.decisions, idempotencyKey);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json(result.value, { headers: privateNoStore });
    },
  };
}

const handlers = createImportCommitHandlers();
export const POST = handlers.POST;

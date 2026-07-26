import type { Database } from "../../../../db/client";
import { getRuntimeServices } from "../../../lib/auth";
import { createBootstrapAdminService } from "../../../server/admin/admin-bootstrap";
import { checkAuthRateLimit } from "../../../server/security/auth-rate-limit";

type BootstrapContext = { db: Database; token?: string; pepper: string };
type ResolveBootstrap = (request: Request) => Promise<BootstrapContext>;

const noStore = { "Cache-Control": "private, no-store" };

async function defaultResolve(request: Request): Promise<BootstrapContext> {
  const services = await getRuntimeServices(request);
  return { db: services.db, token: services.adminBootstrapToken, pepper: services.rateLimitPepper };
}

function sameSecret(actual: string, expected: string) {
  const left = new TextEncoder().encode(actual);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export function createBootstrapAdminHandlers(resolve: ResolveBootstrap = defaultResolve) {
  return {
    async POST(request: Request) {
      const context = await resolve(request);
      const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (!context.token || !sameSecret(supplied, context.token)) {
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const limit = await checkAuthRateLimit(context.db, {
          action: "admin-bootstrap:failure", identifier: ip, pepper: context.pepper, limit: 5, windowMs: 15 * 60_000,
        });
        return Response.json({ error: { code: limit.allowed ? "NOT_FOUND" : "RATE_LIMITED", message: limit.allowed ? "Not found" : "Too many requests" } }, {
          status: limit.allowed ? 404 : 429, headers: { ...noStore, ...(limit.allowed ? {} : { "Retry-After": "900" }) },
        });
      }

      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 4096) return Response.json({ error: { code: "INVALID_REQUEST", message: "Invalid request" } }, { status: 400, headers: noStore });
      const body = JSON.parse(rawBody || "null") as { email?: unknown; name?: unknown } | null;
      if (!body || typeof body.email !== "string" || typeof body.name !== "string" || Object.keys(body).some((key) => key !== "email" && key !== "name")) {
        return Response.json({ error: { code: "INVALID_REQUEST", message: "Invalid request" } }, { status: 400, headers: noStore });
      }
      try {
        const result = await createBootstrapAdminService(context.db).bootstrap({ email: body.email, name: body.name });
        return Response.json(result, { status: result.alreadyExists ? 409 : 201, headers: noStore });
      } catch {
        return Response.json({ error: { code: "INVALID_REQUEST", message: "Invalid request" } }, { status: 400, headers: noStore });
      }
    },
  };
}

export const { POST } = createBootstrapAdminHandlers();

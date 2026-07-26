import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createLocalDb, type Database } from "../db/client";
import { users } from "../db/schema";
import { getRuntimeServices } from "./lib/auth";
import { createSecurityEvent, emitSecurityEvent } from "./server/observability/events";
import { guardUserWriteRequest } from "./server/security/auth-rate-limit";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type MiddlewareServices = {
  auth: { api: { getSession(input: { headers: Headers }): Promise<{ user: { id: string } } | null> } };
  db: Database;
  rateLimitPepper: string;
};
type ResolveServices = (request: Request) => Promise<MiddlewareServices>;
type GuardWrite = (db: Database, request: Request, userId: string, pepper: string) => Promise<Response | null>;

const passwordChangePaths = new Set([
  "/change-temporary-password",
  "/api/account/complete-invitation",
  "/api/auth/change-password",
  "/api/auth/sign-out",
  "/api/auth/get-session",
]);

function securityHeaders(response: NextResponse, requestId: string) {
  response.headers.set("x-request-id", requestId);

  // Security headers
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-xss-protection", "1; mode=block");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );

  // CSP allowing Monaco CDN and AI API calls
  response.headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://ce.judge0.com https://api.deepseek.com https://api.openai.com https://api.anthropic.com https://cdn.jsdelivr.net",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  return response;
}

export function createMiddleware(
  resolveServices: ResolveServices = getRuntimeServices,
  guardWrite: GuardWrite = guardUserWriteRequest,
) {
  return async function middlewareHandler(request: NextRequest) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const startedAt = Date.now();
    try {
      const services = await resolveServices(request);
      const session = await services.auth.api.getSession({ headers: request.headers });
      if (session) {
        const database = services.db as RepositoryDb;
        const [user] = await database.select({ mustChangePassword: users.mustChangePassword }).from(users)
          .where(eq(users.id, session.user.id)).limit(1);
        if (user?.mustChangePassword && !passwordChangePaths.has(request.nextUrl.pathname)) {
          if (request.nextUrl.pathname.startsWith("/api/")) {
            return Response.json(
              { error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Change the temporary password before continuing" } },
              { status: 428, headers: { "Cache-Control": "private, no-store", "x-request-id": requestId } },
            );
          }
          return NextResponse.redirect(new URL("/change-temporary-password", request.url));
        }
        if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && request.nextUrl.pathname.startsWith("/api/")) {
          const limited = await guardWrite(services.db, request, session.user.id, services.rateLimitPepper);
          emitSecurityEvent(await createSecurityEvent({
            requestId,
            eventName: "private.write.guard",
            status: limited?.status ?? 200,
            durationMs: Date.now() - startedAt,
            userId: session.user.id,
            pepper: services.rateLimitPepper,
            details: { method: request.method },
          }));
          if (limited) {
            limited.headers.set("x-request-id", requestId);
            return limited;
          }
        }
      }
    } catch {
      return Response.json(
        { error: { code: "SECURITY_GUARD_UNAVAILABLE", message: "安全检查暂时不可用" } },
        { status: 503, headers: { "Cache-Control": "private, no-store", "x-request-id": requestId } },
      );
    }
    return securityHeaders(NextResponse.next(), requestId);
  };
}

export const middleware = createMiddleware();

export const config = {
  matcher: ["/((?!_next|_vinext|favicon\\.svg|file\\.svg|globe\\.svg|window\\.svg).*)"],
};

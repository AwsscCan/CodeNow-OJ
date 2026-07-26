import { getRuntimeServices } from "../../../lib/auth";
import { guardAuthRequest } from "../../../server/security/auth-rate-limit";

const invitationOnlyPaths = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/send-verification-email",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
]);

type AuthRouteServices = {
  auth: { handler(request: Request): Promise<Response> };
  db: unknown;
  rateLimitPepper: string;
};

type ResolveServices = (request: Request) => Promise<AuthRouteServices>;
type GuardAuth = (db: unknown, request: Request, pepper: string) => Promise<Response | null>;

export function createAuthRouteHandlers(
  resolveServices: ResolveServices = getRuntimeServices,
  guardAuth: GuardAuth = (db, request, pepper) => guardAuthRequest(db as Parameters<typeof guardAuthRequest>[0], request, pepper),
  invitationOnly: () => boolean = () => process.env.INVITE_ONLY === "1",
) {
  async function handle(request: Request) {
    if (invitationOnly() && invitationOnlyPaths.has(new URL(request.url).pathname)) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const services = await resolveServices(request);
    const rejected = await guardAuth(services.db, request, services.rateLimitPepper);
    if (rejected) return rejected;
    const response = await services.auth.handler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  return { GET: handle, POST: handle };
}

export const { GET, POST } = createAuthRouteHandlers();

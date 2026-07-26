import { eq } from "drizzle-orm";
import { createLocalDb, type Database } from "../../../../db/client";
import { users } from "../../../../db/schema";
import { getRuntimeServices } from "../../../lib/auth";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type PasswordChange = { currentPassword: string; newPassword: string; revokeOtherSessions: true };
type CompletionContext = {
  userId: string;
  db: Database;
  changePassword(input: PasswordChange): Promise<Response>;
};
type ResolveContext = (request: Request) => Promise<CompletionContext | null>;

async function resolveContext(request: Request): Promise<CompletionContext | null> {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return {
    userId: session.user.id,
    db: services.db,
    changePassword: (body) => services.auth.api.changePassword({ headers: request.headers, body, asResponse: true }),
  };
}

function response(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

function setCookies(headers: Headers) {
  const enhanced = headers as Headers & { getSetCookie?: () => string[] };
  return enhanced.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
}

export function createInvitationCompletionHandlers(resolve: ResolveContext = resolveContext) {
  return {
    async POST(request: Request) {
      const context = await resolve(request);
      if (!context) return response({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
      const text = await request.text();
      if (!text || text.length > 2048) return response({ error: { code: "INVALID_PASSWORD_CHANGE", message: "Invalid password change" } }, 400);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return response({ error: { code: "INVALID_PASSWORD_CHANGE", message: "Invalid password change" } }, 400);
      }
      if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string"
        || body.currentPassword.length < 10 || body.newPassword.length < 10 || body.newPassword.length > 128
        || Object.keys(body).some((key) => key !== "currentPassword" && key !== "newPassword")) {
        return response({ error: { code: "INVALID_PASSWORD_CHANGE", message: "Invalid password change" } }, 400);
      }
      const database = context.db as RepositoryDb;
      const [user] = await database.select({ mustChangePassword: users.mustChangePassword }).from(users)
        .where(eq(users.id, context.userId)).limit(1);
      if (!user?.mustChangePassword) return response({ error: { code: "INVITATION_ALREADY_COMPLETED", message: "Invitation already completed" } }, 409);
      try {
        const passwordResponse = await context.changePassword({
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
          revokeOtherSessions: true,
        });
        const cookies = setCookies(passwordResponse.headers);
        await database.update(users).set({ mustChangePassword: false, updatedAt: new Date() })
          .where(eq(users.id, context.userId));
        return response({ success: true }, 200, cookies);
      } catch {
        return response({ error: { code: "PASSWORD_CHANGE_FAILED", message: "Current password is invalid" } }, 400);
      }
    },
  };
}

export const { POST } = createInvitationCompletionHandlers();

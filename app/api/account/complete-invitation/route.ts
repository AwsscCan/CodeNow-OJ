import { eq } from "drizzle-orm";
import { getRuntimeServices } from "../../../lib/auth";
import { createLocalDb, type Database } from "../../../../db/client";
import { users } from "../../../../db/schema";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type PasswordChange = { currentPassword: string; newPassword: string; revokeOtherSessions: true };
type CompletionContext = {
  userId: string;
  db: Database;
  changePassword(input: PasswordChange): Promise<unknown>;
};
type ResolveContext = (request: Request) => Promise<CompletionContext | null>;

async function resolveContext(request: Request): Promise<CompletionContext | null> {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return {
    userId: session.user.id,
    db: services.db,
    changePassword: (body) => services.auth.api.changePassword({ headers: request.headers, body }),
  };
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
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
        await context.changePassword({
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
          revokeOtherSessions: true,
        });
      } catch {
        return response({ error: { code: "PASSWORD_CHANGE_FAILED", message: "Current password is invalid" } }, 400);
      }
      await database.update(users).set({ mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, context.userId));
      return response({ success: true });
    },
  };
}

export const { POST } = createInvitationCompletionHandlers();


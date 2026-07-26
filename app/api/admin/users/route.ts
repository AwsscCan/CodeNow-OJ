import { gt } from "drizzle-orm";
import { createLocalDb } from "../../../../db/client";
import { users } from "../../../../db/schema";
import { createAdminAccountService } from "../../../server/admin/admin-account-service";
import { adminNotFound, privateJson, readAdminBody, requestId, resolveAdmin, type ResolveAdmin } from "../_shared";

type RepositoryDb = ReturnType<typeof createLocalDb>;

export function createAdminUsersHandlers(resolve: ResolveAdmin = resolveAdmin) {
  return {
    async GET(request: Request) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const url = new URL(request.url);
      const rawLimit = Number(url.searchParams.get("limit") ?? 20);
      if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
        return privateJson({ error: { code: "INVALID_LIMIT", message: "Limit must be between 1 and 50" } }, { status: 400 });
      }
      const cursor = url.searchParams.get("cursor");
      const database = context.services.db as RepositoryDb;
      const query = database.select({
        id: users.id, name: users.name, email: users.email, role: users.role, banned: users.banned,
        mustChangePassword: users.mustChangePassword, createdAt: users.createdAt, updatedAt: users.updatedAt,
      }).from(users);
      const rows = await (cursor ? query.where(gt(users.id, cursor)) : query).orderBy(users.id).limit(rawLimit + 1);
      const hasMore = rows.length > rawLimit;
      const items = rows.slice(0, rawLimit);
      return privateJson({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
    },

    async POST(request: Request) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const body = await readAdminBody(request);
      if (!body || typeof body.email !== "string" || typeof body.name !== "string" || Object.keys(body).some((key) => key !== "email" && key !== "name")) {
        return privateJson({ error: { code: "INVALID_INVITATION", message: "A valid email and name are required" } }, { status: 400 });
      }
      const result = await createAdminAccountService(context.services.db).invite(
        context.userId, requestId(request), { email: body.email, name: body.name },
      );
      return result.ok
        ? privateJson({ user: result.value.user, temporaryPassword: result.value.temporaryPassword }, { status: 201 })
        : privateJson({ error: { code: result.code, message: result.message } }, { status: result.status });
    },
  };
}

export const { GET, POST } = createAdminUsersHandlers();


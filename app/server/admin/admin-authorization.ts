import { and, eq } from "drizzle-orm";
import { getRuntimeServices, type RuntimeServices } from "../../lib/auth";
import { createLocalDb, type Database } from "../../../db/client";
import { users } from "../../../db/schema";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type AdminServices = {
  auth: { api: { getSession(input: { headers: Headers }): Promise<{ user: { id: string } } | null> } };
  db: Database;
  rateLimitPepper: string;
};
type ResolveServices = (request: Request) => Promise<AdminServices>;

export function createAdminAuthorization(
  resolveServices: ResolveServices = (request) => getRuntimeServices(request) as Promise<RuntimeServices & AdminServices>,
) {
  return {
    async requireAdmin(request: Request) {
      const services = await resolveServices(request);
      const session = await services.auth.api.getSession({ headers: request.headers });
      if (!session) return null;
      const database = services.db as RepositoryDb;
      const [admin] = await database.select({ id: users.id }).from(users).where(and(
        eq(users.id, session.user.id),
        eq(users.role, "admin"),
        eq(users.banned, false),
      )).limit(1);
      return admin ? { userId: admin.id, services } : null;
    },
  };
}

export const { requireAdmin } = createAdminAuthorization();

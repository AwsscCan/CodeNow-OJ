import { count } from "drizzle-orm";
import { createLocalDb } from "../../../../db/client";
import { problems, sessions, submissions, users } from "../../../../db/schema";
import { adminNotFound, privateJson, resolveAdmin, type ResolveAdmin } from "../_shared";

type RepositoryDb = ReturnType<typeof createLocalDb>;

export function createAdminOverviewHandlers(resolve: ResolveAdmin = resolveAdmin) {
  return {
    async GET(request: Request) {
      const context = await resolve(request);
      if (!context) return adminNotFound();
      const database = context.services.db as RepositoryDb;
      const [[userCount], [sessionCount], [problemCount], [submissionCount]] = await Promise.all([
        database.select({ value: count() }).from(users),
        database.select({ value: count() }).from(sessions),
        database.select({ value: count() }).from(problems),
        database.select({ value: count() }).from(submissions),
      ]);
      return privateJson({ users: userCount.value, sessions: sessionCount.value, problems: problemCount.value, submissions: submissionCount.value });
    },
  };
}

export const { GET } = createAdminOverviewHandlers();

import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client";
import { createLocalDb } from "./client";
import { submissions } from "./schema";

export type SubmissionRecord = {
  id: string;
  problemId: string;
  problemTitle: string;
  status: string;
  passed: string;
  sourceCode: string;
  submittedAt: string;
};

export type NewSubmission = Omit<SubmissionRecord, "id" | "submittedAt">;

type RepositoryDb = ReturnType<typeof createLocalDb>;

function toRecord(row: typeof submissions.$inferSelect): SubmissionRecord {
  return {
    id: row.id,
    problemId: row.problemId,
    problemTitle: row.problemTitle,
    status: row.status,
    passed: row.passed,
    sourceCode: row.sourceCode,
    submittedAt: row.submittedAt.toISOString(),
  };
}

export function createSubmissionRepository(db: Database) {
  const database = db as RepositoryDb;

  return {
    async listSubmissions(userId: string, problemId?: string): Promise<SubmissionRecord[]> {
      const filter = problemId
        ? and(eq(submissions.userId, userId), eq(submissions.problemId, problemId))
        : eq(submissions.userId, userId);
      const rows = await database.select().from(submissions)
        .where(filter)
        .orderBy(desc(submissions.submittedAt))
        .limit(50);
      return rows.map(toRecord);
    },

    async createSubmission(userId: string, input: NewSubmission): Promise<SubmissionRecord> {
      const [row] = await database.insert(submissions).values({
        id: crypto.randomUUID(),
        userId,
        ...input,
        submittedAt: new Date(),
      }).returning();
      return toRecord(row);
    },

    async getSubmission(userId: string, id: string): Promise<SubmissionRecord | null> {
      const [row] = await database.select().from(submissions)
        .where(and(eq(submissions.userId, userId), eq(submissions.id, id)))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async deleteSubmission(userId: string, id: string): Promise<boolean> {
      const existing = await this.getSubmission(userId, id);
      if (!existing) return false;
      await database.delete(submissions)
        .where(and(eq(submissions.userId, userId), eq(submissions.id, id)));
      return true;
    },
  };
}

export type SubmissionRepository = ReturnType<typeof createSubmissionRepository>;

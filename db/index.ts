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
  results: SubmissionTestResult[];
  totalDurationMs: number | null;
  submittedAt: string;
};

export type SubmissionTestResult = {
  id: number;
  status: "AC" | "WA" | "RE" | "CE" | "TLE";
  actual: string;
  expected: string;
  duration: number;
};

export type NewSubmission = Omit<SubmissionRecord, "id" | "submittedAt">;

type RepositoryDb = ReturnType<typeof createLocalDb>;

function parseResults(value: string): SubmissionTestResult[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as SubmissionTestResult[] : [];
  } catch {
    return [];
  }
}

function toRecord(row: typeof submissions.$inferSelect): SubmissionRecord {
  return {
    id: row.id,
    problemId: row.problemId,
    problemTitle: row.problemTitle,
    status: row.status,
    passed: row.passed,
    sourceCode: row.sourceCode,
    results: parseResults(row.resultsJson),
    totalDurationMs: row.totalDurationMs,
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
        problemId: input.problemId,
        problemTitle: input.problemTitle,
        status: input.status,
        passed: input.passed,
        sourceCode: input.sourceCode,
        resultsJson: JSON.stringify(input.results),
        totalDurationMs: input.totalDurationMs,
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

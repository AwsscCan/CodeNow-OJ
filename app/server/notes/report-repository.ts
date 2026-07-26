import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createLocalDb } from "../../../db/client";
import { noteComments, notes, reports } from "../../../db/schema";
import { MAX_REPORT_REASON_LENGTH } from "../../api/_lib/constants";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type ErrorResult = { ok: false; status: 400 | 404 | 413; code: string; message: string; field?: string };
type Result<T> = { ok: true; value: T } | ErrorResult;

export function createReportRepository(db: Database) {
  const database = db as RepositoryDb;

  async function targetIsPublic(targetKind: "note" | "comment", targetId: string) {
    if (targetKind === "note") {
      const [row] = await database.select({ id: notes.id }).from(notes)
        .where(and(eq(notes.id, targetId), eq(notes.visibility, "public"), eq(notes.status, "published"), eq(notes.moderationState, "visible"), isNull(notes.deletedAt))).limit(1);
      return Boolean(row);
    }
    const [row] = await database.select({ id: noteComments.id }).from(noteComments)
      .innerJoin(notes, eq(noteComments.noteId, notes.id))
      .where(and(eq(noteComments.id, targetId), isNull(noteComments.deletedAt), eq(notes.visibility, "public"), eq(notes.status, "published"), eq(notes.moderationState, "visible"), isNull(notes.deletedAt))).limit(1);
    return Boolean(row);
  }

  return {
    async create(reporterId: string, targetKind: unknown, targetId: unknown, reason: unknown): Promise<Result<{ id: string; duplicated: boolean }>> {
      if (targetKind !== "note" && targetKind !== "comment") return { ok: false, status: 400, code: "INVALID_TARGET", message: "举报对象类型无效", field: "targetKind" };
      if (typeof targetId !== "string" || !targetId) return { ok: false, status: 400, code: "INVALID_TARGET", message: "缺少举报对象", field: "targetId" };
      const text = typeof reason === "string" ? reason.trim() : "";
      if (!text) return { ok: false, status: 400, code: "INVALID_REASON", message: "举报原因不能为空", field: "reason" };
      if (text.length > MAX_REPORT_REASON_LENGTH) return { ok: false, status: 413, code: "REASON_TOO_LARGE", message: "举报原因过长", field: "reason" };
      if (!(await targetIsPublic(targetKind, targetId))) return { ok: false, status: 404, code: "TARGET_NOT_FOUND", message: "举报对象不存在或未公开" };

      const [prior] = await database.select({ id: reports.id }).from(reports)
        .where(and(eq(reports.reporterUserId, reporterId), eq(reports.targetKind, targetKind), eq(reports.targetId, targetId))).limit(1);
      if (prior) return { ok: true, value: { id: prior.id, duplicated: true } };

      const id = crypto.randomUUID();
      const now = new Date();
      await database.insert(reports).values({ id, reporterUserId: reporterId, targetKind, targetId, reason: text, status: "open", createdAt: now, updatedAt: now }).onConflictDoNothing();
      return { ok: true, value: { id, duplicated: false } };
    },
  };
}

export type ReportRepository = ReturnType<typeof createReportRepository>;

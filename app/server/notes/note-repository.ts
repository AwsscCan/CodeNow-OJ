import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createD1Db, createLocalDb } from "../../../db/client";
import { noteProblemRefs, notes, problems } from "../../../db/schema";
import {
  MAX_NOTE_CONTENT_BYTES,
  MAX_NOTE_COVER_URL_LENGTH,
  MAX_NOTE_PROBLEM_REF_LENGTH,
  MAX_NOTE_PROBLEM_REFS,
  MAX_NOTE_SUMMARY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
} from "../../api/_lib/constants";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type D1Db = ReturnType<typeof createD1Db>;
type NoteRow = typeof notes.$inferSelect;
type RefRow = typeof noteProblemRefs.$inferSelect;
type ErrorResult = { ok: false; status: 400 | 404 | 409 | 413; code: string; message: string; field?: string; currentVersion?: number; updatedAt?: string };
export type NoteSaveResult<T> = { ok: true; value: T; version: number; updatedAt: string } | ErrorResult;
export type NoteResult<T> = { ok: true; value: T } | ErrorResult;

const encoder = new TextEncoder();
const sensitiveKey = /(apikey|token|secret|password|credential)/i;

const CREATE_KEYS = new Set(["title", "content", "summary", "coverUrl", "visibility", "status", "source", "problemKind", "problemRef", "problemRefs"]);
const UPDATE_KEYS = new Set([...CREATE_KEYS, "version", "id"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function containsSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  const object = record(value);
  return Boolean(object && Object.entries(object).some(([key, item]) => sensitiveKey.test(key.replace(/[^a-z]/gi, "")) || containsSensitiveField(item)));
}

function isD1Database(db: Database): db is D1Db {
  return "batch" in db;
}

function publicRef(row: RefRow) {
  return { problemKind: row.problemKind, problemRef: row.problemRef, sortOrder: row.sortOrder };
}

/** 作者视角的笔记详情：剥掉 user_id 等内部所有者列，Date 转 ISO 字符串。 */
export function ownerNote(row: NoteRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary,
    coverUrl: row.coverUrl,
    visibility: row.visibility,
    status: row.status,
    moderationState: row.moderationState,
    hiddenReason: row.hiddenReason,
    source: row.source,
    problemKind: row.problemKind,
    problemRef: row.problemRef,
    likeCount: row.likeCount,
    favoriteCount: row.favoriteCount,
    commentCount: row.commentCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 列表项：不返回完整正文，只带摘要，控制列表体积。 */
export function noteListItem(row: NoteRow) {
  const full = ownerNote(row);
  return {
    id: full.id, title: full.title, summary: full.summary, coverUrl: full.coverUrl,
    visibility: full.visibility, status: full.status, moderationState: full.moderationState,
    source: full.source, problemKind: full.problemKind, problemRef: full.problemRef,
    likeCount: full.likeCount, favoriteCount: full.favoriteCount, commentCount: full.commentCount,
    publishedAt: full.publishedAt, version: full.version, createdAt: full.createdAt, updatedAt: full.updatedAt,
  };
}

type NormalizedNote = {
  title: string;
  content: string;
  summary: string | null;
  coverUrl: string | null;
  visibility: "private" | "public";
  status: "draft" | "published";
  source: "standalone" | "problem";
  problemKind: "private" | "public" | null;
  problemRef: string | null;
};
type NormalizedRef = { problemKind: "private" | "public"; problemRef: string };

function isError(value: unknown): value is ErrorResult {
  return Boolean(value && typeof value === "object" && (value as { ok?: unknown }).ok === false);
}

export function createNoteRepository(db: Database) {
  const database = db as RepositoryDb;

  async function ownedNote(userId: string, id: string, includeDeleted = false) {
    const filter = includeDeleted
      ? and(eq(notes.userId, userId), eq(notes.id, id))
      : and(eq(notes.userId, userId), eq(notes.id, id), isNull(notes.deletedAt));
    const [row] = await database.select().from(notes).where(filter).limit(1);
    return row ?? null;
  }

  async function ownsProblem(userId: string, problemRef: string) {
    const [row] = await database.select({ id: problems.id }).from(problems)
      .where(and(eq(problems.userId, userId), eq(problems.id, problemRef), isNull(problems.deletedAt))).limit(1);
    return Boolean(row);
  }

  async function listRefs(userId: string, noteId: string) {
    const rows = await database.select().from(noteProblemRefs)
      .where(and(eq(noteProblemRefs.userId, userId), eq(noteProblemRefs.noteId, noteId)))
      .orderBy(asc(noteProblemRefs.sortOrder));
    return rows.map(publicRef);
  }

  function conflict(row: NoteRow): ErrorResult {
    return { ok: false, status: 409, code: "VERSION_CONFLICT", message: "笔记已在其他设备被修改", currentVersion: row.version, updatedAt: row.updatedAt.toISOString() };
  }
  function invalid(code: string, message: string, field?: string): ErrorResult {
    return { ok: false, status: 400, code, message, field };
  }
  function tooLarge(code: string, message: string, field?: string): ErrorResult {
    return { ok: false, status: 413, code, message, field };
  }

  async function normalize(userId: string, body: Record<string, unknown>, current?: NoteRow): Promise<NormalizedNote | ErrorResult> {
    const title = (body.title === undefined && current ? current.title : typeof body.title === "string" ? body.title : "").trim();
    if (!title) return invalid("INVALID_TITLE", "笔记标题不能为空", "title");
    if (title.length > MAX_NOTE_TITLE_LENGTH) return tooLarge("TITLE_TOO_LARGE", "笔记标题过长", "title");

    const content = body.content === undefined && current ? current.content : typeof body.content === "string" ? body.content : "";
    if (encoder.encode(content).byteLength > MAX_NOTE_CONTENT_BYTES) return tooLarge("CONTENT_TOO_LARGE", "笔记正文超过大小上限", "content");

    let summary: string | null = current?.summary ?? null;
    if (body.summary !== undefined) {
      summary = body.summary === null ? null : typeof body.summary === "string" ? body.summary.trim() : "";
      if (summary && summary.length > MAX_NOTE_SUMMARY_LENGTH) return tooLarge("SUMMARY_TOO_LARGE", "笔记摘要过长", "summary");
    }

    let coverUrl: string | null = current?.coverUrl ?? null;
    if (body.coverUrl !== undefined) {
      coverUrl = body.coverUrl === null ? null : typeof body.coverUrl === "string" ? body.coverUrl.trim() : "";
      if (coverUrl && coverUrl.length > MAX_NOTE_COVER_URL_LENGTH) return tooLarge("COVER_URL_TOO_LARGE", "封面地址过长", "coverUrl");
    }

    const visibility = body.visibility === undefined ? (current?.visibility ?? "private") : body.visibility;
    if (visibility !== "private" && visibility !== "public") return invalid("INVALID_VISIBILITY", "可见性取值无效", "visibility");
    const status = body.status === undefined ? (current?.status ?? "draft") : body.status;
    if (status !== "draft" && status !== "published") return invalid("INVALID_STATUS", "状态取值无效", "status");

    const source = body.source === undefined ? (current?.source ?? "standalone") : body.source;
    if (source !== "standalone" && source !== "problem") return invalid("INVALID_SOURCE", "笔记来源无效", "source");

    let problemKind: "private" | "public" | null = current?.problemKind ?? null;
    let problemRef: string | null = current?.problemRef ?? null;
    if (body.problemKind !== undefined) problemKind = body.problemKind === null ? null : body.problemKind as "private" | "public";
    if (body.problemRef !== undefined) problemRef = body.problemRef === null ? null : typeof body.problemRef === "string" ? body.problemRef.trim() : "";

    if (source === "problem") {
      if (!problemRef) return invalid("INVALID_PROBLEM_REF", "题目笔记必须绑定题目", "problemRef");
      if (problemRef.length > MAX_NOTE_PROBLEM_REF_LENGTH) return tooLarge("PROBLEM_REF_TOO_LARGE", "题目引用过长", "problemRef");
      if (problemKind !== "private" && problemKind !== "public") return invalid("INVALID_PROBLEM_KIND", "题目类型无效", "problemKind");
      if (problemKind === "private" && !(await ownsProblem(userId, problemRef))) return invalid("INVALID_PROBLEM_REF", "关联题目不存在或不属于你", "problemRef");
    } else {
      problemKind = null;
      problemRef = null;
    }

    return { title, content, summary, coverUrl, visibility, status, source, problemKind, problemRef };
  }

  /** 校验正文题目引用数组：≤50 条，私有引用必须属当前用户。 */
  async function normalizeRefs(userId: string, value: unknown): Promise<NormalizedRef[] | ErrorResult> {
    if (!Array.isArray(value)) return invalid("INVALID_PROBLEM_REFS", "题目引用必须是数组", "problemRefs");
    if (value.length > MAX_NOTE_PROBLEM_REFS) return tooLarge("PROBLEM_REFS_TOO_MANY", "正文引用题目过多", "problemRefs");
    const result: NormalizedRef[] = [];
    for (const item of value) {
      const entry = record(item);
      const problemKind = entry?.problemKind;
      const problemRef = typeof entry?.problemRef === "string" ? entry.problemRef.trim() : "";
      if ((problemKind !== "private" && problemKind !== "public") || !problemRef) return invalid("INVALID_PROBLEM_REF", "题目引用无效", "problemRefs");
      if (problemRef.length > MAX_NOTE_PROBLEM_REF_LENGTH) return tooLarge("PROBLEM_REF_TOO_LARGE", "题目引用过长", "problemRefs");
      if (problemKind === "private" && !(await ownsProblem(userId, problemRef))) return invalid("INVALID_PROBLEM_REF", "引用题目不存在或不属于你", "problemRefs");
      result.push({ problemKind, problemRef });
    }
    return result;
  }

  function buildRefValues(userId: string, noteId: string, refs: NormalizedRef[]) {
    return refs.map((ref, sortOrder) => ({ id: crypto.randomUUID(), noteId, userId, problemKind: ref.problemKind, problemRef: ref.problemRef, sortOrder }));
  }

  return {
    async list(userId: string, options: { cursor?: string | null; problemRef?: string | null; problemKind?: string | null; visibility?: string | null; requestedLimit?: number } = {}) {
      const limit = Math.min(50, Math.max(1, Math.trunc(options.requestedLimit ?? 50) || 50));
      const separator = options.cursor?.lastIndexOf("|") ?? -1;
      const cursorDate = separator > 0 ? new Date(options.cursor!.slice(0, separator)) : null;
      const cursorId = separator > 0 ? options.cursor!.slice(separator + 1) : "";
      const validCursor = cursorDate && !Number.isNaN(cursorDate.getTime());
      const conditions = [eq(notes.userId, userId), isNull(notes.deletedAt)];
      if (options.problemRef) conditions.push(eq(notes.problemRef, options.problemRef));
      if (options.problemKind === "private" || options.problemKind === "public") conditions.push(eq(notes.problemKind, options.problemKind));
      if (options.visibility === "private" || options.visibility === "public") conditions.push(eq(notes.visibility, options.visibility));
      if (validCursor) conditions.push(or(lt(notes.updatedAt, cursorDate!), and(eq(notes.updatedAt, cursorDate!), lt(notes.id, cursorId)))!);
      const rows = await database.select().from(notes).where(and(...conditions))
        .orderBy(desc(notes.updatedAt), desc(notes.id)).limit(limit + 1);
      const items = rows.slice(0, limit).map(noteListItem);
      const last = rows.length > limit ? rows[limit - 1] : null;
      return { items, nextCursor: last ? `${last.updatedAt.toISOString()}|${last.id}` : null };
    },

    async get(userId: string, id: string): Promise<NoteResult<ReturnType<typeof ownerNote> & { problemRefs: ReturnType<typeof publicRef>[] }>> {
      const row = await ownedNote(userId, id);
      if (!row) return { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在" };
      return { ok: true, value: { ...ownerNote(row), problemRefs: await listRefs(userId, id) } };
    },

    async create(userId: string, input: unknown): Promise<NoteSaveResult<ReturnType<typeof ownerNote>>> {
      const body = record(input);
      if (!body || containsSensitiveField(body)) return invalid("INVALID_NOTE", "笔记字段无效");
      const unknownKey = Object.keys(body).find((key) => !CREATE_KEYS.has(key));
      if (unknownKey) return invalid("INVALID_REQUEST", "存在未知字段", unknownKey);
      const normalized = await normalize(userId, body);
      if (isError(normalized)) return normalized;
      const refs = body.problemRefs === undefined ? [] : await normalizeRefs(userId, body.problemRefs);
      if (isError(refs)) return refs;

      const now = new Date();
      const noteId = crypto.randomUUID();
      const noteValues = {
        id: noteId, userId, ...normalized,
        publishedAt: normalized.visibility === "public" && normalized.status === "published" ? now : null,
        version: 1, createdAt: now, updatedAt: now,
      };
      const refValues = buildRefValues(userId, noteId, refs);

      let row: NoteRow;
      if (!refValues.length) {
        [row] = await database.insert(notes).values(noteValues).returning();
      } else if (isD1Database(db)) {
        const result = await db.batch([db.insert(notes).values(noteValues).returning(), db.insert(noteProblemRefs).values(refValues)]);
        row = result[0][0];
      } else {
        row = database.transaction((tx) => {
          const inserted = tx.insert(notes).values(noteValues).returning().get();
          tx.insert(noteProblemRefs).values(refValues).run();
          return inserted;
        });
      }
      return { ok: true, value: ownerNote(row), version: row.version, updatedAt: row.updatedAt.toISOString() };
    },

    async update(userId: string, id: string, version: unknown, input: unknown): Promise<NoteSaveResult<ReturnType<typeof ownerNote>>> {
      const body = record(input);
      if (!body || containsSensitiveField(body)) return invalid("INVALID_NOTE", "笔记字段无效");
      const unknownKey = Object.keys(body).find((key) => !UPDATE_KEYS.has(key));
      if (unknownKey) return invalid("INVALID_REQUEST", "存在未知字段", unknownKey);
      if (!Number.isInteger(version)) return invalid("INVALID_VERSION", "缺少有效的版本号", "version");
      const current = await ownedNote(userId, id);
      if (!current) return { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在" };
      if (current.version !== version) return conflict(current);
      const normalized = await normalize(userId, body, current);
      if (isError(normalized)) return normalized;
      const replaceRefs = body.problemRefs !== undefined;
      const refs = replaceRefs ? await normalizeRefs(userId, body.problemRefs) : [];
      if (isError(refs)) return refs;

      const now = new Date();
      const publishedAt = normalized.visibility === "public" && normalized.status === "published" ? (current.publishedAt ?? now) : current.publishedAt;
      const setValues = { ...normalized, publishedAt, version: (version as number) + 1, updatedAt: now };
      const where = and(eq(notes.userId, userId), eq(notes.id, id), eq(notes.version, version as number), isNull(notes.deletedAt));
      const refValues = buildRefValues(userId, id, refs as NormalizedRef[]);

      let row: NoteRow | null;
      if (!replaceRefs) {
        [row] = await database.update(notes).set(setValues).where(where).returning();
        row = row ?? null;
      } else if (isD1Database(db)) {
        const result = refValues.length
          ? await db.batch([db.update(notes).set(setValues).where(where).returning(), db.delete(noteProblemRefs).where(eq(noteProblemRefs.noteId, id)), db.insert(noteProblemRefs).values(refValues)])
          : await db.batch([db.update(notes).set(setValues).where(where).returning(), db.delete(noteProblemRefs).where(eq(noteProblemRefs.noteId, id))]);
        row = (result[0] as NoteRow[])[0] ?? null;
      } else {
        row = database.transaction((tx) => {
          const updated = tx.update(notes).set(setValues).where(where).returning().get();
          if (!updated) return null;
          tx.delete(noteProblemRefs).where(eq(noteProblemRefs.noteId, id)).run();
          if (refValues.length) tx.insert(noteProblemRefs).values(refValues).run();
          return updated;
        }) ?? null;
      }
      if (!row) {
        const latest = await ownedNote(userId, id);
        return latest ? conflict(latest) : { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在" };
      }
      return { ok: true, value: ownerNote(row), version: row.version, updatedAt: row.updatedAt.toISOString() };
    },

    async softDelete(userId: string, id: string, version: unknown): Promise<NoteSaveResult<{ id: string }>> {
      if (!Number.isInteger(version)) return invalid("INVALID_VERSION", "缺少有效的版本号", "version");
      const current = await ownedNote(userId, id);
      if (!current) return { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在" };
      if (current.version !== version) return conflict(current);
      const now = new Date();
      const [row] = await database.update(notes).set({ deletedAt: now, updatedAt: now, version: (version as number) + 1 })
        .where(and(eq(notes.userId, userId), eq(notes.id, id), eq(notes.version, version as number), isNull(notes.deletedAt))).returning();
      if (!row) {
        const latest = await ownedNote(userId, id, true);
        return latest ? conflict(latest) : { ok: false, status: 404, code: "NOTE_NOT_FOUND", message: "笔记不存在" };
      }
      return { ok: true, value: { id: row.id }, version: row.version, updatedAt: row.updatedAt.toISOString() };
    },
  };
}

export type NoteRepository = ReturnType<typeof createNoteRepository>;

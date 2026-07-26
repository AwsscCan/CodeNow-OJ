import type { CloudSaveResult } from "../hooks/use-cloud-save";

export type NoteVisibility = "private" | "public";
export type NoteStatus = "draft" | "published";
export type NoteSource = "standalone" | "problem";
export type NoteProblemKind = "private" | "public";

export type CloudNote = {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  coverUrl: string | null;
  visibility: NoteVisibility;
  status: NoteStatus;
  moderationState: "visible" | "hidden";
  hiddenReason: string | null;
  source: NoteSource;
  problemKind: NoteProblemKind | null;
  problemRef: string | null;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type NoteListEntry = Omit<CloudNote, "content" | "hiddenReason"> & { tags: string[] };
export type NoteAuthor = { name: string; image: string | null };
export type NotePublicEntry = Omit<CloudNote, "content" | "hiddenReason" | "moderationState" | "version"> & { author: NoteAuthor };
export type NoteProblemRef = { problemKind: NoteProblemKind; problemRef: string; sortOrder: number };
export type NoteDetail = CloudNote & { problemRefs: NoteProblemRef[]; tags: string[] };
export type NotePublicDetail = Omit<CloudNote, "hiddenReason" | "moderationState" | "version"> & { author: NoteAuthor; problemRefs: NoteProblemRef[] };

export type NoteDraftInput = {
  title: string;
  content: string;
  summary?: string | null;
  coverUrl?: string | null;
  visibility?: NoteVisibility;
  status?: NoteStatus;
  source?: NoteSource;
  problemKind?: NoteProblemKind | null;
  problemRef?: string | null;
  problemRefs?: { problemKind: NoteProblemKind; problemRef: string }[];
  tags?: string[];
};

export type NoteListParams = {
  view?: "mine" | "public";
  cursor?: string | null;
  problemRef?: string | null;
  problemKind?: NoteProblemKind | null;
  visibility?: NoteVisibility | null;
  tag?: string | null;
  limit?: number;
};

export class NoteApiError extends Error {
  constructor(public status: number, message: string, public currentVersion?: number, public updatedAt?: string) {
    super(message);
    this.name = "NoteApiError";
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: { message?: string; currentVersion?: number; updatedAt?: string } } & T;
  if (!response.ok) throw new NoteApiError(response.status, body.error?.message ?? "笔记请求失败", body.error?.currentVersion, body.error?.updatedAt);
  return body;
}

const headers = { "Content-Type": "application/json" };

export const NoteApi = {
  list: (params: NoteListParams = {}) => {
    const query = new URLSearchParams();
    if (params.view) query.set("view", params.view);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.problemRef) query.set("problemRef", params.problemRef);
    if (params.problemKind) query.set("problemKind", params.problemKind);
    if (params.visibility) query.set("visibility", params.visibility);
    if (params.tag) query.set("tag", params.tag);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString();
    return json<{ items: NoteListEntry[]; nextCursor: string | null }>(`/api/notes${suffix ? `?${suffix}` : ""}`);
  },
  tags: () => json<{ tags: string[] }>("/api/tags"),
  listPublic: (params: { cursor?: string | null; problemRef?: string | null; limit?: number } = {}) => {
    const query = new URLSearchParams({ view: "public" });
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.problemRef) query.set("problemRef", params.problemRef);
    if (params.limit) query.set("limit", String(params.limit));
    return json<{ items: NotePublicEntry[]; nextCursor: string | null }>(`/api/notes?${query.toString()}`);
  },
  get: (id: string) => json<{ note: NoteDetail | NotePublicDetail }>(`/api/notes/${encodeURIComponent(id)}`),
  create: (input: NoteDraftInput) => json<{ note: CloudNote; version: number; updatedAt: string }>("/api/notes", {
    method: "POST", headers, body: JSON.stringify(input),
  }),
  update: (id: string, version: number, input: Partial<NoteDraftInput>, signal?: AbortSignal) =>
    json<{ note: CloudNote; version: number; updatedAt: string }>(`/api/notes/${encodeURIComponent(id)}`, {
      method: "PATCH", headers, body: JSON.stringify({ version, ...input }), signal,
    }),
  remove: (id: string, version: number) => json<{ deleted: { id: string }; version: number }>(
    `/api/notes/${encodeURIComponent(id)}?version=${version}`, { method: "DELETE", headers },
  ),
};

export type NoteComment = {
  id: string;
  noteId: string;
  parentId: string | null;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  author: NoteAuthor;
};

export const CommentApi = {
  list: (noteId: string, cursor?: string | null) =>
    json<{ items: NoteComment[]; nextCursor: string | null }>(`/api/notes/${encodeURIComponent(noteId)}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  create: (noteId: string, content: string, idempotencyKey: string, parentId?: string) =>
    json<{ comment: NoteComment }>("/api/comments", {
      method: "POST", headers: { ...headers, "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ noteId, content, ...(parentId ? { parentId } : {}) }),
    }),
  remove: (id: string) => json<{ deleted: { id: string } }>(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE", headers }),
};

export const ReportApi = {
  create: (targetKind: "note" | "comment", targetId: string, reason: string) =>
    json<{ id: string; duplicated: boolean }>("/api/reports", { method: "POST", headers, body: JSON.stringify({ targetKind, targetId, reason }) }),
};

export type ReactionKind = "like" | "favorite";
export const ReactionApi = {
  state: (noteId: string) => json<{ viewerLiked: boolean; viewerFavorited: boolean }>(`/api/reactions?noteId=${encodeURIComponent(noteId)}`),
  set: (noteId: string, kind: ReactionKind, active: boolean) => active
    ? json<{ kind: ReactionKind; active: boolean; count: number }>("/api/reactions", { method: "POST", headers, body: JSON.stringify({ noteId, kind }) })
    : json<{ kind: ReactionKind; active: boolean; count: number }>(`/api/reactions?noteId=${encodeURIComponent(noteId)}&kind=${kind}`, { method: "DELETE", headers }),
};

/** 适配 useCloudSave 的 save 签名：把 NoteApi.update 的异常翻译成 CloudSaveResult。 */
export async function saveNote(id: string, payload: Partial<NoteDraftInput>, version: number, _idempotencyKey: string, signal: AbortSignal): Promise<CloudSaveResult> {
  try {
    const result = await NoteApi.update(id, version, payload, signal);
    return { ok: true, version: result.version, updatedAt: result.updatedAt };
  } catch (error) {
    if (error instanceof NoteApiError) return { ok: false, status: error.status, currentVersion: error.currentVersion, updatedAt: error.updatedAt };
    return { ok: false, status: 0 };
  }
}

import { getRuntimeServices } from "../../lib/auth";
import { createCommentRepository, type CommentRepository } from "./comment-repository";
import { createNoteRepository, type NoteRepository } from "./note-repository";
import { createReactionRepository, type ReactionRepository } from "./reaction-repository";
import { createReportRepository, type ReportRepository } from "./report-repository";

export { apiError, privateNoStore, readJson } from "../problems/problem-api-context";

/** 公开内容首期缓存兜底：no-store（无 private），响应为无用户态字段的匿名序列化。 */
export const publicNoStore = { "Cache-Control": "no-store" };

export type NoteContext = { userId: string; repository: NoteRepository };
export type ResolveNoteContext = (request: Request) => Promise<NoteContext | null>;
export type ResolvePublicRepository = (request: Request) => Promise<NoteRepository>;

export const resolveNoteContext: ResolveNoteContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { userId: session.user.id, repository: createNoteRepository(services.db) };
};

export const resolvePublicRepository: ResolvePublicRepository = async (request) => {
  const services = await getRuntimeServices(request);
  return createNoteRepository(services.db);
};

export type CommentContext = { userId: string | null; repository: CommentRepository };
export type ResolveCommentContext = (request: Request) => Promise<CommentContext>;
export const resolveCommentContext: ResolveCommentContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return { userId: session?.user.id ?? null, repository: createCommentRepository(services.db) };
};

export type ReactionContext = { userId: string | null; repository: ReactionRepository };
export type ResolveReactionContext = (request: Request) => Promise<ReactionContext>;
export const resolveReactionContext: ResolveReactionContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return { userId: session?.user.id ?? null, repository: createReactionRepository(services.db) };
};

export type ReportContext = { userId: string | null; repository: ReportRepository };
export type ResolveReportContext = (request: Request) => Promise<ReportContext>;
export const resolveReportContext: ResolveReportContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return { userId: session?.user.id ?? null, repository: createReportRepository(services.db) };
};

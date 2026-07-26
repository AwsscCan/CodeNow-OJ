import { getRuntimeServices } from "../../lib/auth";
import { createNoteRepository, type NoteRepository } from "./note-repository";

export { apiError, privateNoStore, readJson } from "../problems/problem-api-context";

export type NoteContext = { userId: string; repository: NoteRepository };
export type ResolveNoteContext = (request: Request) => Promise<NoteContext | null>;

export const resolveNoteContext: ResolveNoteContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { userId: session.user.id, repository: createNoteRepository(services.db) };
};

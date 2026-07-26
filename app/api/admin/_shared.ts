import type { Database } from "../../../db/client";
import { requireAdmin } from "../../server/admin/admin-authorization";

export type AdminRouteContext = { userId: string; services: { db: Database } };
export type ResolveAdmin = (request: Request) => Promise<AdminRouteContext | null>;

export const resolveAdmin: ResolveAdmin = (request) => requireAdmin(request);

export function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

export function adminNotFound() {
  return privateJson({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
}

export async function readAdminBody(request: Request) {
  const text = await request.text();
  if (!text || text.length > 16 * 1024) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}


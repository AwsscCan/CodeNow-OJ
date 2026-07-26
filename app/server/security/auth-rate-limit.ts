import { lte, sql } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createLocalDb } from "../../../db/client";
import { authRateLimits } from "../../../db/schema";

type RateLimitInput = {
  action: string;
  identifier: string;
  pepper: string;
  limit: number;
  windowMs: number;
};

type RateLimitDb = ReturnType<typeof createLocalDb>;

async function hashIdentifier(identifier: string, pepper: string) {
  const bytes = new TextEncoder().encode(`${identifier.trim().toLowerCase()}\u0000${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateAuthOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function checkAuthRateLimit(db: Database, input: RateLimitInput) {
  const database = db as RateLimitDb;
  const keyHash = await hashIdentifier(input.identifier, input.pepper);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.windowMs);
  const [row] = await database.insert(authRateLimits).values({
    keyHash,
    action: input.action,
    windowStartedAt: now,
    attempts: 1,
    expiresAt,
  }).onConflictDoUpdate({
    target: [authRateLimits.keyHash, authRateLimits.action],
    set: {
      attempts: sql`case when ${authRateLimits.expiresAt} <= ${now.getTime()} then 1 else ${authRateLimits.attempts} + 1 end`,
      windowStartedAt: sql`case when ${authRateLimits.expiresAt} <= ${now.getTime()} then ${now.getTime()} else ${authRateLimits.windowStartedAt} end`,
      expiresAt: sql`case when ${authRateLimits.expiresAt} <= ${now.getTime()} then ${expiresAt.getTime()} else ${authRateLimits.expiresAt} end`,
    },
  }).returning();

  return {
    allowed: row.attempts <= input.limit,
    remaining: Math.max(0, input.limit - row.attempts),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function cleanupExpiredRateLimits(db: Database, now = new Date()) {
  const database = db as RateLimitDb;
  const rows = await database.delete(authRateLimits).where(lte(authRateLimits.expiresAt, now))
    .returning({ keyHash: authRateLimits.keyHash, action: authRateLimits.action });
  return rows.length;
}

export async function checkUserWriteQuota(db: Database, input: {
  userId: string;
  action: string;
  pepper: string;
  limit: number;
  windowMs: number;
}) {
  await cleanupExpiredRateLimits(db);
  return checkAuthRateLimit(db, {
    action: `write:${input.action}`,
    identifier: `user:${input.userId}`,
    pepper: input.pepper,
    limit: input.limit,
    windowMs: input.windowMs,
  });
}

const USER_WRITE_LIMITS: Record<string, { action: string; limit: number }> = {
  folders: { action: "folders", limit: 300 },
  problems: { action: "problems", limit: 300 },
  drafts: { action: "drafts", limit: 600 },
  submissions: { action: "submissions", limit: 300 },
  preferences: { action: "preferences", limit: 120 },
  conversations: { action: "conversations", limit: 600 },
  imports: { action: "imports", limit: 20 },
  notes: { action: "notes", limit: 60 },
  comments: { action: "comments", limit: 100 },
  reactions: { action: "reactions", limit: 300 },
  reports: { action: "reports", limit: 30 },
};

export async function guardUserWriteRequest(db: Database, request: Request, userId: string, pepper: string) {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(request.method)) return null;
  const family = new URL(request.url).pathname.split("/")[2] ?? "";
  const config = USER_WRITE_LIMITS[family];
  if (!config) return null;
  const result = await checkUserWriteQuota(db, {
    userId,
    action: config.action,
    pepper,
    limit: config.limit,
    windowMs: 60 * 60_000,
  });
  if (result.allowed) return null;
  return Response.json(
    { error: { code: "WRITE_QUOTA_EXCEEDED", message: "写入操作过于频繁，请稍后重试" } },
    { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": "3600" } },
  );
}

const AUTH_LIMITS: Record<string, { action: string; limit: number }> = {
  "/api/auth/sign-in/email": { action: "sign-in", limit: 10 },
  "/api/auth/sign-up/email": { action: "sign-up", limit: 5 },
  "/api/auth/request-password-reset": { action: "password-reset", limit: 5 },
  "/api/auth/send-verification-email": { action: "email-verification", limit: 5 },
};

export async function guardAuthRequest(db: Database, request: Request, pepper: string) {
  if (!validateAuthOrigin(request)) {
    return Response.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效" } }, { status: 403 });
  }
  if (request.method !== "POST") return null;
  const config = AUTH_LIMITS[new URL(request.url).pathname];
  if (!config) return null;

  const body = await request.clone().json().catch(() => ({})) as { email?: unknown };
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const identifiers = [
    { action: `${config.action}:ip`, identifier: ip },
    ...(typeof body.email === "string"
      ? [{ action: `${config.action}:email`, identifier: body.email }]
      : []),
  ];

  for (const item of identifiers) {
    const result = await checkAuthRateLimit(db, {
      ...item,
      pepper,
      limit: config.limit,
      windowMs: 15 * 60_000,
    });
    if (!result.allowed) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后重试" } },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    }
  }
  return null;
}

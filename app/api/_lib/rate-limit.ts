import {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_JUDGE,
  RATE_LIMIT_AI,
  RATE_LIMIT_SUBMISSIONS,
  RATE_LIMIT_MASCOT,
} from "./constants";

type BucketEntry = { count: number; resetAt: number };

const buckets = new Map<string, BucketEntry>();

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

function check(key: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    buckets.set(key, entry);
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: limit - entry.count };
}

// Lightweight pruning every ~100 checks
let pruneCounter = 0;

export function rateLimit(
  request: Request,
  route: "judge" | "ai" | "submissions" | "mascot",
): { allowed: boolean; remaining: number } {
  pruneCounter += 1;
  if (pruneCounter > 100) {
    pruneCounter = 0;
    pruneExpired();
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";
  const key = `${route}:${ip}`;

  const limits: Record<typeof route, number> = {
    judge: RATE_LIMIT_JUDGE,
    ai: RATE_LIMIT_AI,
    submissions: RATE_LIMIT_SUBMISSIONS,
    mascot: RATE_LIMIT_MASCOT,
  };

  return check(key, limits[route]);
}

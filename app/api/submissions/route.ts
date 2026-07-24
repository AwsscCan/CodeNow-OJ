import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { submissions } from "../../../db/schema";
import { rateLimit } from "../_lib/rate-limit";
import { MAX_SUBMISSION_SOURCE_LENGTH, MAX_BULK_DELETE_PROBLEM_IDS } from "../_lib/constants";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "提交记录服务暂不可用";
  return message.includes("no such table") ? "提交记录数据库正在初始化，请稍后重试" : message;
}

export async function GET(request: Request) {
  const rl = rateLimit(request, "submissions");
  if (!rl.allowed) return Response.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const problemId = new URL(request.url).searchParams.get("problemId")?.trim();
    if (!problemId) return Response.json({ error: "缺少题号" }, { status: 400 });
    const history = await (await getDb()).select().from(submissions).where(eq(submissions.problemId, problemId)).orderBy(desc(submissions.submittedAt));
    return Response.json({ history });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = rateLimit(request, "submissions");
  if (!rl.allowed) return Response.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const data = await request.json() as Partial<typeof submissions.$inferInsert>;
    const record = {
      id: String(data.id || "").trim(),
      problemId: String(data.problemId || "").trim(),
      problemTitle: String(data.problemTitle || "").trim(),
      status: String(data.status || "").trim(),
      passed: String(data.passed || "").trim(),
      sourceCode: typeof data.sourceCode === "string" ? data.sourceCode : "",
      submittedAt: String(data.submittedAt || "").trim(),
    };
    if (!record.id || !record.problemId || !record.problemTitle || !record.status || !record.passed || !record.submittedAt || !record.sourceCode) return Response.json({ error: "提交记录字段不完整" }, { status: 400 });
    if (record.sourceCode.length > MAX_SUBMISSION_SOURCE_LENGTH) return Response.json({ error: "提交代码过长" }, { status: 413 });
    const [saved] = await (await getDb()).insert(submissions).values(record).returning();
    return Response.json({ record: saved }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const rl = rateLimit(request, "submissions");
  if (!rl.allowed) return Response.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    const payload = await request.json().catch(() => null) as { problemIds?: unknown } | null;
    const problemIds = Array.isArray(payload?.problemIds) ? payload.problemIds.map(String).map((item) => item.trim()).filter(Boolean).slice(0, MAX_BULK_DELETE_PROBLEM_IDS) : [];
    if (id) await (await getDb()).delete(submissions).where(eq(submissions.id, id));
    else if (problemIds.length) await (await getDb()).delete(submissions).where(inArray(submissions.problemId, problemIds));
    else return Response.json({ error: "缺少记录编号或题号" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const rl = rateLimit(request, "submissions");
  if (!rl.allowed) return Response.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const data = await request.json() as { oldProblemId?: string; newProblemId?: string; problemTitle?: string };
    const oldProblemId = data.oldProblemId?.trim();
    const newProblemId = data.newProblemId?.trim();
    const problemTitle = data.problemTitle?.trim();
    if (!oldProblemId || !newProblemId || !problemTitle) return Response.json({ error: "题号更新字段不完整" }, { status: 400 });
    // Validate new ID format
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(newProblemId)) return Response.json({ error: "新题号需以字母开头，仅含字母数字下划线短横线" }, { status: 400 });
    await (await getDb()).update(submissions).set({ problemId: newProblemId, problemTitle }).where(eq(submissions.problemId, oldProblemId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

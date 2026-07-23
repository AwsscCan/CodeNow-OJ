import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { submissions } from "../../../db/schema";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "提交记录服务暂不可用";
  return message.includes("no such table") ? "提交记录数据库正在初始化，请稍后重试" : message;
}

export async function GET(request: Request) {
  try {
    const problemId = new URL(request.url).searchParams.get("problemId")?.trim();
    if (!problemId) return Response.json({ error: "缺少题号" }, { status: 400 });
    const history = await getDb().select().from(submissions).where(eq(submissions.problemId, problemId)).orderBy(desc(submissions.submittedAt));
    return Response.json({ history });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    if (record.sourceCode.length > 200_000) return Response.json({ error: "提交代码过长" }, { status: 413 });
    const [saved] = await getDb().insert(submissions).values(record).returning();
    return Response.json({ record: saved }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "缺少记录编号" }, { status: 400 });
    await getDb().delete(submissions).where(eq(submissions.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const data = await request.json() as { oldProblemId?: string; newProblemId?: string; problemTitle?: string };
    const oldProblemId = data.oldProblemId?.trim();
    const newProblemId = data.newProblemId?.trim();
    const problemTitle = data.problemTitle?.trim();
    if (!oldProblemId || !newProblemId || !problemTitle) return Response.json({ error: "题号更新字段不完整" }, { status: 400 });
    await getDb().update(submissions).set({ problemId: newProblemId, problemTitle }).where(eq(submissions.problemId, oldProblemId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

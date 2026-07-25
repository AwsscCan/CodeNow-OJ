import { createSubmission, deleteSubmission, deleteSubmissionsByProblemIds, listSubmissions, renameSubmissionProblem, type SubmissionRecord } from "../../../db";
import { rateLimit } from "../_lib/rate-limit";
import { MAX_BULK_DELETE_PROBLEM_IDS, MAX_SUBMISSION_SOURCE_LENGTH } from "../_lib/constants";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "提交记录服务暂时不可用";
}

function normalizeRecord(data: Partial<SubmissionRecord>): SubmissionRecord {
  return {
    id: String(data.id || "").trim(),
    problemId: String(data.problemId || "").trim(),
    problemTitle: String(data.problemTitle || "").trim(),
    status: String(data.status || "").trim(),
    passed: String(data.passed || "").trim(),
    sourceCode: typeof data.sourceCode === "string" ? data.sourceCode : "",
    submittedAt: String(data.submittedAt || "").trim(),
  };
}

export async function GET(request: Request) {
  const rl = rateLimit(request, "submissions");
  if (!rl.allowed) return Response.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const problemId = new URL(request.url).searchParams.get("problemId")?.trim();
    if (!problemId) return Response.json({ error: "缺少题号" }, { status: 400 });
    return Response.json({ history: await listSubmissions(problemId) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = rateLimit(request, "submissions");
  if (!rl.allowed) return Response.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const record = normalizeRecord(await request.json() as Partial<SubmissionRecord>);
    if (!record.id || !record.problemId || !record.problemTitle || !record.status || !record.passed || !record.submittedAt || !record.sourceCode) {
      return Response.json({ error: "提交记录字段不完整" }, { status: 400 });
    }
    if (record.sourceCode.length > MAX_SUBMISSION_SOURCE_LENGTH) return Response.json({ error: "提交代码过长" }, { status: 413 });
    return Response.json({ record: await createSubmission(record) }, { status: 201 });
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
    const problemIds = Array.isArray(payload?.problemIds)
      ? payload.problemIds.map(String).map((item) => item.trim()).filter(Boolean).slice(0, MAX_BULK_DELETE_PROBLEM_IDS)
      : [];

    if (id) await deleteSubmission(id);
    else if (problemIds.length) await deleteSubmissionsByProblemIds(problemIds);
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
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(newProblemId)) return Response.json({ error: "新题号需以字母开头，仅含字母数字下划线短横线" }, { status: 400 });
    await renameSubmissionProblem(oldProblemId, newProblemId, problemTitle);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

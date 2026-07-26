import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decode, encode, __resetBatchSupportForTests, __resetLanguageCacheForTests } from "../../app/api/_lib/judge0-client";
import { POST } from "../../app/api/judge/route";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => { __resetLanguageCacheForTests(); __resetBatchSupportForTests(); });

type StatusFor = (index: number, poll: number) => number;

// 统一的 Judge0 mock，按 URL 分派 languages / batch-create / batch-poll / single-create / single-poll
function judge0Mock(opts: { statusFor?: StatusFor; shufflePoll?: boolean; errorIndex?: number; batch404?: boolean } = {}) {
  const statusFor = opts.statusFor ?? (() => 3);
  const calls = { languages: 0, batchCreate: 0, batchPoll: 0, singleCreate: 0, singlePoll: 0 };
  const batchCreateSizes: number[] = [];
  const batchPollTokenCounts: number[] = [];
  let created = 0;
  const tokenIndex = new Map<string, number>();

  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/languages")) {
      calls.languages += 1;
      return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 14.1.0)" }]), { status: 200 });
    }
    if (u.includes("/submissions/batch") && init?.method === "POST") {
      calls.batchCreate += 1;
      if (opts.batch404) return new Response(JSON.stringify({ error: "batch endpoint not found" }), { status: 404 });
      const subs = JSON.parse(init.body as string).submissions as unknown[];
      batchCreateSizes.push(subs.length);
      const body = subs.map((_s, i) => {
        const globalIndex = created + i;
        if (opts.errorIndex === globalIndex) return { source_code: ["can't be blank"] };
        const token = `t${globalIndex}`;
        tokenIndex.set(token, globalIndex);
        return { token };
      });
      created += subs.length;
      return new Response(JSON.stringify(body), { status: 201 });
    }
    if (u.includes("/submissions/batch")) {
      calls.batchPoll += 1;
      const tokens = new URL(u).searchParams.get("tokens")!.split(",");
      batchPollTokenCounts.push(tokens.length);
      const submissions = tokens.map((tok) => ({
        token: tok,
        status: { id: statusFor(tokenIndex.get(tok) ?? 0, calls.batchPoll) },
        stdout: encode("ok"),
        time: "0.012",
      }));
      if (opts.shufflePoll) submissions.reverse();
      return new Response(JSON.stringify({ submissions }), { status: 200 });
    }
    if (u.includes("/submissions") && init?.method === "POST") {
      calls.singleCreate += 1;
      const token = `s${created++}`;
      tokenIndex.set(token, calls.singleCreate - 1);
      return new Response(JSON.stringify({ token }), { status: 201 });
    }
    if (u.includes("/submissions/")) {
      calls.singlePoll += 1;
      const token = u.split("/submissions/")[1].split("?")[0];
      return new Response(JSON.stringify({ token, status: { id: 3 }, stdout: encode("ok"), time: "0.01" }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${u}`);
  });

  return { fetchMock, calls, batchCreateSizes, batchPollTokenCounts };
}

function judgeRequest(count: number, sourceCode = "int main(){return 0;}") {
  const tests = Array.from({ length: count }, (_, i) => ({ id: i + 1, input: `${i}`, output: `${i}` }));
  return new NextRequest("http://localhost/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceCode, tests }),
  });
}

async function runJudge(count: number) {
  const response = await POST(judgeRequest(count));
  const body = await response.json() as { results?: Array<{ id: number; status: string; actual: string; expected: string; duration: number }>; error?: string };
  return { status: response.status, body };
}

describe("POST /api/judge — batch 化", () => {
  it("N=50：创建走 batch 且恰好 3 次 POST（20/20/10），不走单条 /submissions", async () => {
    const mock = judge0Mock();
    vi.stubGlobal("fetch", mock.fetchMock);
    const { status, body } = await runJudge(50);
    expect(status).toBe(200);
    expect(body.results).toHaveLength(50);
    expect(mock.calls.batchCreate).toBe(3);
    expect(mock.batchCreateSizes).toEqual([20, 20, 10]);
    expect(mock.calls.singleCreate).toBe(0);
  });

  it("轮询只走 batch GET，且每次 tokens 数 <=20，无单点 GET", async () => {
    const mock = judge0Mock();
    vi.stubGlobal("fetch", mock.fetchMock);
    await runJudge(45);
    expect(mock.calls.batchPoll).toBeGreaterThan(0);
    expect(mock.calls.singlePoll).toBe(0);
    expect(Math.max(...mock.batchPollTokenCounts)).toBeLessThanOrEqual(20);
  });

  it("N=50 的 fetch 总次数远小于逐点实现（<80）", async () => {
    const mock = judge0Mock({ statusFor: (_i, poll) => (poll >= 2 ? 3 : 2) });
    vi.stubGlobal("fetch", mock.fetchMock);
    await runJudge(50);
    expect(mock.fetchMock.mock.calls.length).toBeLessThan(80);
  });

  it("GET 乱序返回也按 token 正确回填，results 与 tests 顺序严格对齐", async () => {
    // 让不同下标得到不同判题状态，验证映射：0→AC(3) 1→WA(4) 2→TLE(5) 3→CE(6) 4→RE(11)
    const idToStatus = [3, 4, 5, 6, 11];
    const mock = judge0Mock({ shufflePoll: true, statusFor: (i) => idToStatus[i] ?? 3 });
    vi.stubGlobal("fetch", mock.fetchMock);
    const { body } = await runJudge(5);
    expect(body.results!.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(body.results!.map((r) => r.status)).toEqual(["AC", "WA", "TLE", "CE", "RE"]);
  });

  it("createBatch 返回错误项（无 token）按位回填失败结果，不错位", async () => {
    const mock = judge0Mock({ errorIndex: 7 });
    vi.stubGlobal("fetch", mock.fetchMock);
    const { body } = await runJudge(10);
    expect(body.results).toHaveLength(10);
    expect(body.results![7].id).toBe(8);
    expect(body.results![7].status).toBe("RE");
    expect(body.results!.filter((r) => r.status === "AC")).toHaveLength(9);
  });

  it("batch 端点不可用（404）时回退到单条提交，结果仍完整有序", async () => {
    const mock = judge0Mock({ batch404: true });
    vi.stubGlobal("fetch", mock.fetchMock);
    const { status, body } = await runJudge(6);
    expect(status).toBe(200);
    expect(body.results).toHaveLength(6);
    expect(body.results!.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(mock.calls.singleCreate).toBe(6);
    expect(body.results!.every((r) => r.status === "AC")).toBe(true);
  });

  it("AC 判定下 actual 为解码后的 stdout", async () => {
    const mock = judge0Mock();
    vi.stubGlobal("fetch", mock.fetchMock);
    const { body } = await runJudge(1);
    expect(body.results![0].status).toBe("AC");
    expect(decode(encode("ok"))).toBe("ok");
    expect(body.results![0].actual).toBe("ok");
  });
});

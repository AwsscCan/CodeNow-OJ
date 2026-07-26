import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BatchUnsupportedError,
  chunk,
  createBatch,
  decode,
  encode,
  pollBatchUntilDone,
  submitSingle,
  __resetBatchSupportForTests,
  type SubmissionPayload,
} from "../../app/api/_lib/judge0-client";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => __resetBatchSupportForTests());

// 确定性虚拟时钟：sleep 推进时间并记录每次延迟，now 读取虚拟时间
function makeClock() {
  let t = 0;
  const delays: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => { delays.push(ms); t += ms; },
    delays,
    get elapsed() { return t; },
  };
}

function samplePayload(): SubmissionPayload {
  return { language_id: 54, source_code: encode("int main(){}"), stdin: encode("1"), expected_output: encode("1"), cpu_time_limit: 3, wall_time_limit: 6, memory_limit: 262144 };
}

function tokensOf(url: string): string[] {
  return new URL(url).searchParams.get("tokens")!.split(",");
}

describe("encode/decode", () => {
  it("对 UTF-8（含中文与 emoji）与大串 round-trip 无损", () => {
    for (const s of ["", "abc", "a=b+c", "中文测试", "💥🚀混合", "l1\nl2\t", "x".repeat(50000)]) {
      expect(decode(encode(s))).toBe(s);
    }
  });

  it("encode 输出与旧 String.fromCharCode 版本 byte-for-byte 相同", () => {
    const legacy = (value: string) => {
      const bytes = new TextEncoder().encode(value);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };
    for (const s of ["hello", "中文", "💥", "a".repeat(1000), "a=b\nc=d"]) {
      expect(encode(s)).toBe(legacy(s));
    }
  });

  it("decode 容错：undefined/null/空/非法 base64 均返回空串且不抛", () => {
    expect(decode(undefined)).toBe("");
    expect(decode(null)).toBe("");
    expect(decode("")).toBe("");
    expect(decode("非法base64@@")).toBe("");
  });
});

describe("chunk", () => {
  it("按大小切块，最后一块可不满", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk(Array.from({ length: 50 }, (_, i) => i), 20).map((c) => c.length)).toEqual([20, 20, 10]);
    expect(chunk([], 20)).toEqual([]);
  });
});

describe("pollBatchUntilDone", () => {
  it("自适应退避：前几轮延迟取 JUDGE_BACKOFF_MS 前缀 [60,60,100]", async () => {
    const clock = makeClock();
    let poll = 0;
    const fetchMock = vi.fn(async (url: string) => {
      poll += 1;
      const toks = tokensOf(url);
      return new Response(JSON.stringify({ submissions: toks.map((t) => ({ token: t, status: { id: poll >= 3 ? 3 : 2 } })) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const map = await pollBatchUntilDone(["a"], "status", { sleep: clock.sleep, now: clock.now });
    expect(map.get("a")!.status.id).toBe(3);
    expect(clock.delays.slice(0, 3)).toEqual([60, 60, 100]);
  });

  it("逐 token 收敛：已终态的 token 从后续轮询中剔除", async () => {
    const clock = makeClock();
    let poll = 0;
    const fetchMock = vi.fn(async (url: string) => {
      poll += 1;
      const toks = tokensOf(url);
      return new Response(JSON.stringify({ submissions: toks.map((t) => ({ token: t, status: { id: t === "a" ? 3 : poll >= 3 ? 3 : 2 } })) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const map = await pollBatchUntilDone(["a", "b"], "status", { sleep: clock.sleep, now: clock.now });
    expect(map.get("a")!.status.id).toBe(3);
    expect(map.get("b")!.status.id).toBe(3);
    // 第一轮后 a 终态，第二轮起 tokens= 只应包含 b
    expect(tokensOf(fetchMock.mock.calls[1][0] as string)).toEqual(["b"]);
  });

  it("每次 GET 的 token 数不超过 JUDGE_BATCH_SIZE=20", async () => {
    const clock = makeClock();
    const tokens = Array.from({ length: 45 }, (_, i) => `t${i}`);
    const sizes: number[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      const toks = tokensOf(url);
      sizes.push(toks.length);
      return new Response(JSON.stringify({ submissions: toks.map((t) => ({ token: t, status: { id: 3 } })) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await pollBatchUntilDone(tokens, "status", { sleep: clock.sleep, now: clock.now });
    expect(Math.max(...sizes)).toBeLessThanOrEqual(20);
    expect([...sizes].sort((a, b) => b - a).slice(0, 3)).toEqual([20, 20, 5]);
  });

  it("429 退避重试不抛错，且尊重 Retry-After（>=1000ms）", async () => {
    const clock = makeClock();
    let poll = 0;
    const fetchMock = vi.fn(async () => {
      poll += 1;
      if (poll === 1) return new Response("", { status: 429, headers: { "Retry-After": "1" } });
      return new Response(JSON.stringify({ submissions: [{ token: "a", status: { id: 3 } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const map = await pollBatchUntilDone(["a"], "status", { sleep: clock.sleep, now: clock.now });
    expect(map.get("a")!.status.id).toBe(3);
    expect(clock.delays.some((d) => d >= 1000)).toBe(true);
  });

  it("5xx 也退避重试不抛错", async () => {
    const clock = makeClock();
    let poll = 0;
    const fetchMock = vi.fn(async () => {
      poll += 1;
      if (poll === 1) return new Response("", { status: 503 });
      return new Response(JSON.stringify({ submissions: [{ token: "a", status: { id: 3 } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const map = await pollBatchUntilDone(["a"], "status", { sleep: clock.sleep, now: clock.now });
    expect(map.get("a")!.status.id).toBe(3);
  });

  it("预算耗尽才停止，仍未终态的 token 不进结果 Map", async () => {
    const clock = makeClock();
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ submissions: tokensOf(url).map((t) => ({ token: t, status: { id: 2 } })) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const map = await pollBatchUntilDone(["a"], "status", { sleep: clock.sleep, now: clock.now, budgetMs: 500 });
    expect(map.has("a")).toBe(false);
    expect(clock.elapsed).toBeGreaterThanOrEqual(500);
  });

  it("GET 响应缺失的 token 视为仍未完成，继续下一轮", async () => {
    const clock = makeClock();
    let poll = 0;
    const fetchMock = vi.fn(async (url: string) => {
      poll += 1;
      const toks = tokensOf(url);
      // 第一轮故意漏掉 b，只返回 a(未完成)
      const subs = poll === 1 ? [{ token: "a", status: { id: 2 } }] : toks.map((t) => ({ token: t, status: { id: 3 } }));
      return new Response(JSON.stringify({ submissions: subs }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const map = await pollBatchUntilDone(["a", "b"], "status", { sleep: clock.sleep, now: clock.now });
    expect(map.get("a")!.status.id).toBe(3);
    expect(map.get("b")!.status.id).toBe(3);
  });
});

describe("createBatch", () => {
  it("按 <=20 分块 POST，并按位置对齐拼回 token 数组", async () => {
    const posts: number[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const subs = JSON.parse(init.body as string).submissions as unknown[];
      const batchIndex = posts.length;
      posts.push(subs.length);
      return new Response(JSON.stringify(subs.map((_s, i) => ({ token: `b${batchIndex}_${i}` }))), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await createBatch(Array.from({ length: 50 }, () => samplePayload()));
    expect(out).toHaveLength(50);
    expect(posts).toEqual([20, 20, 10]);
    expect(out.every((o) => typeof o.token === "string")).toBe(true);
    expect(out[0].token).toBe("b0_0");
    expect(out[20].token).toBe("b1_0");
    expect(out[40].token).toBe("b2_0");
  });

  it("混合 {token}+{字段错误} 数组：错误项无 token 按位保留，不错位", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const subs = JSON.parse(init.body as string).submissions as unknown[];
      return new Response(JSON.stringify(subs.map((_s, i) => (i === 7 ? { source_code: ["can't be blank"] } : { token: `t${i}` }))), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await createBatch(Array.from({ length: 10 }, () => samplePayload()));
    expect(out).toHaveLength(10);
    expect(out[7].token).toBeUndefined();
    expect(out[7].error).toBeDefined();
    expect(out.filter((o) => typeof o.token === "string")).toHaveLength(9);
  });

  it("POST batch 提交的 source_code 用标准 base64 编码（线上格式不变）", async () => {
    let capturedBody = "";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      const subs = JSON.parse(init.body as string).submissions as unknown[];
      return new Response(JSON.stringify(subs.map((_s, i) => ({ token: `t${i}` }))), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await createBatch([{ ...samplePayload(), source_code: encode("int main(){return 0;}") }]);
    const sub = JSON.parse(capturedBody).submissions[0];
    expect(sub.source_code).toBe(encode("int main(){return 0;}"));
  });

  it("batch 端点 404：置 batchSupported=false 并抛 BatchUnsupportedError", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "batch ... not found" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createBatch([samplePayload()])).rejects.toBeInstanceOf(BatchUnsupportedError);
  });

  it("探测缓存：判定不支持后不再重复探测 batch 端点", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createBatch([samplePayload()])).rejects.toBeInstanceOf(BatchUnsupportedError);
    const afterFirst = fetchMock.mock.calls.length;
    await expect(createBatch([samplePayload()])).rejects.toBeInstanceOf(BatchUnsupportedError);
    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });

  it("__resetBatchSupportForTests 后会重新探测", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createBatch([samplePayload()])).rejects.toBeInstanceOf(BatchUnsupportedError);
    const afterFirst = fetchMock.mock.calls.length;
    __resetBatchSupportForTests();
    await expect(createBatch([samplePayload()])).rejects.toBeInstanceOf(BatchUnsupportedError);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});

describe("submitSingle", () => {
  it("创建单条提交并轮询到终态返回结果", async () => {
    const clock = makeClock();
    let poll = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ token: "solo" }), { status: 201 });
      poll += 1;
      return new Response(JSON.stringify({ token: "solo", status: { id: poll >= 2 ? 3 : 2 }, stdout: encode("42") }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitSingle(samplePayload(), "status,stdout", { sleep: clock.sleep, now: clock.now });
    expect(result!.status.id).toBe(3);
    expect(decode(result!.stdout)).toBe("42");
  });
});

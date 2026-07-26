import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLanguageCacheForTests } from "../../app/api/_lib/judge0-client";
import { verifyTests, filterVerifiedTests } from "../../app/api/_lib/verify-tests";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => __resetLanguageCacheForTests());

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

// Judge0 mock：/languages 给编译器 id；create 回 token；poll 依 opts 返回状态与 stdout
function judge0Mock(opts: { stdout?: string; statusId?: number; compileOutput?: string; stderr?: string } = {}) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/languages")) return new Response(JSON.stringify([{ id: 54, name: "C++ (GCC 14.1.0)" }]), { status: 200 });
    if (u.includes("/submissions") && init?.method === "POST") return new Response(JSON.stringify({ token: "tok" }), { status: 201 });
    return new Response(JSON.stringify({
      stdout: b64(opts.stdout ?? "42"),
      stderr: opts.stderr ? b64(opts.stderr) : "",
      compile_output: opts.compileOutput ? b64(opts.compileOutput) : "",
      message: "",
      status: { id: opts.statusId ?? 3 },
    }), { status: 200 });
  });
}

describe("verifyTests", () => {
  it("参考解答输出与期望一致时标记 verified=true", async () => {
    vi.stubGlobal("fetch", judge0Mock({ stdout: "42", statusId: 3 }));
    const result = await verifyTests([{ input: "x", output: "42" }], "int main(){}");
    expect(result[0].verified).toBe(true);
    expect(result[0].actualOutput).toBeUndefined();
  });

  it("输出不一致时 verified=false 并带上实际输出", async () => {
    vi.stubGlobal("fetch", judge0Mock({ stdout: "42", statusId: 3 }));
    const result = await verifyTests([{ input: "x", output: "99" }], "int main(){}");
    expect(result[0].verified).toBe(false);
    expect(result[0].actualOutput).toBe("42");
  });

  it("参考解答编译错误(id=6)时 verified=false", async () => {
    vi.stubGlobal("fetch", judge0Mock({ statusId: 6, compileOutput: "error: expected ';'" }));
    const result = await verifyTests([{ input: "x", output: "42" }], "int main(){}");
    expect(result[0].verified).toBe(false);
    expect(result[0].actualOutput).toContain("expected ';'");
  });

  it("参考解答超时(id=5)时 verified=false", async () => {
    vi.stubGlobal("fetch", judge0Mock({ statusId: 5 }));
    const result = await verifyTests([{ input: "x", output: "42" }], "int main(){}");
    expect(result[0].verified).toBe(false);
    expect(result[0].actualOutput).toContain("超时");
  });

  it("空测试或空参考解答时全部未验证", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await verifyTests([], "int main(){}")).toEqual([]);
    const result = await verifyTests([{ input: "x", output: "1" }], "   ");
    expect(result[0].verified).toBe(false);
  });

  it("Judge0 编译器列表不可用时跳过验证，全部未验证", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/languages")) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({ status: { id: 3 } }), { status: 200 });
    }));
    const result = await verifyTests([{ input: "x", output: "42" }], "int main(){}");
    expect(result.every((t) => t.verified === false)).toBe(true);
  });

  it("多个测试点顺序保持，逐点独立判定", async () => {
    vi.stubGlobal("fetch", judge0Mock({ stdout: "5", statusId: 3 }));
    const tests = [{ input: "a", output: "5" }, { input: "b", output: "9" }, { input: "c", output: "5" }];
    const result = await verifyTests(tests, "int main(){}");
    expect(result.map((t) => t.verified)).toEqual([true, false, true]);
    expect(result.map((t) => t.input)).toEqual(["a", "b", "c"]);
  });
});

describe("filterVerifiedTests", () => {
  it("只保留 verified 的测试并剥离内部字段", () => {
    const filtered = filterVerifiedTests([
      { input: "a", output: "1", verified: true },
      { input: "b", output: "2", verified: false, actualOutput: "3" },
    ]);
    expect(filtered).toEqual([{ input: "a", output: "1" }]);
  });
});

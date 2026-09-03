// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useJudge } from "../../app/hooks/use-judge";

afterEach(() => vi.unstubAllGlobals());

describe("OJ run and submit workflow", () => {
  it("keeps test runs local and creates history only for an explicit submit", async () => {
    const result = { id: 1, status: "AC", actual: "3", expected: "3", duration: 9 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/judge") return Response.json({ results: [result] });
      if (String(input) === "/api/submissions") return Response.json({ record: {
        id: "saved", problemId: "P1", problemTitle: "Sum", status: "答案正确", passed: "1/1", sourceCode: "code",
        results: [result], totalDurationMs: 9, submittedAt: "2026-09-03T00:00:00.000Z",
      } }, { status: 201 });
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result: hook } = renderHook(() => useJudge());
    const options = { sourceCode: "code", tests: [{ id: 1, input: "1 2", output: "3" }], problemId: "P1", problemTitle: "Sum", onMascotReact: vi.fn() };

    let runResult: Awaited<ReturnType<typeof hook.current.runTests>>;
    await act(async () => { runResult = await hook.current.runTests(options); });
    expect(runResult!.submission).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/judge"]);

    let submitResult: Awaited<ReturnType<typeof hook.current.runTests>>;
    await act(async () => { submitResult = await hook.current.runTests({ ...options, submit: true }); });
    expect(submitResult!.submission).toMatchObject({ id: "saved", totalDurationMs: 9 });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/judge", "/api/judge", "/api/submissions"]);
  });
});

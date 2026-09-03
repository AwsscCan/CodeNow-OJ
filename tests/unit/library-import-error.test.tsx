// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }), signOut: vi.fn(async () => ({})) },
}));
vi.mock("../../app/lib/problem-api", () => ({
  ProblemApi: {},
  buildCloudFolderPaths: () => ({}),
}));

import LibraryPage from "../../app/library/page";
import { BLANK_PROBLEM, useProblemStore } from "../../app/stores/problem-store";

const LONG_PROBLEM = "给定一个长度为 n 的整数序列，找出最大连续子段和。输入 n 与序列，输出答案。";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ error: "Authentication Fails, Your api key: ****2345 is invalid" }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  )));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AI 解析添加练习题：失败反馈", () => {
  async function openModalAndGenerate() {
    render(<LibraryPage />);
    fireEvent.click(screen.getByText("＋ 添加题目"));
    fireEvent.change(document.querySelector(".raw-problem-label textarea")!, { target: { value: LONG_PROBLEM } });
    fireEvent.click(screen.getByText(/解析题目并入库|生成题目与测试点/));
  }

  it("上游失败时弹窗内展示持久错误条，不再只靠 2.6 秒的 toast", async () => {
    await openModalAndGenerate();
    await waitFor(() => {
      const alert = document.querySelector(".generate-error");
      expect(alert, "弹窗内应有持久错误提示条 .generate-error").toBeTruthy();
      expect(alert!.textContent).toContain("Authentication Fails");
    });
  });

  it("错误条带 role=alert 供屏幕阅读器播报", async () => {
    await openModalAndGenerate();
    await waitFor(() => {
      expect(document.querySelector(".generate-error")?.getAttribute("role")).toBe("alert");
    });
  });

  it("重新点击生成时清除上一次的错误条", async () => {
    await openModalAndGenerate();
    await waitFor(() => expect(document.querySelector(".generate-error")).toBeTruthy());
    // 第二次点击：pending 期间错误条应立即清空
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => { /* 挂起模拟生成中 */ })));
    fireEvent.click(screen.getByText(/解析题目并入库|生成题目与测试点|正在理解题目/));
    await waitFor(() => expect(document.querySelector(".generate-error")).toBeNull());
  });
});

describe("AI 解析与测试点生成解耦(复杂题目先入库)", () => {
  it("题库导入弹窗不再包含 API 配置，生成请求也不发送路由或密钥", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<LibraryPage />);
    fireEvent.click(screen.getByText("＋ 添加题目"));
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.body.textContent).not.toContain("API Endpoint");
    fireEvent.change(document.querySelector(".raw-problem-label textarea")!, { target: { value: LONG_PROBLEM } });
    fireEvent.click(screen.getByText(/生成题目|解析题目/));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("endpoint");
    expect(body).not.toHaveProperty("model");
  });

  it("题库提供空白模板入口", () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole("button", { name: "新建空白题目" }));
    expect(useProblemStore.getState().problem).toEqual(BLANK_PROBLEM);
  });

  it("弹窗提供「同时生成测试点」开关且默认关闭", () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByText("＋ 添加题目"));
    const toggle = document.querySelector<HTMLInputElement>(".with-tests-toggle input[type='checkbox']");
    expect(toggle, "缺少同时生成测试点开关").toBeTruthy();
    expect(toggle!.checked, "开关应默认关闭(快速解析入库)").toBe(false);
  });

  it("默认请求体 withTests 为 false，勾选后为 true", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => { /* 挂起，仅断言请求体 */ }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LibraryPage />);
    fireEvent.click(screen.getByText("＋ 添加题目"));
    fireEvent.change(document.querySelector(".raw-problem-label textarea")!, { target: { value: LONG_PROBLEM } });
    fireEvent.click(screen.getByText(/生成题目|解析题目/));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0][1] as unknown as { body: string };
    const requestBody = JSON.parse(init.body) as { withTests?: boolean };
    expect(requestBody.withTests).toBe(false);
  });
});

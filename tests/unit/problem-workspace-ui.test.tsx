// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest 要求环境指令先于 import。 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/problem/P1001",
  useParams: () => ({ id: "P1001" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }), signOut: vi.fn(async () => ({})) },
}));
vi.mock("../../app/CppEditor", () => ({ CppEditor: () => <div data-testid="cpp-editor" /> }));
vi.mock("../../app/components/notes/problem-notes-panel", () => ({ ProblemNotesPanel: () => null }));
vi.mock("../../app/hooks/use-cloud-save", () => ({
  useCloudSave: () => ({
    status: "local-only", conflict: null, queueSave: vi.fn(),
    discardPending: vi.fn(), retryWithVersion: vi.fn(), retryPending: vi.fn(),
  }),
}));
vi.mock("../../app/hooks/use-conversation-sync", () => ({
  useConversationSync: () => ({ append: vi.fn(async () => {}) }),
}));
const { runTestsMock } = vi.hoisted(() => ({ runTestsMock: vi.fn() }));
vi.mock("../../app/hooks/use-judge", () => ({
  useJudge: () => ({ running: false, runTests: runTestsMock }),
}));

import ProblemPage from "../../app/problem/[id]/page";
import { useAiStore } from "../../app/stores/ai-store";
import { useMascotStore } from "../../app/stores/mascot-store";
import { useMemoryStore } from "../../app/stores/memory-store";
import { INITIAL_PROBLEM, useProblemStore } from "../../app/stores/problem-store";
import { useThemeStore } from "../../app/stores/theme-store";

function configureAi() {
  useAiStore.setState({
    configured: true, hasApiKey: true, provider: "deepseek", endpoint: "https://api.deepseek.com",
    model: "deepseek-chat", source: "manual", version: 1, updatedAt: "2026-09-03T00:00:00.000Z",
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));
  // 测试卫生：主题/对话/判题状态互不泄漏
  useThemeStore.setState({ themeMode: "light" });
  useAiStore.setState({ configured: false, hasApiKey: false, chatMessages: [] });
  useProblemStore.setState({ results: [], history: [], tab: "problem" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("桌宠投放区收窄到编辑器代码区", () => {
  it("投放区是编辑器代码区(.editor-area)，而非整个 code-panel", () => {
    const { container } = render(<ProblemPage />);
    const zone = container.querySelector("[data-mascot-drop-zone]");
    expect(zone, "页面缺少桌宠投放区").toBeTruthy();
    expect(zone!.classList.contains("editor-area"), "投放区应挂在 .editor-area 上").toBe(true);
  });

  it("控制台不在投放区内(拖到控制台不触发比试)", () => {
    const { container } = render(<ProblemPage />);
    const zone = container.querySelector("[data-mascot-drop-zone]");
    const consolePanel = container.querySelector(".console-panel");
    expect(consolePanel, "页面缺少控制台").toBeTruthy();
    expect(zone!.contains(consolePanel), "控制台不应位于投放区子树内").toBe(false);
  });

  it("requestAiSolve 触发后弹出高木比试确认框", () => {
    const { container } = render(<ProblemPage />);
    expect(container.querySelector(".mascot-ai-modal")).toBeNull();
    act(() => { useMascotStore.getState().requestAiSolve(); });
    expect(container.querySelector(".mascot-ai-modal"), "拖入代码区后应弹出比试确认框").toBeTruthy();
  });

  it("比试确认框携带高木头图装饰(sunny-selfie)", () => {
    const { container } = render(<ProblemPage />);
    act(() => { useMascotStore.getState().requestAiSolve(); });
    const portrait = container.querySelector(".mascot-ai-modal .mascot-ai-portrait");
    expect(portrait, "比试框缺少高木头图").toBeTruthy();
    expect(portrait!.getAttribute("src")).toContain("sunny-selfie");
    expect(portrait!.getAttribute("alt")).toBe("");
    expect(portrait!.getAttribute("aria-hidden")).toBe("true");
  });

  it("挂载前的历史递增不会误触发比试确认框", () => {
    useMascotStore.getState().requestAiSolve();
    const { container } = render(<ProblemPage />);
    expect(container.querySelector(".mascot-ai-modal"), "历史递增值不应在进入页面时误弹窗").toBeNull();
  });
});

describe("同步状态徽章", () => {
  it("local-only 渲染「本地保存」文案与状态圆点", () => {
    const { container } = render(<ProblemPage />);
    const badge = container.querySelector(".sync-status.local-only");
    expect(badge, "缺少 .sync-status.local-only 徽章").toBeTruthy();
    expect(badge!.textContent).toContain("本地保存");
    expect(badge!.querySelector(".sync-dot[aria-hidden='true']"), "缺少状态圆点").toBeTruthy();
  });
});

describe("工作区职责边界", () => {
  it("做题页不提供导入题目或 API 配置表单", () => {
    const { container, queryByText } = render(<ProblemPage />);
    expect(queryByText("⇧ 导入题目")).toBeNull();
    expect(container.querySelector('input[placeholder*="API"]')).toBeNull();
    expect(container.textContent).not.toContain("API Endpoint");
  });

  it("AI 请求只发送任务上下文，不发送凭据或模型路由", async () => {
    configureAi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).includes("/api/ai")) return new Response(JSON.stringify({ code: "int main(){}" }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("✦ AI 解题"));
    fireEvent.click(getByText(/生成 C\+\+17 解答/));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/ai"))).toBe(true));
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/ai"))!;
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("endpoint");
    expect(body).not.toHaveProperty("model");
  });
});

describe("提交快照详情", () => {
  it("展示提交总耗时和逐测试点结果", () => {
    const { container } = render(<ProblemPage />);
    act(() => useProblemStore.setState({
      selectedSubmission: {
        id: "snapshot-1", problemId: "P1001", problemTitle: "A+B", status: "未通过", passed: "1/2",
        sourceCode: "int main(){}", submittedAt: "2026-09-03T12:00:00.000Z", totalDurationMs: 31,
        results: [
          { id: 1, status: "AC", actual: "3", expected: "3", duration: 11 },
          { id: 2, status: "WA", actual: "4", expected: "5", duration: 20 },
        ],
      },
    }));
    const modal = container.querySelector(".submission-modal")!;
    expect(modal.textContent).toContain("总耗时 31 ms");
    expect(modal.textContent).toContain("测试点 2");
    expect(modal.textContent).toContain("WA");
    expect(modal.textContent).toContain("20 ms");
  });
});

describe("少女主题 AI 对话高木化", () => {
  afterEach(() => {
    useThemeStore.setState({ themeMode: "light" });
  });

  it("少女主题下工作区按钮文案高木化：问高木 / 高木解题", () => {
    useThemeStore.setState({ themeMode: "girl" });
    const { getByText, queryByText } = render(<ProblemPage />);
    expect(getByText("◈ 问高木")).toBeTruthy();
    expect(getByText("✦ 高木解题")).toBeTruthy();
    expect(queryByText("◈ 问 AI")).toBeNull();
  });

  it("少女主题下聊天抽屉标题、头像与开场白切换为高木同学", () => {
    useThemeStore.setState({ themeMode: "girl" });
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("◈ 问高木"));
    const drawer = container.querySelector(".chat-drawer");
    expect(drawer, "缺少聊天抽屉").toBeTruthy();
    expect(drawer!.classList.contains("takagi-mode"), "少女主题抽屉应带 takagi-mode 类(库存图背景)").toBe(true);
    expect(drawer!.querySelector("header")!.textContent).toContain("高木同学");
    expect(drawer!.querySelector(".chat-welcome")!.textContent).toContain("偷偷");
    expect(drawer!.querySelector(".chat-context img, .chat-welcome img"), "缺少高木头像装饰").toBeTruthy();
  });

  it("少女主题下高木解题弹窗特化：标题、口吻与头图", () => {
    useThemeStore.setState({ themeMode: "girl" });
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("✦ 高木解题"));
    const modal = container.querySelector(".ai-modal");
    expect(modal, "缺少解题弹窗").toBeTruthy();
    expect(modal!.textContent).toContain("让高木同学出手");
    expect(modal!.textContent).toMatch(/勝負|比一局|挑错/);
    const portrait = modal!.querySelector("img.mascot-ai-portrait");
    expect(portrait, "高木解题弹窗缺少头图").toBeTruthy();
    expect(portrait!.getAttribute("src")).toContain("portrait-sailor");
  });

  it("亮色主题解题弹窗保持原文案", () => {
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("✦ AI 解题"));
    const modal = container.querySelector(".ai-modal");
    expect(modal!.textContent).toContain("让 AI 编写解答");
    expect(modal!.querySelector("img.mascot-ai-portrait")).toBeNull();
  });

  it("少女主题下发送消息携带 persona=takagi", async () => {
    useThemeStore.setState({ themeMode: "girl" });
    configureAi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/chat")) return new Response(JSON.stringify({ answer: "ふふ，先讲思路哦。" }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("◈ 问高木"));
    fireEvent.change(container.querySelector(".chat-drawer textarea")!, { target: { value: "这题怎么做？" } });
    fireEvent.click(getByText("发送"));
    await vi.waitFor(() => {
      const chatCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/chat"));
      expect(chatCall, "应发出 /api/chat 请求").toBeTruthy();
      const body = JSON.parse((chatCall![1] as { body: string }).body) as { persona?: string };
      expect(body.persona).toBe("takagi");
    });
  });

  it("亮色主题聊天保持 AI 助教，不带 persona", async () => {
    configureAi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/chat")) return new Response(JSON.stringify({ answer: "先看思路。" }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("◈ 问 AI"));
    const drawer = container.querySelector(".chat-drawer")!;
    expect(drawer.querySelector("header")!.textContent).toContain("AI 助教");
    expect(drawer.classList.contains("takagi-mode")).toBe(false);
    fireEvent.change(container.querySelector(".chat-drawer textarea")!, { target: { value: "这题怎么做？" } });
    fireEvent.click(getByText("发送"));
    await vi.waitFor(() => {
      const chatCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/chat"));
      expect(chatCall).toBeTruthy();
      const body = JSON.parse((chatCall![1] as { body: string }).body) as { persona?: string };
      expect(body.persona).toBeUndefined();
    });
  });
});

describe("聊天新消息自动滚动", () => {
  it("消息追加后消息区滚动到底部", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { get: () => 500, configurable: true });
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("◈ 问 AI"));
    const messages = container.querySelector(".chat-messages") as HTMLElement;
    expect(messages).toBeTruthy();
    act(() => { useAiStore.getState().addChatMessage({ role: "assistant", content: "新消息来了" }); });
    await vi.waitFor(() => expect(messages.scrollTop).toBe(500));
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)["scrollHeight"];
  });
});

describe("Esc 关闭浮层", () => {
  it("Esc 收起 AI 解题弹窗与聊天抽屉", () => {
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("✦ AI 解题"));
    expect(container.querySelector(".ai-modal")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".ai-modal")).toBeNull();
    fireEvent.click(getByText("◈ 问 AI"));
    expect(container.querySelector(".chat-drawer")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".chat-drawer")).toBeNull();
  });
});

describe("样例卡复制按钮", () => {
  it("输入与输出都有复制按钮，输出复制写入期望输出", () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM } });
    const { container } = render(<ProblemPage />);
    const firstCard = container.querySelector(".sample-card")!;
    const copyButtons = Array.from(firstCard.querySelectorAll("button")).filter((b) => b.textContent === "复制");
    expect(copyButtons.length, "样例输入与输出都应有复制按钮").toBe(2);
    fireEvent.click(copyButtons[1]);
    expect(writeText).toHaveBeenCalledWith(INITIAL_PROBLEM.samples[0].output);
  });
});

describe("高木读取判题动态(提交记录/测试状态)", () => {
  it("chat 请求携带最近一次运行结果与提交记录摘要", async () => {
    useProblemStore.setState({
      problem: { ...INITIAL_PROBLEM },
      results: [
        { id: 1, status: "AC", actual: "3", expected: "3", duration: 4 },
        { id: 2, status: "WA", actual: "2", expected: "73", duration: 5 },
      ],
      history: [{ id: "h1", problemId: "P1001", problemTitle: "A + B Problem", status: "部分通过", passed: "1/2", sourceCode: "int main(){}", submittedAt: "2026-07-26T12:00:00.000Z" }],
    });
    configureAi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/chat")) return new Response(JSON.stringify({ answer: "看第 2 个点哦。" }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("◈ 问 AI"));
    fireEvent.change(container.querySelector(".chat-drawer textarea")!, { target: { value: "我现在的进度怎么样？" } });
    fireEvent.click(getByText("发送"));
    await vi.waitFor(() => {
      const chatCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/chat"));
      expect(chatCall).toBeTruthy();
      const body = JSON.parse((chatCall![1] as { body: string }).body) as { judge?: { lastRun?: { passed: number; total: number }; history?: unknown[] } };
      expect(body.judge, "chat 请求应携带判题动态").toBeTruthy();
      expect(body.judge!.lastRun).toMatchObject({ passed: 1, total: 2 });
      expect(body.judge!.history).toHaveLength(1);
    });
  });
});

describe("对话框展示思考内容(reasoning)", () => {
  it("assistant 消息带 reasoning 时渲染可折叠思考块，高木模式用人设文案", () => {
    useThemeStore.setState({ themeMode: "girl" });
    useAiStore.setState({ chatMessages: [{ role: "assistant", content: "先看边界哦。", reasoning: "用户在问进度，我应该先确认第 2 个测试点的差异…" }] });
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("◈ 问高木"));
    const reasoning = container.querySelector(".chat-reasoning");
    expect(reasoning, "缺少 .chat-reasoning 思考折叠块").toBeTruthy();
    expect(reasoning!.tagName.toLowerCase()).toBe("details");
    expect(reasoning!.textContent).toContain("高木的小心思");
    expect(reasoning!.textContent).toContain("第 2 个测试点");
    useThemeStore.setState({ themeMode: "light" });
    useAiStore.setState({ chatMessages: [] });
  });
});

describe("用户记忆池：沉淀与注入", () => {
  beforeEach(() => {
    useMemoryStore.setState({ memories: [] });
  });

  it("判题失败后自动沉淀错误记忆", async () => {
    runTestsMock.mockResolvedValueOnce({
      results: [
        { id: 1, status: "AC", actual: "3", expected: "3", duration: 4 },
        { id: 2, status: "WA", actual: "2", expected: "73", duration: 5 },
      ],
      diagnostic: "",
      submission: null,
    });
    const { getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("▷ 运行测试"));
    await vi.waitFor(() => {
      const memories = useMemoryStore.getState().memories;
      expect(memories.length, "判题失败应沉淀记忆").toBeGreaterThan(0);
      expect(memories[memories.length - 1].kind).toBe("mistake");
      expect(memories[memories.length - 1].text).toContain(INITIAL_PROBLEM.id);
    });
  });

  it("全 AC 雪耻：清除该题此前沉淀的错误记忆", async () => {
    useMemoryStore.getState().remember("mistake", `在「${INITIAL_PROBLEM.id} ${INITIAL_PROBLEM.title}」WA 过(1/2)，第 2 个点先挂`);
    runTestsMock.mockResolvedValueOnce({
      results: [
        { id: 1, status: "AC", actual: "3", expected: "3", duration: 4 },
        { id: 2, status: "AC", actual: "73", expected: "73", duration: 5 },
      ],
      diagnostic: "",
      submission: null,
    });
    const { getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("▷ 运行测试"));
    await vi.waitFor(() => {
      expect(useMemoryStore.getState().memories.some((m) => m.text.includes(INITIAL_PROBLEM.id)), "全 AC 后该题错误记忆应被清除").toBe(false);
    });
  });

  it("提问沉淀习惯记忆，且 chat 请求携带记忆池", async () => {
    useMemoryStore.getState().remember("mistake", "在「P1001」WA 过(1/2)");
    configureAi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/chat")) return new Response(JSON.stringify({ answer: "先看边界哦。" }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("◈ 问 AI"));
    fireEvent.change(container.querySelector(".chat-drawer textarea")!, { target: { value: "这道题的边界情况有哪些？" } });
    fireEvent.click(getByText("发送"));
    await vi.waitFor(() => {
      const chatCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/chat"));
      expect(chatCall).toBeTruthy();
      const body = JSON.parse((chatCall![1] as { body: string }).body) as { memories?: string[] };
      expect(body.memories, "chat 请求应携带记忆池").toBeTruthy();
      expect(body.memories!.some((m) => m.includes("WA 过"))).toBe(true);
      const memories = useMemoryStore.getState().memories;
      expect(memories.some((m) => m.kind === "habit" && /边界/.test(m.text)), "边界类提问应沉淀习惯").toBe(true);
    });
  });
});

describe("AI 解题请求瘦身", () => {
  it("只发送题面与前 2 个样例，不携带全部测试点", async () => {
    const manySamples = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, input: `${i}`, output: `${i}` }));
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM, samples: manySamples } });
    configureAi();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/ai")) return new Response(JSON.stringify({ code: "int main(){}" }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("✦ AI 解题"));
    fireEvent.click(getByText(/生成 C\+\+17 解答/));

    await vi.waitFor(() => {
      const aiCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/ai"));
      expect(aiCall, "应发出 /api/ai 请求").toBeTruthy();
      const body = JSON.parse((((aiCall as unknown as [unknown, { body: string }])[1]).body)) as { problem: { samples: unknown[] } };
      expect(body.problem.samples.length, "AI 解题不应携带全部测试点").toBeLessThanOrEqual(2);
    });
  });
});

describe("AI 测试点生成错误", () => {
  it("显示真实上游错误且保留已有测试点", async () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM }, tab: "problem" });
    configureAi();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/generate-tests")) {
        return new Response(JSON.stringify({ error: "unsupported parameter: response_format" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const { container } = render(<ProblemPage />);
    fireEvent.click(container.querySelectorAll(".panel-tabs button")[1]);
    fireEvent.click(container.querySelector(".ai-tests-button")!);

    await vi.waitFor(() => {
      expect(container.querySelector(".toast")?.textContent).toContain("unsupported parameter: response_format");
    });
    expect(container.querySelector(".toast")?.textContent).not.toContain("只生成了 0/18");
    expect(useProblemStore.getState().problem.samples).toEqual(INITIAL_PROBLEM.samples);
  });

  it("追加生成结果而不覆盖已有测试点", async () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM }, tab: "problem" });
    configureAi();
    let generationBody: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/generate-tests")) {
        generationBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          tests: [{ input: "7 8\n", output: "15\n", category: "ordinary", scale: 1 }],
          complexityReport: { generatedCount: 1, requestedCount: 18, batches: 2, qualityOk: false },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const { container } = render(<ProblemPage />);
    fireEvent.click(container.querySelectorAll(".panel-tabs button")[1]);
    fireEvent.click(container.querySelector(".ai-tests-button")!);

    await vi.waitFor(() => expect(useProblemStore.getState().problem.samples).toHaveLength(INITIAL_PROBLEM.samples.length + 1));
    expect(generationBody).toMatchObject({ qualityMode: "feedback" });
    expect(useProblemStore.getState().problem.samples.slice(0, INITIAL_PROBLEM.samples.length)).toEqual(INITIAL_PROBLEM.samples);
    expect(useProblemStore.getState().problem.samples.at(-1)).toMatchObject({ input: "7 8\n", output: "15\n" });
  });
});

describe("题面图片渲染", () => {
  it("description 中的 Markdown 图片经安全管线渲染为 img", async () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM, description: "如图所示：\n\n![示意图](https://example.com/figure.png)" } });
    const { container } = render(<ProblemPage />);
    await vi.waitFor(() => {
      const img = container.querySelector(".problem-md img");
      expect(img, "题面应渲染出图片").toBeTruthy();
      expect(img!.getAttribute("src")).toBe("https://example.com/figure.png");
    });
  });

  it("题面中的脚本标签被消毒剥除", async () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM, description: "正文<script>alert(1)</script>结束" } });
    const { container } = render(<ProblemPage />);
    await vi.waitFor(() => {
      const md = container.querySelector(".problem-md");
      expect(md, "题面应经 SafeMarkdown 渲染").toBeTruthy();
      expect(md!.querySelector("script")).toBeNull();
      expect(md!.textContent).toContain("正文");
    });
  });
});

describe("题面 LaTeX 公式渲染", () => {
  it("描述、输入格式和输出格式都通过 KaTeX 渲染公式", async () => {
    useProblemStore.setState({
      problem: {
        ...INITIAL_PROBLEM,
        description: "设序列长度为 $n$。",
        inputFormat: "输入满足 $$1 \\le n \\le 100$$。",
        outputFormat: "输出 $\\sum_{i=1}^{n} a_i$。",
      },
    });

    const { container } = render(<ProblemPage />);
    await vi.waitFor(() => {
      expect(container.querySelectorAll(".problem-md .katex")).toHaveLength(3);
      expect(container.querySelector(".problem-md .katex-display")).toBeTruthy();
    });
  });
});

describe("题目来源显示", () => {
  it("CSP 题目详情显示曙梦 OJ 来源而不是 AcWing 固定文案", () => {
    useProblemStore.setState({
      problem: {
        ...INITIAL_PROBLEM,
        id: "CS0331",
        sourceUrl: "https://oj.shumeng.tech/p/CSP202403A",
      },
    });

    const { container } = render(<ProblemPage />);
    const banner = container.querySelector(".source-banner");

    expect(banner, "有来源链接的题目应显示来源栏").toBeTruthy();
    expect(banner!.textContent).toContain("CSP 认证真题 · 曙梦 OJ");
    expect(banner!.textContent).not.toContain("AcWing 算法基础课题解目录");
  });
});

describe("手动编辑题面(修正 AI 识别错误)", () => {
  it("题面 Tab 提供编辑入口，编辑保存后写回 store", async () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM } });
    const { container, getByLabelText, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("✎ 编辑题面"));
    expect(container.querySelector(".problem-editor"), "点击后应出现题面编辑表单").toBeTruthy();
    fireEvent.change(getByLabelText("题目标题"), { target: { value: "人工修正的标题" } });
    fireEvent.click(getByText("保存修改"));
    expect(useProblemStore.getState().problem.title).toBe("人工修正的标题");
    expect(container.querySelector(".problem-editor"), "保存后应退出编辑态").toBeNull();
  });

  it("取消编辑不改动 store", () => {
    useProblemStore.setState({ problem: { ...INITIAL_PROBLEM } });
    const { container, getByLabelText, getByText } = render(<ProblemPage />);
    fireEvent.click(getByText("✎ 编辑题面"));
    fireEvent.change(getByLabelText("题目标题"), { target: { value: "不想要的修改" } });
    fireEvent.click(getByText("取消"));
    expect(useProblemStore.getState().problem.title).toBe(INITIAL_PROBLEM.title);
    expect(container.querySelector(".problem-editor")).toBeNull();
  });
});

"use client";

import { useParams, useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ProblemNotesPanel } from "../../components/notes/problem-notes-panel";
import { SafeMarkdown } from "../../components/notes/safe-markdown";
import { ProblemEditor } from "../../components/problem-editor";
import { SyncConflictDialog } from "../../components/sync-conflict-dialog";
import { Toast } from "../../components/toast";
import { Topbar } from "../../components/topbar";
import { useCloudSave, type CloudSaveResult, type SyncStatus } from "../../hooks/use-cloud-save";
import { useConversationSync } from "../../hooks/use-conversation-sync";
import { useEscapeClose } from "../../hooks/use-escape-close";
import { useJudge } from "../../hooks/use-judge";
import { useToast } from "../../hooks/use-toast";
import { authClient } from "../../lib/auth-client";
import { formatCppCode } from "../../lib/format-cpp";
import { buildCodeDiff } from "../../lib/code-diff";
import { ProblemApi, ProblemApiError, type CloudProblem } from "../../lib/problem-api";
import { getProblemSourceLabel } from "../../lib/problem-source";
import { useAiStore } from "../../stores/ai-store";
import { useLibraryStore } from "../../stores/library-store";
import { useMascotStore } from "../../stores/mascot-store";
import { distillJudgeMemory, distillQuestionMemory, useMemoryStore } from "../../stores/memory-store";
import { useProblemStore } from "../../stores/problem-store";
import type { Problem, SubmissionRecord } from "../../stores/problem-store";
import { useThemeStore } from "../../stores/theme-store";

const CppEditor = lazy(() => import("../../CppEditor").then((m) => ({ default: m.CppEditor })));

const testCategoryLabels: Record<string, string> = {
  boundary: "边界", special: "特殊", ordinary: "普通",
  adversarial: "反例", performance: "性能", sample: "样例", manual: "手动",
};

export default function ProblemPage() {
  const params = useParams();
  const router = useRouter();
  const problemId = String(params.id || "P1001");

  const store = useProblemStore();
  const { cloudId, setCloudState } = store;
  const libraryStore = useLibraryStore();
  const aiStore = useAiStore();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const { running, runTests } = useJudge();
  const setMascotContext = useMascotStore((s) => s.setContext);
  const setMascotPhase = useMascotStore((s) => s.setPhase);
  const reactMascotToJudge = useMascotStore((s) => s.reactToJudge);
  const session = authClient.useSession();
  const conversationSync = useConversationSync(session.data?.user.id ?? null, cloudId ?? store.problem.id);

  // Local UI state
  const [showAi, setShowAi] = useState(false);
  const [showMascotAiPrompt, setShowMascotAiPrompt] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOriginalCode, setAiOriginalCode] = useState<string | null>(null);
  const [aiProposedCode, setAiProposedCode] = useState<string | null>(null);
  const [generatingTests, setGeneratingTests] = useState(false);
  const [editingProblem, setEditingProblem] = useState(false);
  const [testGenStatus, setTestGenStatus] = useState("");
  const [testPointCount, setTestPointCount] = useState(18);
  const [workspaceResizing, setWorkspaceResizing] = useState(false);

  const saveCloudProblem = useCallback(async (payload: Problem, version: number, idempotencyKey: string, signal: AbortSignal): Promise<CloudSaveResult> => {
    if (!cloudId) return { ok: false, status: 404 };
    try {
      const metadata = await ProblemApi.update(cloudId, version, {
        problemCode: payload.id, title: payload.title, difficulty: payload.difficulty, timeLimit: payload.time, memoryLimit: payload.memory,
        description: payload.description, inputFormat: payload.inputFormat, outputFormat: payload.outputFormat,
        sourceUrl: payload.sourceUrl ?? null, extractionStatus: payload.extractionStatus ?? null,
      }, idempotencyKey, signal);
      const tests = await ProblemApi.replaceTests(cloudId, metadata.version, payload.samples.map((item) => ({
        input: item.input, expectedOutput: item.output, category: item.category, scale: item.scale, targets: item.targets, reason: item.reason,
      })), idempotencyKey, signal);
      setCloudState({ version: tests.version });
      return { ok: true, version: tests.version, updatedAt: tests.updatedAt };
    } catch (error) {
      if (error instanceof ProblemApiError && (error.status === 401 || error.status === 409)) return { ok: false, status: error.status, currentVersion: error.currentVersion, updatedAt: error.updatedAt };
      throw error;
    }
  }, [cloudId, setCloudState]);

  const saveCloudDraft = useCallback(async (sourceCode: string, version: number, idempotencyKey: string, signal: AbortSignal): Promise<CloudSaveResult> => {
    if (!cloudId) return { ok: false, status: 404 };
    try {
      const result = await ProblemApi.saveDraft("private", cloudId, "cpp", sourceCode, version, idempotencyKey, signal);
      setCloudState({ draftVersion: result.version });
      return { ok: true, version: result.version, updatedAt: result.updatedAt };
    } catch (error) {
      if (error instanceof ProblemApiError && (error.status === 401 || error.status === 409)) return { ok: false, status: error.status, currentVersion: error.currentVersion, updatedAt: error.updatedAt };
      throw error;
    }
  }, [cloudId, setCloudState]);

  const cloudSave = useCloudSave({
    enabled: Boolean(session.data?.user && cloudId), userId: session.data?.user.id ?? null,
    resourceType: "problem", resourceId: cloudId, version: store.version, save: saveCloudProblem,
  });
  const draftSave = useCloudSave({
    enabled: Boolean(session.data?.user && cloudId), userId: session.data?.user.id ?? null,
    resourceType: "draft", resourceId: cloudId, version: store.draftVersion, save: saveCloudDraft,
  });
  const queueProblemSave = cloudSave.queueSave;
  const queueDraftSave = draftSave.queueSave;

  useEffect(() => { if (cloudId) queueProblemSave(store.problem); }, [cloudId, queueProblemSave, store.problem]);
  useEffect(() => { if (cloudId) queueDraftSave(store.code); }, [cloudId, queueDraftSave, store.code]);
  useEffect(() => {
    const states = [cloudSave.status, draftSave.status];
    const status: SyncStatus = states.includes("conflicted") ? "conflicted" : states.includes("failed") ? "failed" : states.includes("saving") ? "saving" : states.every((item) => item === "local-only") ? "local-only" : "synced";
    setCloudState({ syncStatus: status });
  }, [cloudSave.status, draftSave.status, setCloudState]);

  function fromCloud(cloud: CloudProblem) {
    return {
      id: cloud.problemCode, title: cloud.title, difficulty: cloud.difficulty, time: cloud.timeLimit, memory: cloud.memoryLimit,
      description: cloud.description, inputFormat: cloud.inputFormat, outputFormat: cloud.outputFormat,
      sourceUrl: cloud.sourceUrl ?? undefined, extractionStatus: cloud.extractionStatus ?? undefined,
      samples: cloud.testCases.map((test, index) => ({ id: index + 1, input: test.input, output: test.expectedOutput, category: test.category ?? undefined, scale: test.scale ?? undefined, targets: test.targets ?? undefined, reason: test.reason ?? undefined })),
    };
  }

  async function useCloudVersion() {
    if (!store.cloudId) return;
    if (!cloudSave.conflict && draftSave.conflict) {
      const draft = await ProblemApi.getDraft("private", store.cloudId, "cpp");
      store.setCode(draft.draft.sourceCode);
      store.setCloudState({ draftVersion: draft.version });
      draftSave.discardPending(draft.version);
      return;
    }
    const { problem } = await ProblemApi.get(store.cloudId);
    store.setProblem(fromCloud(problem));
    store.setCloudState({ version: problem.version });
    cloudSave.discardPending(problem.version);
  }

  async function overwriteCloudVersion() {
    if (!store.cloudId) return;
    if (!cloudSave.conflict && draftSave.conflict) {
      const draft = await ProblemApi.getDraft("private", store.cloudId, "cpp");
      draftSave.retryWithVersion(store.code, draft.version);
      return;
    }
    const { problem } = await ProblemApi.get(store.cloudId);
    cloudSave.retryWithVersion(store.problem, problem.version);
  }

  function retryFailedSaves() {
    if (cloudSave.status === "failed") cloudSave.retryPending();
    if (draftSave.status === "failed") draftSave.retryPending();
  }

  const workspaceRef = useRef<HTMLElement>(null);
  const codePanelRef = useRef<HTMLElement>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const workspaceNextSplit = useRef(store.workspaceSplit);
  const workspaceResizeFrame = useRef<number | null>(null);

  // Load problem from store
  useEffect(() => {
    // Problem state is set by library page or persisted in localStorage
  }, [problemId]);

  // 桌宠：进入做题页即进入"观察编码"态；题面即时同步，代码防抖同步(避免每次按键都写 store)
  useEffect(() => { setMascotPhase("coding"); }, [setMascotPhase]);
  useEffect(() => { setMascotContext({ problemTitle: store.problem.title }); }, [store.problem.title, setMascotContext]);
  const codeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (codeSyncTimer.current) clearTimeout(codeSyncTimer.current);
    codeSyncTimer.current = setTimeout(() => setMascotContext({ codeExcerpt: store.code.slice(0, 2000) }), 600);
    return () => { if (codeSyncTimer.current) clearTimeout(codeSyncTimer.current); };
  }, [store.code, setMascotContext]);

  // 桌宠：被拖入代码区(aiSolveRequestId 递增)时先弹高木风"比试确认"框，点"是"才开 AI 解题弹窗。
  // 用 store 订阅只响应挂载期间的递增，跨题目导航的历史值天然不会误触发。
  const showAiRef = useRef(showAi);
  useEffect(() => { showAiRef.current = showAi; }, [showAi]);
  useEffect(() => useMascotStore.subscribe((state, prev) => {
    if (state.aiSolveRequestId > prev.aiSolveRequestId && !showAiRef.current) setShowMascotAiPrompt(true);
  }), []);

  // Sync test cases back to library IMMEDIATELY on every change + on unmount
  useEffect(() => {
    // Sync to library store archives
    libraryStore.syncProblemSamples(store.problem.id, store.problem.samples);
    // Also force-save the problem-store to localStorage directly, bypassing Zustand debounce
    try {
      const saved = localStorage.getItem("codenow-workspace");
      const data = saved ? JSON.parse(saved) : {};
      data.state = { ...data.state, problem: store.problem };
      localStorage.setItem("codenow-workspace", JSON.stringify(data));
    } catch { /* ignore */ }
  }, [store.problem]);

  // Sync on unmount / visibility change / page leave
  useEffect(() => {
    const saveNow = () => {
      libraryStore.syncProblemSamples(store.problem.id, store.problem.samples);
      try {
        const state = JSON.parse(localStorage.getItem("codenow-workspace") || "{}");
        state.state = { ...state.state, problem: store.problem, code: store.code };
        localStorage.setItem("codenow-workspace", JSON.stringify(state));
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", saveNow);
    document.addEventListener("visibilitychange", saveNow);
    return () => {
      saveNow();
      window.removeEventListener("beforeunload", saveNow);
      document.removeEventListener("visibilitychange", saveNow);
    };
  }, [store.problem, store.code]);

  // Fetch submission history
  useEffect(() => {
    const controller = new AbortController();
    store.setHistoryLoading(true);
    store.setSelectedSubmission(null);
    fetch(`/api/submissions?problemId=${encodeURIComponent(problemId)}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json() as { history?: SubmissionRecord[]; error?: { message?: string } };
        if (res.status === 401) return;
        if (!res.ok) throw new Error(data.error?.message || "无法读取提交记录");
        store.setHistory(Array.isArray(data.history) ? data.history : []);
      })
      .catch((err) => { if (err instanceof Error && err.name !== "AbortError") toast(err.message); })
      .finally(() => { if (!controller.signal.aborted) store.setHistoryLoading(false); });
    return () => controller.abort();
  }, [problemId]);

  // Workspace resize
  useEffect(() => {
    if (!workspaceResizing) return;
    document.body.classList.add("workspace-is-resizing");
    const applySplit = () => {
      workspaceResizeFrame.current = null;
      store.setWorkspaceSplit(workspaceNextSplit.current);
      workspaceRef.current?.style.setProperty("--problem-ratio", `${workspaceNextSplit.current}%`);
    };
    const move = (event: PointerEvent) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds) return;
      workspaceNextSplit.current = Math.min(72, Math.max(28, ((event.clientX - bounds.left) / bounds.width) * 100));
      if (workspaceResizeFrame.current === null) workspaceResizeFrame.current = requestAnimationFrame(applySplit);
    };
    const stop = () => {
      if (workspaceResizeFrame.current !== null) { cancelAnimationFrame(workspaceResizeFrame.current); workspaceResizeFrame.current = null; }
      store.setWorkspaceSplit(workspaceNextSplit.current);
      document.body.classList.remove("workspace-is-resizing");
      setWorkspaceResizing(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      document.body.classList.remove("workspace-is-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      if (workspaceResizeFrame.current !== null) cancelAnimationFrame(workspaceResizeFrame.current);
    };
  }, [workspaceResizing]);

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    workspaceNextSplit.current = store.workspaceSplit;
    workspaceRef.current?.style.setProperty("--problem-ratio", `${store.workspaceSplit}%`);
    setWorkspaceResizing(true);
  }

  // Judge
  async function handleRun(submit = false) {
    try {
      const result = await runTests({
        sourceCode: store.code,
        tests: store.problem.samples,
        problemId: store.problem.id,
        problemTitle: store.problem.title,
        submit,
        onMascotReact: () => undefined,
      });

      if (!result) return;

      store.setResults(result.results);
      store.setCompilerDiagnostic(result.diagnostic);
      reactMascotToJudge(result.results, { submit });

      // 记忆池：判题失败自动沉淀错误记忆；全 AC 雪耻则勾销该题旧账
      const judgeMemory = distillJudgeMemory(store.problem, result.results);
      if (judgeMemory) useMemoryStore.getState().remember(judgeMemory.kind, judgeMemory.text);
      else if (result.results.length && result.results.every((r) => r.status === "AC")) {
        useMemoryStore.getState().forgetProblemMistakes(store.problem.id);
      }

      if (result.submission) {
        store.setHistory([result.submission, ...store.history]);
      }

      const ok = result.results.filter((r) => r.status === "AC").length;
      if (submit) {
        toast(ok === result.results.length ? "提交成功：答案正确" : `提交完成：通过 ${ok}/${result.results.length}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "判题服务暂不可用");
    }
  }

  // AI 请求只带题面语义与前 2 个样例；全量测试点会拖慢生成并浪费 token
  function slimProblem() {
    return { ...store.problem, samples: store.problem.samples.slice(0, 2) };
  }

  // 少女主题下 AI 对话与桌宠共用高木同学人设
  const isTakagi = theme.themeMode === "girl";

  // Esc 逐层收起浮层
  useEscapeClose(showChat, () => setShowChat(false));
  useEscapeClose(showAi, () => setShowAi(false));
  useEscapeClose(Boolean(aiProposedCode), () => { setAiProposedCode(null); setAiOriginalCode(null); });
  useEscapeClose(showMascotAiPrompt, () => setShowMascotAiPrompt(false));
  useEscapeClose(Boolean(store.selectedSubmission), () => store.setSelectedSubmission(null));

  // 聊天新消息自动滚到底部
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = chatMessagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [aiStore.chatMessages, chatBusy, showChat]);

  // 判题动态摘要：让 AI(高木)读到最近一次运行结果与提交记录
  function buildJudgeContext() {
    const passed = store.results.filter((r) => r.status === "AC").length;
    const failIdx = store.results.findIndex((r) => r.status !== "AC");
    const first = failIdx >= 0 ? store.results[failIdx] : null;
    return {
      lastRun: store.results.length ? {
        passed, total: store.results.length,
        firstFailed: first ? { index: failIdx, status: first.status, expected: String(first.expected).slice(0, 80), actual: String(first.actual).slice(0, 80) } : null,
      } : null,
      history: store.history.slice(0, 3).map((h) => ({ at: h.submittedAt, status: h.status, passed: h.passed })),
    };
  }

  async function handleAskAi() {
    if (!aiStore.configured) return toast("请先在设置中完成 AI 配置");
    const originalCode = store.code;
    if (!originalCode.trim()) return toast("当前编辑器没有可供高木修改的代码");
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "revise", code: originalCode, problem: slimProblem() }),
      });
      const data = await res.json() as { code?: string; error?: string };
      if (!res.ok || !data.code) throw new Error(data.error || "生成失败");
      const proposedCode = data.code.replace(/^```(?:cpp|c\+\+|cc|cxx)?\s*/i, "").replace(/```\s*$/, "").trimEnd();
      setAiOriginalCode(originalCode);
      setAiProposedCode(proposedCode);
      setShowAi(false);
      toast("已生成修改候选，请在对照视图中确认");
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI 请求失败");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSendChat() {
    const question = chatInput.trim();
    if (!question || chatBusy) return;
    if (!aiStore.configured) return toast("请先在设置中完成 AI 配置");
    const next = [...aiStore.chatMessages, { role: "user" as const, content: question }];
    aiStore.addChatMessage({ role: "user", content: question });
    void conversationSync.append({ role: "user", content: question }).catch(() => undefined);
    // 记忆池：从提问沉淀习惯，并把已有记忆随请求注入
    const questionMemory = distillQuestionMemory(question);
    if (questionMemory) useMemoryStore.getState().remember(questionMemory.kind, questionMemory.text);
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: slimProblem(), code: store.code, messages: next,
          memories: useMemoryStore.getState().recentMemories(8),
          judge: buildJudgeContext(),
          ...(isTakagi ? { persona: "takagi" } : {}),
        }),
      });
      const data = await res.json() as { answer?: string; reasoning?: string; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error || "AI 没有返回内容");
      aiStore.addChatMessage({ role: "assistant", content: data.answer!, ...(data.reasoning ? { reasoning: data.reasoning } : {}) });
      void conversationSync.append({ role: "assistant", content: data.answer! }).catch(() => undefined);
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI 对话失败");
    } finally {
      setChatBusy(false);
    }
  }

  async function handleGenerateTests() {
    if (!aiStore.configured) return toast("请先在设置中完成 AI 配置");
    setGeneratingTests(true);
    setTestGenStatus("正在分析题型并分批补齐覆盖…");
    try {
      const targetTotal = Math.max(1, testPointCount);
      const res = await fetch("/api/generate-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qualityMode: "feedback",
          problem: store.problem,
          count: targetTotal,
        }),
      });
      const data = await res.json() as {
        tests?: Array<{ input: string; output: string; category?: string; scale?: number; targets?: string; reason?: string }>;
        error?: string;
        complexityReport?: { generatedCount?: number; requestedCount?: number; batches?: number; qualityOk?: boolean; referenceValidated?: boolean; elapsedMs?: number };
      };
      if (!res.ok || !data.tests?.length) throw new Error(data.error || "AI 没有生成可用测试点");
      const existingInputs = new Set(store.problem.samples.map((test) => test.input.trim()));
      const fresh = data.tests.filter((test) => {
        const fingerprint = test.input.trim();
        if (!fingerprint || existingInputs.has(fingerprint)) return false;
        existingInputs.add(fingerprint);
        return true;
      });
      if (!fresh.length) throw new Error("AI 返回的测试点均已存在，请修改生成目标后重试");
      const now = Date.now();
      store.setProblem({ ...store.problem, samples: [...store.problem.samples, ...fresh.map((test, index) => ({ id: now + index, ...test }))] });
      const report = data.complexityReport;
      const seconds = report?.elapsedMs ? `，耗时 ${(report.elapsedMs / 1000).toFixed(1)} 秒` : "";
      toast(`新增 ${fresh.length}/${targetTotal} 个测试点（${report?.batches || 1} 批${seconds}）${report?.qualityOk === false ? "；覆盖仍有缺口，可再次生成补充" : ""}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI 测试点生成失败");
    } finally {
      setGeneratingTests(false);
      setTestGenStatus("");
    }
  }

  async function deleteSubmission(event: React.MouseEvent, record: SubmissionRecord) {
    event.stopPropagation();
    if (!window.confirm(`确定删除 ${new Date(record.submittedAt).toLocaleString("zh-CN")} 的记录吗？`)) return;
    if (record.localOnly) {
      store.setHistory(store.history.filter((item) => item.id !== record.id));
      if (store.selectedSubmission?.id === record.id) store.setSelectedSubmission(null);
      toast("已删除本机记录");
      return;
    }
    try {
      const res = await fetch(`/api/submissions?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
      const data = await res.json() as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !data.ok) throw new Error(data.error?.message || "删除失败");
      store.setHistory(store.history.filter((h) => h.id !== record.id));
      if (store.selectedSubmission?.id === record.id) store.setSelectedSubmission(null);
      toast("已删除");
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除失败");
    }
  }

  const handleEditorChange = useCallback((next: string) => { store.setCode(next); }, []);
  const handleCursorChange = useCallback((line: number, column: number) => { store.setCursor(line, column); }, []);

  const passed = store.results.filter((r) => r.status === "AC").length;
  const score = store.results.length ? Math.round((passed / store.results.length) * 100) : 0;

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <Topbar onToast={toast} onSignedOut={() => { store.clearPrivateWorkspace(); aiStore.clearChat(); }} />

      {/* Workspace Bar */}
      <section className="workspace-bar">
        <div className="breadcrumb">
          <button onClick={() => router.push("/library")}>← 题库</button>
          <i>/</i><b>{store.problem.id}</b><strong>{store.problem.title}</strong>
          <mark>{store.problem.difficulty}</mark>
        </div>
        <div className="workspace-actions">
          <span className={`sync-status ${store.syncStatus}`}><i className="sync-dot" aria-hidden="true" />{store.syncStatus === "local-only" ? "本地保存" : store.syncStatus === "saving" ? "正在保存…" : store.syncStatus === "synced" ? "已同步" : store.syncStatus === "failed" ? "保存失败" : "版本冲突"}</span>
          {store.syncStatus === "failed" && <button onClick={retryFailedSaves}>重试保存</button>}
          <button className="ask-button" onClick={() => setShowChat(true)}>{isTakagi ? "◈ 问高木" : "◈ 问 AI"}</button>
          <button className="ai-button" onClick={() => setShowAi(true)}>{isTakagi ? "✦ 高木解题" : "✦ AI 解题"}</button>
          <button className="run-button" disabled={running} onClick={() => handleRun(false)}>{running ? "运行中…" : "▷ 运行测试"}</button>
          <button className="submit-button" disabled={running} onClick={() => handleRun(true)}>提交</button>
        </div>
      </section>

      {/* Split workspace */}
      <section ref={workspaceRef} className={`split-workspace ${workspaceResizing ? "resizing" : ""}`} style={{ "--problem-ratio": `${store.workspaceSplit}%` } as CSSProperties & Record<"--problem-ratio", string>}>
        {/* Problem Panel */}
        <article className="problem-panel">
          <div className="panel-tabs">
            <button className={store.tab === "problem" ? "active" : ""} onClick={() => store.setTab("problem")}>题目描述</button>
            <button className={store.tab === "tests" ? "active" : ""} onClick={() => store.setTab("tests")}>测试点 <span>{store.problem.samples.length}</span></button>
            <button className={store.tab === "notes" ? "active" : ""} onClick={() => store.setTab("notes")}>笔记</button>
          </div>
          {store.tab === "problem" ? (
            <div className="problem-content">
              {editingProblem ? (
                <ProblemEditor
                  problem={store.problem}
                  onSave={(next) => { store.setProblem(next); setEditingProblem(false); toast("题面已更新，将自动同步"); }}
                  onCancel={() => setEditingProblem(false)}
                />
              ) : (
              <>
              <div className="problem-title-row">
                <h1>{store.problem.title}</h1>
                <button type="button" className="edit-problem-btn" title="手动修正 AI 识别错误" onClick={() => setEditingProblem(true)}>✎ 编辑题面</button>
              </div>
              {store.problem.sourceUrl && (
                <div className={`source-banner ${store.problem.extractionStatus === "needs_review" ? "review" : ""}`}>
                  <span>{store.problem.extractionStatus === "needs_review" ? "需核对" : "已导入"}</span>
                  <p>来源：{getProblemSourceLabel(store.problem)}</p>
                  <a href={store.problem.sourceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>
                </div>
              )}
              <div className="problem-meta">
                <span>⏱ 时间限制 <b>{store.problem.time}</b></span>
                <span>▣ 内存限制 <b>{store.problem.memory}</b></span>
                <span>提交 <b>86.4k</b></span><span>通过率 <b>62.7%</b></span>
              </div>
              <section><h2>题目描述</h2><SafeMarkdown value={store.problem.description} className="problem-md" /></section>
              <section><h2>输入格式</h2><SafeMarkdown value={store.problem.inputFormat} className="problem-md" /></section>
              <section><h2>输出格式</h2><SafeMarkdown value={store.problem.outputFormat} className="problem-md" /></section>
              <section><h2>样例</h2>
                {store.problem.samples.slice(0, 2).map((sample, idx) => (
                  <div className="sample-card" key={sample.id}>
                    <div><span>输入 #{idx + 1}</span><button onClick={() => navigator.clipboard?.writeText(sample.input)}>复制</button></div>
                    <pre>{sample.input}</pre>
                    <div><span>输出 #{idx + 1}</span><button onClick={() => navigator.clipboard?.writeText(sample.output)}>复制</button></div>
                    <pre>{sample.output}</pre>
                  </div>
                ))}
              </section>
              <aside className="hint"><b>C++ 提示</b><span>整数范围不确定时建议使用 <code>long long</code>。</span></aside>
              </>
              )}
            </div>
          ) : store.tab === "tests" ? (
            <div className="tests-content">
              <div className="tests-heading">
                <div><h2>测试点管理</h2><p>{generatingTests && testGenStatus ? testGenStatus : "AI 会分批生成测试点，先拿到小批可用数据再逐步补足边界、反例与性能点。"}</p></div>
                <div className="test-actions">
                  <select value={testPointCount} onChange={(e) => setTestPointCount(Number(e.target.value))}>
                    <option value={12}>12 个</option><option value={18}>18 个</option><option value={24}>24 个</option><option value={36}>36 个</option><option value={50}>50 个</option>
                  </select>
                  <button className="ai-tests-button" disabled={generatingTests} onClick={handleGenerateTests}>{generatingTests ? "正在分批生成…" : "✦ AI 分批生成测试点"}</button>
                  <button onClick={() => store.addTest()}>＋ 手动添加</button>
                </div>
              </div>
              {store.problem.samples.map((test, idx) => (
                <div className="test-editor" key={test.id}>
                  <header>
                    <b>测试点 {idx + 1}
                      <select className={`test-type-tag type-${test.category || "manual"}`} value={test.category || "manual"} onChange={(e) => store.updateTestCategory(test.id, e.target.value)}>
                        {Object.entries(testCategoryLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      {typeof test.scale === "number" && test.scale > 1 && <small>规模 {test.scale}</small>}
                    </b>
                    <span>{store.results.find((r) => r.id === test.id)?.status || "待测试"}</span>
                    <button className="test-delete-btn" title="删除此测试点" onClick={() => store.removeTest(test.id)}>✕</button>
                  </header>
                  <div className="test-quality-meta">
                    <label>测试目标<input value={test.targets || ""} placeholder="例如：卡掉 O(n²) 暴力" onChange={(e) => store.updateTest(test.id, "targets", e.target.value)} /></label>
                    <label>设计理由<input value={test.reason || ""} placeholder="说明该数据覆盖的边界或反例" onChange={(e) => store.updateTest(test.id, "reason", e.target.value)} /></label>
                  </div>
                  <label>输入<textarea value={test.input} onChange={(e) => store.updateTest(test.id, "input", e.target.value)} /></label>
                  <label>期望输出<textarea value={test.output} onChange={(e) => store.updateTest(test.id, "output", e.target.value)} /></label>
                </div>
              ))}
            </div>
          ) : (
            <ProblemNotesPanel
              problemKind={cloudId ? "private" : "public"}
              problemRef={cloudId ?? store.problem.id}
              problemCode={store.problem.id}
              loggedIn={Boolean(session.data?.user)}
            />
          )}
        </article>

        <button className="resize-handle" type="button" aria-label="拖动调整题目区和编辑器宽度" onPointerDown={startResize}><span>{Math.round(store.workspaceSplit)}%</span></button>

        {/* Code Panel */}
        <section ref={codePanelRef} className={`code-panel editor-theme-${theme.editorTheme}`}>
          <div className="editor-toolbar">
            <div className="file-tab"><span>C++</span> main.cpp <i>●</i></div>
            <div>
              <select aria-label="编程语言" value="cpp17" disabled><option value="cpp17">GNU C++17 · GCC</option></select>
              <button title="格式化代码 (Shift+Alt+F)" onClick={() => { store.setCode(formatCppCode(store.code)); toast("代码已格式化"); }}>↻ 格式化</button>
              <button title="重置 C++ 模板" onClick={() => { store.resetCode(); toast("C++ 模板已重置"); }}>↺</button>
              <label className="editor-theme-picker" title="切换编辑器主题">
                <span aria-hidden="true">◐</span>
                <select aria-label="编辑器主题" value={theme.editorTheme} onChange={(e) => theme.setEditorTheme(e.target.value as "light"|"dark"|"girl")}>
                  <option value="dark">暗色</option><option value="light">亮色</option><option value="girl">少女</option>
                </select>
              </label>
            </div>
          </div>
          <div ref={editorAreaRef} data-mascot-drop-zone="editor" className="editor-area">
            <Suspense fallback={<div className="monaco-loading"><span>C++</span><b>正在加载智能编辑器…</b></div>}>
              <CppEditor value={store.code} themeMode={theme.editorTheme} compilerDiagnostic={store.compilerDiagnostic} onChange={handleEditorChange} onCursorChange={handleCursorChange} />
            </Suspense>
          </div>
          <div className="console-panel">
            <div className="coding-companion-scene" aria-hidden="true"><img src="/codenow/portrait-classroom.jpg" alt="" loading="lazy" decoding="async" /><span>我在看哦 · ちゃんと見てるよ</span></div>
            <div className="console-tabs">
              <button className={store.consoleTab === "results" ? "active" : ""} onClick={() => store.setConsoleTab("results")}>测试结果</button>
              <button className={store.consoleTab === "history" ? "active" : ""} onClick={() => store.setConsoleTab("history")}>提交记录</button>
              {store.results.length > 0 && <span className={score === 100 ? "score good" : "score"}>{passed}/{store.results.length} 通过 · {score} 分</span>}
            </div>
            <div className="console-content">
              {store.consoleTab === "history" ? (
                store.historyLoading ? <div className="empty-state"><strong>正在读取提交记录…</strong></div> :
                store.history.length ? store.history.map((item) => (
                  <div className="history-row" key={item.id}>
                    <button className="history-open" onClick={() => store.setSelectedSubmission(item)}>
                      <span>{new Date(item.submittedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      <b className={item.status === "答案正确" ? "ok" : "bad"}>{item.status}</b><span>{item.passed}</span><code>{item.localOnly ? "仅本机" : "GNU C++17"}</code>
                    </button>
                    <button className="history-delete" onClick={(event) => deleteSubmission(event, item)}>删</button>
                  </div>
                )) : <div className="empty-state"><strong>暂无提交记录</strong><span>完成一次提交后，结果会永久保存在这里。</span></div>
              ) : store.results.length ? store.results.map((result, idx) => (
                <div className="result-row" key={result.id}>
                  <span className={`status-dot ${result.status.toLowerCase()}`}>{result.status === "AC" ? "✓" : "!"}</span>
                  <b>测试点 {idx + 1}</b><code>{result.status}</code><span>{result.duration} ms</span>
                  <small>{result.status === "AC" ? "输出正确" : result.status === "CE" ? result.actual : `期望 ${result.expected}，得到 ${result.actual}`}</small>
                </div>
              )) : <div className="empty-state"><span className="terminal-icon">›_</span><strong>C++17 判题器就绪</strong><span>点击“运行测试”进行服务端编译与执行。</span></div>}
            </div>
          </div>
          <footer className="statusbar"><span>✓ IntelliSense</span><span>Ln {store.cursor.line}, Col {store.cursor.column}</span><span>UTF-8</span><span>Spaces: 4</span><span>GNU C++17</span></footer>
        </section>
      </section>

      {/* Submission Modal */}
      {store.selectedSubmission && <div className="modal-backdrop" onMouseDown={() => store.setSelectedSubmission(null)}><div className="modal submission-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => store.setSelectedSubmission(null)}>×</button>
        <span className="modal-kicker">SUBMISSION SNAPSHOT</span><h2>{store.selectedSubmission.problemId} · 提交代码</h2>
        <p>{new Date(store.selectedSubmission.submittedAt).toLocaleString("zh-CN")} · {store.selectedSubmission.status} · 通过 {store.selectedSubmission.passed} · {store.selectedSubmission.totalDurationMs == null ? "耗时未记录" : `总耗时 ${store.selectedSubmission.totalDurationMs} ms`}</p>
        {store.selectedSubmission.results?.length ? <div className="submission-results">
          {store.selectedSubmission.results.map((result, index) => <div className="submission-result" key={`${result.id}-${index}`}>
            <b>测试点 {index + 1}</b><code>{result.status}</code><span>{result.duration} ms</span>
            <small>{result.status === "AC" ? "输出正确" : result.status === "CE" ? result.actual : `期望 ${result.expected}，得到 ${result.actual}`}</small>
          </div>)}
        </div> : <div className="submission-results-empty">旧提交未记录逐测试点结果</div>}
        <pre><code>{store.selectedSubmission.sourceCode}</code></pre>
        <div className="submission-actions"><button onClick={() => store.setSelectedSubmission(null)}>关闭</button><button onClick={() => { store.setCode(store.selectedSubmission!.sourceCode); store.setSelectedSubmission(null); toast("已载入编辑器"); }}>载入到编辑器</button></div>
      </div></div>}

      {/* 桌宠比试确认框：拖入代码区先问"要不要比试"，点"是"才开 AI 解题 */}
      {showMascotAiPrompt && <div className="modal-backdrop" onMouseDown={() => setShowMascotAiPrompt(false)}><div className="modal mascot-ai-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowMascotAiPrompt(false)}>×</button>
        <img className="mascot-ai-portrait" src="/codenow/sunny-selfie.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <span className="modal-kicker">TAKAGI CHALLENGE</span><h2>AI 解题，来比一局？</h2>
        <p>把我拖到代码旁边，是想让我出手吗？勝負しよ。先让 AI 写一份 C++17，你来挑错。要是看不出来，可就算我赢咯。</p>
        <div className="mascot-ai-actions"><button onClick={() => setShowMascotAiPrompt(false)}>还是自己来</button><button onClick={() => { setShowMascotAiPrompt(false); setShowAi(true); }}>使用 AI 解题</button></div>
      </div></div>}

      {/* AI Modal */}
      {showAi && <div className="modal-backdrop" onMouseDown={() => setShowAi(false)}><div className={`modal ai-modal ${isTakagi ? "takagi-solver" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowAi(false)}>×</button>
        {isTakagi ? <>
          <img className="mascot-ai-portrait" src="/codenow/portrait-sailor.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
          <span className="modal-kicker">TAKAGI SOLVER</span><h2>让高木同学出手</h2>
          <p>勝負しよ？我来写一份 C++17，你负责挑错——要是找不出毛病，就算我赢。</p>
        </> : <>
          <span className="modal-kicker purple">AI COPILOT</span><h2>让 AI 编写解答</h2>
          <p>使用账户中已保存的 AI 服务与模型生成解答。</p>
        </>}
        <div className="ai-settings-summary">
          <div><span>当前模型</span><b>{aiStore.configured ? aiStore.model : "尚未配置"}</b><small>{aiStore.configured ? `${aiStore.provider} · ${aiStore.source === "ccswitch" ? "CCSwitch 导入" : "账户设置"}` : "保存后可在所有登录设备上使用"}</small></div>
          <button type="button" onClick={() => router.push("/settings")}>前往设置</button>
        </div>
        <div className="ai-summary"><span>当前题目</span><b>{store.problem.id} · {store.problem.title}</b><small>高木会读取当前代码，保留已有逻辑，只提交一份可审阅的修改候选。</small></div>
        <button className="generate-button" disabled={aiBusy || !aiStore.configured} onClick={handleAskAi}>{aiBusy ? "正在分析当前代码…" : aiStore.configured ? "✦ 分析并修改当前 C++17 代码 · 生成 C++17 解答" : "请先完成 AI 设置"}</button>
      </div></div>}

      {aiProposedCode !== null && aiOriginalCode !== null && <div className="modal-backdrop" onMouseDown={() => { setAiProposedCode(null); setAiOriginalCode(null); }}><div className="modal code-review-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="关闭代码审阅" onClick={() => { setAiProposedCode(null); setAiOriginalCode(null); }}>×</button>
        <span className="modal-kicker">CODE REVIEW</span><h2>审阅高木的修改</h2>
        <p>左侧是你当前的代码，右侧是修改候选。绿色表示新增，红色表示删除，黄色表示同一行被改写。</p>
        <div className="code-review-legend"><span><i className="diff-swatch unchanged" />未改动</span><span><i className="diff-swatch added" />新增</span><span><i className="diff-swatch removed" />删除</span><span><i className="diff-swatch changed" />修改</span></div>
        <div className="code-review-grid"><header><b>当前代码</b><b>修改候选</b></header><div className="code-review-scroll">{buildCodeDiff(aiOriginalCode, aiProposedCode).map((row, index) => <div className={`code-review-row ${row.kind}`} key={`${index}-${row.leftLine}-${row.rightLine}`}><code className="review-line-number">{row.leftLine ?? ""}</code><pre>{row.left ?? ""}</pre><code className="review-line-number">{row.rightLine ?? ""}</code><pre>{row.right ?? ""}</pre></div>)}</div></div>
        <div className="code-review-actions"><button type="button" onClick={() => { setAiProposedCode(null); setAiOriginalCode(null); }}>放弃候选</button><button type="button" className="apply-review" onClick={() => { store.setCode(aiProposedCode); setAiProposedCode(null); setAiOriginalCode(null); toast("已应用高木修改，请运行测试验证"); }}>应用修改到编辑器</button></div>
      </div></div>}

      {/* Chat Drawer */}
      {showChat && <div className="chat-backdrop" onMouseDown={() => setShowChat(false)}><aside className={`chat-drawer ${isTakagi ? "takagi-mode" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <header><div><span>{isTakagi ? "同桌 · 高木同学" : "AI 助教"}</span><b>{store.problem.id} · {store.problem.title}</b></div><button onClick={() => setShowChat(false)}>×</button></header>
        <div className="chat-context">
          {isTakagi
            ? <img className="takagi-face" src="/codenow/study-smile.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
            : <span>{aiStore.provider === "deepseek" ? "DS" : "OA"}</span>}
          <div><b>{aiStore.model}</b><small>{isTakagi ? "陪你一起看这道题 · ちゃんと見てるよ" : "已携带当前题面和代码"}</small></div>
        </div>
        <div className="chat-messages" ref={chatMessagesRef}>
          {!aiStore.chatMessages.length && <div className="chat-welcome">
            {isTakagi ? <>
              <img className="takagi-welcome-portrait" src="/codenow/portrait-classroom.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
              <strong>（故意放慢了收拾书包的动作）</strong>
              <span>你刚才，是不是偷偷看我这边了？……哦，是卡题了啊。要一起看看吗？</span>
              <button onClick={() => setChatInput("这道题应该从什么思路入手？")}>呐，这题怎么想？</button>
              <button onClick={() => setChatInput("帮我检查当前代码可能存在的问题")}>帮我挑挑代码的刺</button>
              <button onClick={() => setChatInput("请解释这道题需要注意的边界情况")}>边界情况会坑我吗？</button>
            </> : <>
              <strong>哪里不明白，直接问我</strong><span>我会结合当前题目和你的代码回答。</span>
              <button onClick={() => setChatInput("这道题应该从什么思路入手？")}>提示解题思路</button>
              <button onClick={() => setChatInput("帮我检查当前代码可能存在的问题")}>检查当前代码</button>
              <button onClick={() => setChatInput("请解释这道题需要注意的边界情况")}>分析边界情况</button>
            </>}
          </div>}
          {aiStore.chatMessages.map((msg, i) => <div className={`chat-message ${msg.role}`} key={i}>
            <span>{msg.role === "user" ? "我" : isTakagi ? <img src="/codenow/study-smile.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" /> : "AI"}</span>
            <div className="chat-message-body">
              {msg.role === "assistant" && msg.reasoning && <details className="chat-reasoning"><summary>{isTakagi ? "高木的小心思" : "思考过程"}</summary><p>{msg.reasoning}</p></details>}
              <p>{msg.content}</p>
            </div>
          </div>)}
          {chatBusy && <div className="chat-message assistant"><span>{isTakagi ? <img src="/codenow/study-smile.jpg" alt="" aria-hidden="true" /> : "AI"}</span><p className="thinking">{isTakagi ? "……让我想想。" : "正在思考…"}</p></div>}
        </div>
        <footer><textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSendChat(); }} placeholder="询问思路、复杂度、代码报错……（Ctrl + Enter 发送）" /><button disabled={chatBusy || !chatInput.trim()} onClick={handleSendChat}>发送</button></footer>
      </aside></div>}

      {(cloudSave.conflict || draftSave.conflict) && <SyncConflictDialog
        conflict={(cloudSave.conflict ?? draftSave.conflict)!}
        onUseCloud={useCloudVersion}
        onOverwrite={overwriteCloudVersion}
      />}

      <Toast message={notice} />
    </main>
  );
}

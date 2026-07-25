"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProblemStore, STARTER_CODE } from "../../stores/problem-store";
import { useLibraryStore } from "../../stores/library-store";
import { useAiStore } from "../../stores/ai-store";
import { useThemeStore } from "../../stores/theme-store";
import { useToast } from "../../hooks/use-toast";
import { useJudge } from "../../hooks/use-judge";
import { Toast } from "../../components/toast";
import { formatCppCode } from "../../lib/format-cpp";
import type { Result, SubmissionRecord } from "../../stores/problem-store";
import { AuthStatus } from "../../components/auth-status";

const CppEditor = lazy(() => import("../../CppEditor").then((m) => ({ default: m.CppEditor })));

const testCategoryLabels: Record<string, string> = {
  boundary: "边界", special: "特殊", ordinary: "普通",
  adversarial: "反例", performance: "性能", sample: "样例", manual: "手动",
};

function toastUser(msg: string) {
  // placeholder - replaced by useToast below
}

export default function ProblemPage() {
  const params = useParams();
  const router = useRouter();
  const problemId = String(params.id || "P1001");

  const store = useProblemStore();
  const libraryStore = useLibraryStore();
  const aiStore = useAiStore();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const { running, runTests } = useJudge();

  // Local UI state
  const [showAi, setShowAi] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [generatingTests, setGeneratingTests] = useState(false);
  const [testGenStatus, setTestGenStatus] = useState("");
  const [testPointCount, setTestPointCount] = useState(18);
  const [workspaceResizing, setWorkspaceResizing] = useState(false);
  const [mascotMessage, setMascotMessage] = useState(0);
  const [showMascotAi, setShowMascotAi] = useState(false);

  const workspaceRef = useRef<HTMLElement>(null);
  const codePanelRef = useRef<HTMLElement>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const workspaceNextSplit = useRef(store.workspaceSplit);
  const workspaceResizeFrame = useRef<number | null>(null);

  // Load problem from store
  useEffect(() => {
    // Problem state is set by library page or persisted in localStorage
  }, [problemId]);

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
        const data = await res.json() as { history?: SubmissionRecord[]; error?: string };
        if (!res.ok) throw new Error(data.error || "无法读取提交记录");
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
        onMascotReact: (results) => {
          const failed = results.find((r) => r.status !== "AC");
          if (!failed) setMascotMessage(2);
          else if (failed.status === "CE" || failed.status === "TLE") setMascotMessage(7);
          else setMascotMessage(6);
        },
      });

      if (!result) return;

      store.setResults(result.results);
      store.setCompilerDiagnostic(result.diagnostic);

      // Always add to local history (both run and submit)
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

  // AI
  async function handleAskAi() {
    const key = aiStore.apiKeys[aiStore.provider];
    if (!key.trim()) return toast("请先填写 API Key");
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, endpoint: aiStore.endpoint, model: aiStore.model, problem: store.problem }),
      });
      const data = await res.json() as { code?: string; error?: string };
      if (!res.ok || !data.code) throw new Error(data.error || "生成失败");
      store.setCode(data.code.replace(/^```(?:cpp|c\+\+|cc|cxx)?\s*/i, "").replace(/```\s*$/, ""));
      setShowAi(false);
      toast("AI 已生成解答，请运行测试验证");
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI 请求失败");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSendChat() {
    const question = chatInput.trim();
    if (!question || chatBusy) return;
    const key = aiStore.apiKeys[aiStore.provider];
    if (!key.trim()) return toast("请先配置 API Key");
    const next = [...aiStore.chatMessages, { role: "user" as const, content: question }];
    aiStore.addChatMessage({ role: "user", content: question });
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, endpoint: aiStore.endpoint, model: aiStore.model, problem: store.problem, code: store.code, messages: next }),
      });
      const data = await res.json() as { answer?: string; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error || "AI 没有返回内容");
      aiStore.addChatMessage({ role: "assistant", content: data.answer! });
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI 对话失败");
    } finally {
      setChatBusy(false);
    }
  }

  async function handleGenerateTests() {
    const key = aiStore.apiKeys[aiStore.provider];
    if (!key.trim()) return toast("请先配置 API Key");
    setGeneratingTests(true);
    setTestGenStatus("正在分析题型并分批补齐覆盖…");
    try {
      const targetTotal = Math.max(1, testPointCount);
      const res = await fetch("/api/generate-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: key,
          endpoint: aiStore.endpoint,
          model: aiStore.model,
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
    try {
      const res = await fetch(`/api/submissions?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "删除失败");
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
      {/* Topbar */}
      <header className="topbar">
        <div className="brand"><img className="brand-mark" src="/codenow/icon.jpg" alt="CodeNow 图标" /><span>CodeNow</span><em>OJ</em></div>
        <nav>
          <button onClick={() => router.push("/library")}>题库</button>
          <button className="nav-active">做题</button>
          <button onClick={() => toast("比赛功能正在开发中，敬请期待")}>比赛</button>
          <button onClick={() => toast("讨论区正在开发中，敬请期待")}>讨论</button>
        </nav>
        <div className="header-actions">
          <label className="theme-picker" title="切换网站主题">
            <span aria-hidden="true">✦</span>
            <select aria-label="网站主题" value={theme.themeMode} onChange={(e) => theme.setThemeMode(e.target.value as "light"|"dark"|"girl")}>
              <option value="light">亮色</option><option value="dark">暗色</option><option value="girl">少女</option>
            </select>
          </label>
          <AuthStatus onSignedOut={() => { store.setHistory([]); aiStore.clearChat(); }} />
        </div>
      </header>

      {/* Workspace Bar */}
      <section className="workspace-bar">
        <div className="breadcrumb">
          <button onClick={() => router.push("/library")}>← 题库</button>
          <i>/</i><b>{store.problem.id}</b><strong>{store.problem.title}</strong>
          <mark>{store.problem.difficulty}</mark>
        </div>
        <div className="workspace-actions">
          <button onClick={() => router.push("/library")}>⇧ 导入题目</button>
          <button className="ask-button" onClick={() => setShowChat(true)}>◈ 问 AI</button>
          <button className="ai-button" onClick={() => setShowAi(true)}>✦ AI 解题</button>
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
          </div>
          {store.tab === "problem" ? (
            <div className="problem-content">
              <h1>{store.problem.title}</h1>
              {store.problem.sourceUrl && (
                <div className={`source-banner ${store.problem.extractionStatus === "needs_review" ? "review" : ""}`}>
                  <span>{store.problem.extractionStatus === "needs_review" ? "需核对" : "已导入"}</span>
                  <p>来源于 AcWing 算法基础课题解目录。</p>
                  <a href={store.problem.sourceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>
                </div>
              )}
              <div className="problem-meta">
                <span>⏱ 时间限制 <b>{store.problem.time}</b></span>
                <span>▣ 内存限制 <b>{store.problem.memory}</b></span>
                <span>提交 <b>86.4k</b></span><span>通过率 <b>62.7%</b></span>
              </div>
              <section><h2>题目描述</h2><p>{store.problem.description}</p></section>
              <section><h2>输入格式</h2><p>{store.problem.inputFormat}</p></section>
              <section><h2>输出格式</h2><p>{store.problem.outputFormat}</p></section>
              <section><h2>样例</h2>
                {store.problem.samples.slice(0, 2).map((sample, idx) => (
                  <div className="sample-card" key={sample.id}>
                    <div><span>输入 #{idx + 1}</span><button onClick={() => navigator.clipboard?.writeText(sample.input)}>复制</button></div>
                    <pre>{sample.input}</pre>
                    <div><span>输出 #{idx + 1}</span></div><pre>{sample.output}</pre>
                  </div>
                ))}
              </section>
              <aside className="hint"><b>C++ 提示</b><span>整数范围不确定时建议使用 <code>long long</code>。</span></aside>
            </div>
          ) : (
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
          <div ref={editorAreaRef} className="editor-area">
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
                      <b className={item.status === "答案正确" ? "ok" : "bad"}>{item.status}</b><span>{item.passed}</span><code>GNU C++17</code>
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
              )) : <div className="empty-state"><span className="terminal-icon">›_</span><strong>C++17 判题器就绪</strong><span>点击"运行测试"进行服务端编译与执行。</span></div>}
            </div>
          </div>
          <footer className="statusbar"><span>✓ IntelliSense</span><span>Ln {store.cursor.line}, Col {store.cursor.column}</span><span>UTF-8</span><span>Spaces: 4</span><span>GNU C++17</span></footer>
        </section>
      </section>

      {/* Submission Modal */}
      {store.selectedSubmission && <div className="modal-backdrop" onMouseDown={() => store.setSelectedSubmission(null)}><div className="modal submission-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => store.setSelectedSubmission(null)}>×</button>
        <span className="modal-kicker">SUBMISSION SNAPSHOT</span><h2>{store.selectedSubmission.problemId} · 提交代码</h2>
        <p>{new Date(store.selectedSubmission.submittedAt).toLocaleString("zh-CN")} · {store.selectedSubmission.status} · 通过 {store.selectedSubmission.passed}</p>
        <pre><code>{store.selectedSubmission.sourceCode}</code></pre>
        <div className="submission-actions"><button onClick={() => store.setSelectedSubmission(null)}>关闭</button><button onClick={() => { store.setCode(store.selectedSubmission!.sourceCode); store.setSelectedSubmission(null); toast("已载入编辑器"); }}>载入到编辑器</button></div>
      </div></div>}

      {/* AI Modal */}
      {showAi && <div className="modal-backdrop" onMouseDown={() => setShowAi(false)}><div className="modal ai-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowAi(false)}>×</button>
        <span className="modal-kicker purple">AI COPILOT</span><h2>让 AI 编写解答</h2>
        <p>选择 API 服务商。每个服务商的密钥会分别保存在当前浏览器中，下次可直接使用。</p>
        <div className="provider-switch">
          <button className={aiStore.provider === "deepseek" ? "active deepseek" : ""} onClick={() => aiStore.setProvider("deepseek")}><b>DeepSeek</b><small>DS 官方 API</small></button>
          <button className={aiStore.provider === "openai" ? "active" : ""} onClick={() => aiStore.setProvider("openai")}><b>OpenAI</b><small>官方兼容接口</small></button>
          <button className={aiStore.provider === "custom" ? "active" : ""} onClick={() => aiStore.setProvider("custom")}><b>自定义</b><small>兼容服务</small></button>
        </div>
        <label>API Endpoint<input value={aiStore.endpoint} onChange={(e) => aiStore.setEndpoint(e.target.value)} placeholder="https://api.deepseek.com" /></label>
        <label>API Key<div className="api-key-input"><input type="password" value={aiStore.apiKeys[aiStore.provider]} onChange={(e) => aiStore.setApiKey(aiStore.provider, e.target.value)} placeholder="输入后会保存在本机浏览器" autoComplete="off" />{aiStore.apiKeys[aiStore.provider] && <button onClick={() => aiStore.clearApiKey(aiStore.provider)}>清除</button>}</div><small className="storage-note">仅保存在当前浏览器，不会写入网站服务器</small></label>
        <label>模型{aiStore.provider === "deepseek" ? <select value={aiStore.model} onChange={(e) => aiStore.setModel(e.target.value)}><option value="deepseek-v4-flash">DeepSeek V4 Flash · 快速</option><option value="deepseek-v4-pro">DeepSeek V4 Pro · 高质量</option></select> : <input value={aiStore.model} onChange={(e) => aiStore.setModel(e.target.value)} placeholder="模型 ID" />}</label>
        <div className="ai-summary"><span>当前题目</span><b>{store.problem.id} · {store.problem.title}</b><small>{store.problem.samples.length} 个测试点将随题面一并发送</small></div>
        <button className="generate-button" disabled={aiBusy} onClick={handleAskAi}>{aiBusy ? "正在思考并编写 C++…" : `✦ 使用 ${aiStore.provider === "deepseek" ? "DeepSeek" : aiStore.provider === "openai" ? "OpenAI" : "自定义 API"} 生成 C++17 解答`}</button>
      </div></div>}

      {/* Chat Drawer */}
      {showChat && <div className="chat-backdrop" onMouseDown={() => setShowChat(false)}><aside className="chat-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <header><div><span>AI 助教</span><b>{store.problem.id} · {store.problem.title}</b></div><button onClick={() => setShowChat(false)}>×</button></header>
        <div className="chat-context"><span>{aiStore.provider === "deepseek" ? "DS" : "OA"}</span><div><b>{aiStore.model}</b><small>已携带当前题面和代码</small></div></div>
        <div className="chat-messages">
          {!aiStore.chatMessages.length && <div className="chat-welcome">
            <strong>哪里不明白，直接问我</strong><span>我会结合当前题目和你的代码回答。</span>
            <button onClick={() => setChatInput("这道题应该从什么思路入手？")}>提示解题思路</button>
            <button onClick={() => setChatInput("帮我检查当前代码可能存在的问题")}>检查当前代码</button>
            <button onClick={() => setChatInput("请解释这道题需要注意的边界情况")}>分析边界情况</button>
          </div>}
          {aiStore.chatMessages.map((msg, i) => <div className={`chat-message ${msg.role}`} key={i}><span>{msg.role === "user" ? "我" : "AI"}</span><p>{msg.content}</p></div>)}
          {chatBusy && <div className="chat-message assistant"><span>AI</span><p className="thinking">正在思考…</p></div>}
        </div>
        <footer><textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSendChat(); }} placeholder="询问思路、复杂度、代码报错……（Ctrl + Enter 发送）" /><button disabled={chatBusy || !chatInput.trim()} onClick={handleSendChat}>发送</button></footer>
      </aside></div>}

      <Toast message={notice} />
    </main>
  );
}

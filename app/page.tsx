"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TestCase = { id: number; input: string; output: string };
type Problem = {
  id: string;
  title: string;
  difficulty: "入门" | "普及" | "提高";
  time: string;
  memory: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  samples: TestCase[];
};

const initialProblem: Problem = {
  id: "P1001",
  title: "A + B Problem",
  difficulty: "入门",
  time: "1000 ms",
  memory: "128 MB",
  description: "给定两个整数 a 和 b，请计算并输出它们的和。",
  inputFormat: "一行，包含两个以空格分隔的整数 a 和 b。",
  outputFormat: "输出一个整数，表示 a + b 的结果。",
  samples: [
    { id: 1, input: "1 2", output: "3" },
    { id: 2, input: "100 -27", output: "73" },
    { id: 3, input: "999999 1", output: "1000000" },
  ],
};

const starterCode = `function solve(input) {
  const [a, b] = input.trim().split(/\\s+/).map(Number);
  return String(a + b);
}

// 请保留 solve 函数，平台会自动调用它`;

type Result = { id: number; status: "AC" | "WA" | "RE"; actual: string; expected: string; duration: number };

export default function Home() {
  const [problem, setProblem] = useState<Problem>(initialProblem);
  const [code, setCode] = useState(starterCode);
  const [tab, setTab] = useState<"problem" | "tests">("problem");
  const [consoleTab, setConsoleTab] = useState<"results" | "history">("results");
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [aiBusy, setAiBusy] = useState(false);
  const [history, setHistory] = useState<{ time: string; status: string; passed: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("codeforge-workspace");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.problem) setProblem(data.problem);
        if (data.code) setCode(data.code);
      } catch { /* ignore malformed local state */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("codeforge-workspace", JSON.stringify({ problem, code }));
  }, [problem, code]);

  const passed = results.filter((r) => r.status === "AC").length;
  const score = results.length ? Math.round((passed / results.length) * 100) : 0;
  const lineCount = useMemo(() => code.split("\n").length, [code]);

  function toast(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function runTests(submit = false) {
    setRunning(true);
    setConsoleTab("results");
    await new Promise((resolve) => setTimeout(resolve, 420));
    const next: Result[] = problem.samples.map((test) => {
      const start = performance.now();
      try {
        const factory = new Function(`${code}\n; return typeof solve === 'function' ? solve : null;`);
        const solve = factory();
        if (!solve) throw new Error("未找到 solve 函数");
        const actual = String(solve(test.input)).trim();
        return { id: test.id, status: actual === test.output.trim() ? "AC" : "WA", actual, expected: test.output, duration: Math.max(1, Math.round(performance.now() - start)) };
      } catch (error) {
        return { id: test.id, status: "RE", actual: error instanceof Error ? error.message : "运行错误", expected: test.output, duration: 1 };
      }
    });
    setResults(next);
    setRunning(false);
    if (submit) {
      const ok = next.filter((item) => item.status === "AC").length;
      setHistory((items) => [{ time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), status: ok === next.length ? "答案正确" : "未通过", passed: `${ok}/${next.length}` }, ...items]);
      toast(ok === next.length ? "提交成功：答案正确" : `提交完成：通过 ${ok}/${next.length} 个测试点`);
    }
  }

  function importProblem(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data.title || !Array.isArray(data.samples)) throw new Error();
        setProblem({ ...initialProblem, ...data, id: data.id || `U${Date.now().toString().slice(-5)}` });
        setResults([]);
        setShowImport(false);
        toast(`已导入题目「${data.title}」`);
      } catch {
        toast("导入失败：请检查 JSON 文件格式");
      }
    };
    reader.readAsText(file);
  }

  function addTest() {
    setProblem((item) => ({ ...item, samples: [...item.samples, { id: Date.now(), input: "", output: "" }] }));
  }

  function updateTest(id: number, field: "input" | "output", value: string) {
    setProblem((item) => ({ ...item, samples: item.samples.map((test) => test.id === id ? { ...test, [field]: value } : test) }));
  }

  async function askAi() {
    if (!apiKey.trim()) return toast("请先填写 API Key");
    setAiBusy(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, endpoint, model, problem }),
      });
      const data = await response.json() as { code?: string; error?: string };
      if (!response.ok || !data.code) throw new Error(data.error || "生成失败");
      setCode(data.code.replace(/^```(?:javascript|js)?\s*/i, "").replace(/```\s*$/, ""));
      setShowAi(false);
      toast("AI 已生成解答，请运行测试验证");
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 请求失败");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">C<span>F</span></span><span>CodeForge</span><em>OJ</em></div>
        <nav><button className="nav-active">题库</button><button>训练</button><button>比赛</button><button>讨论</button></nav>
        <div className="header-actions"><button className="icon-button" aria-label="通知">◒</button><span className="avatar">LR</span><div className="user-copy"><b>LinR</b><small>Lv.12 · 1842</small></div></div>
      </header>

      <section className="workspace-bar">
        <div className="breadcrumb"><span>题库</span><i>/</i><b>{problem.id}</b><strong>{problem.title}</strong><mark>{problem.difficulty}</mark></div>
        <div className="workspace-actions"><button onClick={() => setShowImport(true)}>⇧ 导入题目</button><button className="ai-button" onClick={() => setShowAi(true)}>✦ AI 解题</button><button className="run-button" disabled={running} onClick={() => runTests(false)}>{running ? "运行中…" : "▷ 运行测试"}</button><button className="submit-button" disabled={running} onClick={() => runTests(true)}>提交</button></div>
      </section>

      <section className="split-workspace">
        <article className="problem-panel">
          <div className="panel-tabs"><button className={tab === "problem" ? "active" : ""} onClick={() => setTab("problem")}>题目描述</button><button className={tab === "tests" ? "active" : ""} onClick={() => setTab("tests")}>测试点 <span>{problem.samples.length}</span></button></div>
          {tab === "problem" ? (
            <div className="problem-content">
              <h1>{problem.title}</h1>
              <div className="problem-meta"><span>⏱ 时间限制 <b>{problem.time}</b></span><span>▣ 内存限制 <b>{problem.memory}</b></span><span>提交 <b>86.4k</b></span><span>通过率 <b>62.7%</b></span></div>
              <section><h2>题目描述</h2><p>{problem.description}</p></section>
              <section><h2>输入格式</h2><p>{problem.inputFormat}</p></section>
              <section><h2>输出格式</h2><p>{problem.outputFormat}</p></section>
              <section><h2>样例</h2>{problem.samples.slice(0, 2).map((sample, index) => <div className="sample-card" key={sample.id}><div><span>输入 #{index + 1}</span><button onClick={() => navigator.clipboard?.writeText(sample.input)}>复制</button></div><pre>{sample.input}</pre><div><span>输出 #{index + 1}</span></div><pre>{sample.output}</pre></div>)}</section>
              <aside className="hint"><b>提示</b><span>JavaScript 中建议使用 <code>Number</code> 处理本题输入。</span></aside>
            </div>
          ) : (
            <div className="tests-content">
              <div className="tests-heading"><div><h2>自定义测试点</h2><p>修改后会自动保存在此浏览器。</p></div><button onClick={addTest}>＋ 添加测试点</button></div>
              {problem.samples.map((test, index) => <div className="test-editor" key={test.id}><header><b>测试点 {index + 1}</b><span>{results.find((r) => r.id === test.id)?.status || "待测试"}</span></header><label>输入<textarea value={test.input} onChange={(e) => updateTest(test.id, "input", e.target.value)} /></label><label>期望输出<textarea value={test.output} onChange={(e) => updateTest(test.id, "output", e.target.value)} /></label></div>)}
            </div>
          )}
        </article>

        <div className="resize-handle" />

        <section className="code-panel">
          <div className="editor-toolbar"><div className="file-tab"><span>JS</span> main.js <i>●</i></div><div><select aria-label="编程语言"><option>JavaScript 22</option></select><button onClick={() => { setCode(starterCode); toast("代码已重置"); }}>↻</button><button>⚙</button></div></div>
          <div className="editor-area"><div className="line-numbers">{Array.from({ length: Math.max(lineCount, 14) }, (_, i) => <span key={i}>{i + 1}</span>)}</div><textarea aria-label="代码编辑器" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="console-panel">
            <div className="console-tabs"><button className={consoleTab === "results" ? "active" : ""} onClick={() => setConsoleTab("results")}>测试结果</button><button className={consoleTab === "history" ? "active" : ""} onClick={() => setConsoleTab("history")}>提交记录</button>{results.length > 0 && <span className={score === 100 ? "score good" : "score"}>{passed}/{results.length} 通过 · {score} 分</span>}</div>
            <div className="console-content">
              {consoleTab === "history" ? (history.length ? history.map((item, index) => <div className="history-row" key={index}><span>{item.time}</span><b className={item.status === "答案正确" ? "ok" : "bad"}>{item.status}</b><span>{item.passed}</span><code>JavaScript</code></div>) : <div className="empty-state"><strong>暂无提交记录</strong><span>完成一次提交后，结果会显示在这里。</span></div>) : results.length ? results.map((result, index) => <div className="result-row" key={result.id}><span className={`status-dot ${result.status.toLowerCase()}`}>{result.status === "AC" ? "✓" : "!"}</span><b>测试点 {index + 1}</b><code>{result.status}</code><span>{result.duration} ms</span><small>{result.status === "AC" ? "输出正确" : `期望 ${result.expected}，得到 ${result.actual}`}</small></div>) : <div className="empty-state"><span className="terminal-icon">›_</span><strong>准备就绪</strong><span>点击“运行测试”查看代码执行结果。</span></div>}
            </div>
          </div>
          <footer className="statusbar"><span>分支：main</span><span>Ln {lineCount}, Col 1</span><span>UTF-8</span><span>Spaces: 2</span><span>JavaScript</span></footer>
        </section>
      </section>

      {showImport && <div className="modal-backdrop" onMouseDown={() => setShowImport(false)}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowImport(false)}>×</button><span className="modal-kicker">题目管理</span><h2>导入题目与测试点</h2><p>上传 JSON 文件，字段支持 title、description、inputFormat、outputFormat 和 samples。</p><button className="dropzone" onClick={() => fileRef.current?.click()}><strong>⇧</strong><b>选择 JSON 文件</b><span>每个测试点格式：{`{ "input": "1 2", "output": "3" }`}</span></button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => importProblem(e.target.files?.[0])} /><button className="text-action" onClick={() => { const blob = new Blob([JSON.stringify(initialProblem, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "problem-template.json"; a.click(); }}>下载导入模板</button></div></div>}

      {showAi && <div className="modal-backdrop" onMouseDown={() => setShowAi(false)}><div className="modal ai-modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowAi(false)}>×</button><span className="modal-kicker purple">AI COPILOT</span><h2>让 AI 编写解答</h2><p>支持 OpenAI 兼容接口。密钥仅随本次请求转发，不会保存。</p><label>API Endpoint<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" /></label><label>API Key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-••••••••••••" /></label><label>模型<input value={model} onChange={(e) => setModel(e.target.value)} /></label><div className="ai-summary"><span>当前题目</span><b>{problem.id} · {problem.title}</b><small>{problem.samples.length} 个测试点将随题面一并发送</small></div><button className="generate-button" disabled={aiBusy} onClick={askAi}>{aiBusy ? "正在思考并编写…" : "✦ 生成 JavaScript 解答"}</button></div></div>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

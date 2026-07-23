"use client";

import { useEffect, useRef, useState } from "react";
import { CppEditor } from "./CppEditor";
import acwingCourseData from "../public/acwing-course.json";

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
  sourceUrl?: string;
  extractionStatus?: "complete" | "needs_review";
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

const starterCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
    return 0;
}`;

type Result = { id: number; status: "AC" | "WA" | "RE" | "CE" | "TLE"; actual: string; expected: string; duration: number };
type AiProvider = "deepseek" | "openai" | "custom";
type ArchivedProblem = { problem: Problem; folder: string; archivedAt: string };
type ChatMessage = { role: "user" | "assistant"; content: string };
type BundledProblem = Problem & { folder: string; sourceUrl: string; extractionStatus: "complete" | "needs_review" };
type SubmissionRecord = { id: string; problemId: string; problemTitle: string; status: string; passed: string; sourceCode: string; submittedAt: string };
type CatalogEntry = { kind: "built-in"; id: string } | { kind: "acwing"; id: string; item: BundledProblem } | { kind: "archive"; id: string; item: ArchivedProblem };

const naturalCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

const acwingCourse = acwingCourseData as BundledProblem[];
const acwingFolders = Array.from(new Set(acwingCourse.flatMap((problem) => {
  const parts = problem.folder.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
})));

function folderContains(folder: string, parent: string) {
  return folder === parent || folder.startsWith(`${parent}/`);
}

function folderName(folder: string) {
  return folder.split("/").pop() || folder;
}

function compareFolderPaths(left: string, right: string) {
  const a = left.split("/");
  const b = right.split("/");
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const compared = naturalCollator.compare(a[index], b[index]);
    if (compared) return compared;
  }
  return a.length - b.length;
}

function normalizeImportedProblem(input: unknown): Problem {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("根节点必须是 JSON 对象");
  const data = input as Record<string, unknown>;
  if (data.version !== undefined && data.version !== 1) throw new Error("仅支持 version: 1");
  for (const field of ["title", "description", "inputFormat", "outputFormat"] as const) {
    if (typeof data[field] !== "string" || !data[field].trim()) throw new Error(`字段 ${field} 必须是非空字符串`);
  }
  if (!Array.isArray(data.samples) || data.samples.length === 0) throw new Error("samples 必须包含至少一个测试点");
  const samples = data.samples.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`samples[${index}] 必须是对象`);
    const sample = item as Record<string, unknown>;
    if (typeof sample.input !== "string" || typeof sample.output !== "string") throw new Error(`samples[${index}] 的 input/output 必须是字符串`);
    return { id: typeof sample.id === "number" ? sample.id : Date.now() + index, input: sample.input, output: sample.output };
  });
  const difficulty = ["入门", "普及", "提高"].includes(String(data.difficulty)) ? data.difficulty as Problem["difficulty"] : "入门";
  return {
    id: typeof data.id === "string" && data.id.trim() ? data.id : `U${Date.now().toString().slice(-5)}`,
    title: String(data.title),
    difficulty,
    time: typeof data.time === "string" ? data.time : "1000 ms",
    memory: typeof data.memory === "string" ? data.memory : "128 MB",
    description: String(data.description),
    inputFormat: String(data.inputFormat),
    outputFormat: String(data.outputFormat),
    samples,
  };
}

export default function Home() {
  const [pageView, setPageView] = useState<"library" | "workspace">("library");
  const [librarySearch, setLibrarySearch] = useState("");
  const [problem, setProblem] = useState<Problem>(initialProblem);
  const [code, setCode] = useState(starterCode);
  const [tab, setTab] = useState<"problem" | "tests">("problem");
  const [consoleTab, setConsoleTab] = useState<"results" | "history">("results");
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("dark");
  const [themeReady, setThemeReady] = useState(false);
  const [editorTheme, setEditorTheme] = useState<"light" | "dark">("dark");
  const [editorThemeReady, setEditorThemeReady] = useState(false);
  const [compilerDiagnostic, setCompilerDiagnostic] = useState("");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [notice, setNotice] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"paste" | "json">("paste");
  const [rawProblemText, setRawProblemText] = useState("");
  const [customProblemId, setCustomProblemId] = useState("");
  const [renamingProblemId, setRenamingProblemId] = useState<string | null>(null);
  const [nextProblemId, setNextProblemId] = useState("");
  const [generatingProblem, setGeneratingProblem] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<AiProvider, string>>({ deepseek: "", openai: "", custom: "" });
  const [apiKeysReady, setApiKeysReady] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("deepseek");
  const [endpoint, setEndpoint] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [aiBusy, setAiBusy] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [testPointCount, setTestPointCount] = useState(18);
  const [generatingTests, setGeneratingTests] = useState(false);
  const [archives, setArchives] = useState<ArchivedProblem[]>([]);
  const [folders, setFolders] = useState(["默认题库"]);
  const [selectedFolder, setSelectedFolder] = useState("默认题库");
  const [newFolderName, setNewFolderName] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [libraryReady, setLibraryReady] = useState(false);
  const [history, setHistory] = useState<SubmissionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("codeforge-workspace");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.problem) setProblem(data.problem);
        if (typeof data.code === "string" && /#include|int\s+main\s*\(/.test(data.code)) setCode(data.code);
      } catch { /* ignore malformed local state */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("codeforge-workspace", JSON.stringify({ problem, code }));
  }, [problem, code]);

  useEffect(() => {
    const saved = localStorage.getItem("codeforge-theme");
    if (saved === "light" || saved === "dark") setThemeMode(saved);
    else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) setThemeMode("light");
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (themeReady) localStorage.setItem("codeforge-theme", themeMode);
  }, [themeMode, themeReady]);

  useEffect(() => {
    const saved = localStorage.getItem("codeforge-editor-theme");
    if (saved === "light" || saved === "dark") setEditorTheme(saved);
    setEditorThemeReady(true);
  }, []);

  useEffect(() => {
    if (editorThemeReady) localStorage.setItem("codeforge-editor-theme", editorTheme);
  }, [editorTheme, editorThemeReady]);

  useEffect(() => {
    const saved = localStorage.getItem("codeforge-api-keys");
    if (saved) {
      try {
        const keys = JSON.parse(saved) as Partial<Record<AiProvider, unknown>>;
        setApiKeys({
          deepseek: typeof keys.deepseek === "string" ? keys.deepseek : "",
          openai: typeof keys.openai === "string" ? keys.openai : "",
          custom: typeof keys.custom === "string" ? keys.custom : "",
        });
      } catch { /* ignore malformed local state */ }
    }
    setApiKeysReady(true);
  }, []);

  useEffect(() => {
    if (apiKeysReady) localStorage.setItem("codeforge-api-keys", JSON.stringify(apiKeys));
  }, [apiKeys, apiKeysReady]);

  useEffect(() => {
    const saved = localStorage.getItem("codeforge-problem-library");
    if (saved) {
      try {
        const data = JSON.parse(saved) as { archives?: ArchivedProblem[]; folders?: string[]; selectedFolder?: string; collapsedFolders?: string[]; includeSubfolders?: boolean };
        if (Array.isArray(data.archives)) setArchives(data.archives);
        if (Array.isArray(data.folders) && data.folders.length) setFolders(data.folders);
        if (typeof data.selectedFolder === "string") setSelectedFolder(data.selectedFolder);
        if (Array.isArray(data.collapsedFolders)) setCollapsedFolders(data.collapsedFolders.filter((item): item is string => typeof item === "string"));
        if (typeof data.includeSubfolders === "boolean") setIncludeSubfolders(data.includeSubfolders);
      } catch { /* ignore malformed local state */ }
    }
    setLibraryReady(true);
  }, []);

  useEffect(() => {
    if (libraryReady) localStorage.setItem("codeforge-problem-library", JSON.stringify({ archives, folders, selectedFolder, collapsedFolders, includeSubfolders }));
  }, [archives, folders, selectedFolder, collapsedFolders, includeSubfolders, libraryReady]);

  useEffect(() => {
    if (libraryReady) setArchives((items) => items.map((item) => item.problem.id === problem.id ? { ...item, problem } : item));
  }, [problem, libraryReady]);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    setSelectedSubmission(null);
    fetch(`/api/submissions?problemId=${encodeURIComponent(problem.id)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { history?: SubmissionRecord[]; error?: string };
        if (!response.ok) throw new Error(data.error || "无法读取提交记录");
        setHistory(Array.isArray(data.history) ? data.history : []);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") toast(error.message); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [problem.id]);

  const apiKey = apiKeys[provider];
  const orderedFolders = Array.from(new Set([...folders, ...acwingFolders])).sort(compareFolderPaths);
  const visibleFolders = orderedFolders.filter((folder) => {
    const parts = folder.split("/");
    return parts.slice(0, -1).every((_, index) => !collapsedFolders.includes(parts.slice(0, index + 1).join("/")));
  });
  const matchesSelectedFolder = (folder: string) => selectedFolder === "全部题目" || (includeSubfolders ? folderContains(folder, selectedFolder) : folder === selectedFolder);
  const selectedArchives = archives.filter((item) => matchesSelectedFolder(item.folder));
  const selectedAcwing = acwingCourse.filter((item) => matchesSelectedFolder(item.folder));
  const searchQuery = librarySearch.trim().toLowerCase();
  const displayedArchives = selectedArchives.filter((item) => !searchQuery || `${item.problem.id} ${item.problem.title}`.toLowerCase().includes(searchQuery));
  const displayedAcwing = selectedAcwing.filter((item) => !searchQuery || `${item.id} ${item.title}`.toLowerCase().includes(searchQuery));
  const showBuiltInProblem = matchesSelectedFolder("默认题库") && (!searchQuery || `${initialProblem.id} ${initialProblem.title}`.toLowerCase().includes(searchQuery));
  const catalogItems: CatalogEntry[] = [];
  if (showBuiltInProblem) catalogItems.push({ kind: "built-in", id: initialProblem.id });
  displayedAcwing.forEach((item) => catalogItems.push({ kind: "acwing", id: item.id, item }));
  displayedArchives.forEach((item) => catalogItems.push({ kind: "archive", id: item.problem.id, item }));
  catalogItems.sort((a, b) => naturalCollator.compare(a.id, b.id));

  const passed = results.filter((r) => r.status === "AC").length;
  const score = results.length ? Math.round((passed / results.length) * 100) : 0;
  function toast(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function runTests(submit = false) {
    const submittedCode = code;
    const submittedProblem = { id: problem.id, title: problem.title };
    setRunning(true);
    setCompilerDiagnostic("");
    setConsoleTab("results");
    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCode: code, tests: problem.samples }),
      });
      const data = await response.json() as { results?: Result[]; error?: string };
      if (!response.ok || !data.results) throw new Error(data.error || "C++ 判题服务暂不可用");
      const next = data.results;
      setResults(next);
      setCompilerDiagnostic(next.find((item) => item.status === "CE")?.actual || "");
      if (submit) {
        const ok = next.filter((item) => item.status === "AC").length;
        const record: SubmissionRecord = {
          id: crypto.randomUUID(),
          problemId: submittedProblem.id,
          problemTitle: submittedProblem.title,
          status: ok === next.length ? "答案正确" : "未通过",
          passed: `${ok}/${next.length}`,
          sourceCode: submittedCode,
          submittedAt: new Date().toISOString(),
        };
        try {
          const saveResponse = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
          const saved = await saveResponse.json() as { record?: SubmissionRecord; error?: string };
          if (!saveResponse.ok || !saved.record) throw new Error(saved.error || "保存提交记录失败");
          if (problem.id === submittedProblem.id) setHistory((items) => [saved.record!, ...items]);
          toast(ok === next.length ? "提交成功：答案正确，记录已保存" : `提交完成：通过 ${ok}/${next.length} 个测试点，记录已保存`);
        } catch (saveError) {
          toast(`${ok === next.length ? "答案正确" : `通过 ${ok}/${next.length}`}，但${saveError instanceof Error ? saveError.message : "保存提交记录失败"}`);
        }
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "C++ 判题服务暂不可用");
    } finally {
      setRunning(false);
    }
  }

  async function deleteSubmission(event: React.MouseEvent, record: SubmissionRecord) {
    event.stopPropagation();
    if (!window.confirm(`确定删除 ${new Date(record.submittedAt).toLocaleString("zh-CN")} 的提交记录吗？`)) return;
    try {
      const response = await fetch(`/api/submissions?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "删除提交记录失败");
      setHistory((items) => items.filter((item) => item.id !== record.id));
      if (selectedSubmission?.id === record.id) setSelectedSubmission(null);
      toast("提交记录已删除");
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除提交记录失败");
    }
  }

  function restoreSubmission(record: SubmissionRecord) {
    setCode(record.sourceCode);
    setCompilerDiagnostic("");
    setSelectedSubmission(null);
    toast("已将该次提交的代码载入编辑器");
  }

  function importProblem(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = archiveAndOpen(normalizeImportedProblem(JSON.parse(String(reader.result))));
        setShowImport(false);
        toast(`已编号并归档：${data.id} · ${data.title}`);
      } catch (error) {
        toast(`导入失败：${error instanceof Error ? error.message : "请检查 JSON 文件格式"}`);
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

  function chooseProvider(next: AiProvider) {
    setProvider(next);
    if (next === "deepseek") {
      setEndpoint("https://api.deepseek.com");
      setModel("deepseek-v4-flash");
    } else if (next === "openai") {
      setEndpoint("https://api.openai.com/v1");
      setModel("gpt-4.1-mini");
    } else {
      setEndpoint("");
      setModel("");
    }
  }

  function updateApiKey(value: string) {
    setApiKeys((keys) => ({ ...keys, [provider]: value }));
  }

  function clearApiKey() {
    setApiKeys((keys) => ({ ...keys, [provider]: "" }));
    toast(`${provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "自定义 API"} Key 已从本机清除`);
  }

  function archiveAndOpen(incoming: Problem) {
    const nextNumber = archives.reduce((max, item) => {
      const match = /^CF(\d+)$/.exec(item.problem.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const requestedId = customProblemId.trim();
    if (requestedId && !/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(requestedId)) throw new Error("自定义题号需以字母开头，仅含字母、数字、下划线或短横线，最长 20 位");
    const nextId = requestedId || `CF${String(nextNumber).padStart(4, "0")}`;
    if (nextId.toUpperCase() === initialProblem.id.toUpperCase() || acwingCourse.some((item) => item.id.toUpperCase() === nextId.toUpperCase()) || archives.some((item) => item.problem.id.toUpperCase() === nextId.toUpperCase())) throw new Error(`题号 ${nextId} 已存在，请更换题号`);
    const numbered = { ...incoming, id: nextId };
    const archiveFolder = selectedFolder === "全部题目" ? "默认题库" : selectedFolder;
    setArchives((items) => [{ problem: numbered, folder: archiveFolder, archivedAt: new Date().toISOString() }, ...items]);
    setProblem(numbered);
    setCode(starterCode);
    setCompilerDiagnostic("");
    setResults([]);
    setTab("problem");
    setPageView("workspace");
    setCustomProblemId("");
    return numbered;
  }

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (/[\\/]/.test(name)) return toast("文件夹名称不能包含斜杠");
    const parent = selectedFolder === "全部题目" ? "" : selectedFolder;
    if (parent.split("/").filter(Boolean).length >= 5) return toast("最多支持 5 级文件夹");
    const path = parent ? `${parent}/${name}` : name;
    if (orderedFolders.includes(path)) return toast("该文件夹已存在");
    setFolders((items) => [...items, path]);
    setSelectedFolder(path);
    setNewFolderName("");
    toast(`已创建${parent ? "子" : ""}文件夹「${path}」`);
  }

  function dissolveFolder(folder: string) {
    if (folder === "默认题库" || !folders.includes(folder)) return;
    const parent = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "默认题库";
    const nestedFolders = folders.filter((item) => folderContains(item, folder));
    const affectedProblems = archives.filter((item) => folderContains(item.folder, folder)).length;
    const detail = [
      nestedFolders.length > 1 ? `及 ${nestedFolders.length - 1} 个子文件夹` : "",
      affectedProblems ? `其中 ${affectedProblems} 道题目会移至「${parent}」` : "",
    ].filter(Boolean).join("，");
    if (!window.confirm(`确定解散文件夹「${folder}」${detail ? `（${detail}）` : ""}吗？`)) return;
    setFolders((items) => items.filter((item) => !folderContains(item, folder)));
    setArchives((items) => items.map((item) => folderContains(item.folder, folder) ? { ...item, folder: parent } : item));
    setCollapsedFolders((items) => items.filter((item) => !folderContains(item, folder)));
    if (folderContains(selectedFolder, folder)) setSelectedFolder(parent);
    toast(`已解散文件夹「${folder}」${affectedProblems ? `，题目已移至「${parent}」` : ""}`);
  }

  function toggleFolder(folder: string) {
    setCollapsedFolders((items) => items.includes(folder) ? items.filter((item) => item !== folder) : [...items, folder]);
  }

  function moveArchivedProblem(id: string, folder: string) {
    setArchives((items) => items.map((item) => item.problem.id === id ? { ...item, folder } : item));
  }

  function beginRenameProblem(id: string) {
    setRenamingProblemId(id);
    setNextProblemId(id);
  }

  async function confirmRenameProblem() {
    if (!renamingProblemId) return;
    const nextId = nextProblemId.trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(nextId)) return toast("题号需以字母开头，仅含字母、数字、下划线或短横线，最长 20 位");
    const duplicate = nextId.toUpperCase() === initialProblem.id.toUpperCase() || acwingCourse.some((item) => item.id.toUpperCase() === nextId.toUpperCase()) || archives.some((item) => item.problem.id !== renamingProblemId && item.problem.id.toUpperCase() === nextId.toUpperCase());
    if (duplicate) return toast(`题号 ${nextId} 已存在，请更换题号`);
    const previousId = renamingProblemId;
    const renamedProblem = archives.find((item) => item.problem.id === previousId)?.problem;
    try {
      const response = await fetch("/api/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldProblemId: previousId, newProblemId: nextId, problemTitle: renamedProblem?.title || problem.title }) });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || "无法同步提交记录"); }
    } catch (error) {
      return toast(error instanceof Error ? error.message : "无法同步提交记录");
    }
    setArchives((items) => items.map((item) => item.problem.id === renamingProblemId ? { ...item, problem: { ...item.problem, id: nextId } } : item));
    setProblem((item) => item.id === renamingProblemId ? { ...item, id: nextId } : item);
    setHistory((items) => items.map((item) => item.problemId === previousId ? { ...item, problemId: nextId } : item));
    setRenamingProblemId(null);
    setNextProblemId("");
    toast(`题号已修改为 ${nextId}`);
  }

  function openArchivedProblem(item: ArchivedProblem) {
    setProblem(item.problem);
    setResults([]);
    setCompilerDiagnostic("");
    setPageView("workspace");
    toast(`已打开 ${item.problem.id} · ${item.problem.title}`);
  }

  function openBundledProblem(item: BundledProblem) {
    setProblem(item);
    setCode(starterCode);
    setResults([]);
    setCompilerDiagnostic("");
    setPageView("workspace");
    toast(`已打开 ${item.id} · ${item.title}`);
  }

  async function sendChat() {
    const question = chatInput.trim();
    if (!question || chatBusy) return;
    if (!apiKey.trim()) return toast("请先在 AI 解题中配置 API Key");
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: question }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, endpoint, model, problem, code, messages: nextMessages }),
      });
      const data = await response.json() as { answer?: string; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "AI 没有返回内容");
      setChatMessages((items) => [...items, { role: "assistant", content: data.answer! }]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 对话失败");
    } finally {
      setChatBusy(false);
    }
  }

  async function generateMoreTests() {
    if (!apiKey.trim()) return toast("请先在 AI 解题中配置 API Key");
    setGeneratingTests(true);
    try {
      const response = await fetch("/api/generate-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, endpoint, model, problem, count: testPointCount }),
      });
      const data = await response.json() as { tests?: TestCase[]; error?: string; warning?: string | null };
      if (!response.ok || !data.tests) throw new Error(data.error || "AI 测试点生成失败");
      const existing = new Set(problem.samples.map((item) => `${item.input}\u0000${item.output}`));
      const fresh = data.tests.filter((item) => !existing.has(`${item.input}\u0000${item.output}`));
      setProblem((item) => ({ ...item, samples: [...item.samples, ...fresh] }));
      setResults([]);
      toast(data.warning || `AI 已补充 ${fresh.length} 个不重复测试点`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 测试点生成失败");
    } finally {
      setGeneratingTests(false);
    }
  }

  async function generateProblemFromText() {
    if (rawProblemText.trim().length < 20) return toast("请粘贴完整题面，至少 20 个字符");
    if (!apiKey.trim()) return toast("请填写所选 AI 服务的 API Key");
    if (!endpoint.trim() || !model.trim()) return toast("请补全 API Endpoint 和模型");
    setGeneratingProblem(true);
    try {
      const response = await fetch("/api/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, endpoint, model, rawProblem: rawProblemText }),
      });
      const data = await response.json() as { problem?: unknown; error?: string };
      if (!response.ok || !data.problem) throw new Error(data.error || "题目解析失败");
      const generated = archiveAndOpen(normalizeImportedProblem(data.problem));
      setShowImport(false);
      toast(`已生成并归档：${generated.id} · ${generated.samples.length} 个测试点`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 生成题目失败");
    } finally {
      setGeneratingProblem(false);
    }
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
      setCode(data.code.replace(/^```(?:cpp|c\+\+|cc|cxx)?\s*/i, "").replace(/```\s*$/, ""));
      setCompilerDiagnostic("");
      setShowAi(false);
      toast("AI 已生成解答，请运行测试验证");
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 请求失败");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <main className={`app-shell theme-${themeMode}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">C<span>F</span></span><span>CodeForge</span><em>OJ</em></div>
        <nav><button className={pageView === "library" ? "nav-active" : ""} onClick={() => setPageView("library")}>题库</button><button className={pageView === "workspace" ? "nav-active" : ""} onClick={() => setPageView("workspace")}>做题</button><button onClick={() => toast("比赛功能正在开发中，敬请期待")}>比赛</button><button onClick={() => toast("讨论区正在开发中，敬请期待")}>讨论</button></nav>
        <div className="header-actions"><button className="icon-button theme-toggle" aria-label={`切换到${themeMode === "dark" ? "亮色" : "暗色"}模式`} title={`切换到${themeMode === "dark" ? "亮色" : "暗色"}模式`} onClick={() => setThemeMode((mode) => mode === "dark" ? "light" : "dark")}>{themeMode === "dark" ? "☀" : "◐"}</button><span className="avatar">LR</span><div className="user-copy"><b>LinR</b><small>Lv.12 · 1842</small></div></div>
      </header>

      {pageView === "library" ? <section className="library-page">
        <div className="library-hero">
          <div><span>CODEFORGE PROBLEM SET</span><h1>我的题库</h1><p>选择一道题进入专注的 C++ 编程与判题工作区。</p></div>
          <button onClick={() => { if (selectedFolder === "全部题目") setSelectedFolder("默认题库"); setShowImport(true); }}>＋ 添加题目</button>
        </div>
        <div className="library-page-body">
          <aside className="library-page-sidebar">
            <h3>题目文件夹</h3>
            <button className={selectedFolder === "全部题目" ? "active" : ""} onClick={() => setSelectedFolder("全部题目")}><span>▦ 全部题目</span><b>{archives.length + acwingCourse.length + 1}</b></button>
            {visibleFolders.map((folder) => {
              const hasChildren = orderedFolders.some((item) => item.startsWith(`${folder}/`));
              const collapsed = collapsedFolders.includes(folder);
              return <div className="folder-entry" key={folder} style={{ marginLeft: `${(folder.split("/").length - 1) * 13}px` }}>
              {hasChildren ? <button className="folder-expand" aria-label={`${collapsed ? "展开" : "收起"}文件夹 ${folder}`} title={collapsed ? "展开子文件夹" : "收起子文件夹"} onClick={() => toggleFolder(folder)}>{collapsed ? "›" : "⌄"}</button> : <span className="folder-spacer" />}
              <button title={folder} className={`folder-select ${selectedFolder === folder ? "active" : ""}`} onClick={() => setSelectedFolder(folder)}><span>▱ {folderName(folder)}</span><b>{archives.filter((item) => folderContains(item.folder, folder)).length + acwingCourse.filter((item) => folderContains(item.folder, folder)).length + (folder === "默认题库" ? 1 : 0)}</b></button>
              {folder !== "默认题库" && folders.includes(folder) && <button className="folder-delete" aria-label={`解散文件夹 ${folder}`} title="解散文件夹，题目移至上一级" onClick={() => dissolveFolder(folder)}>散</button>}
            </div>;
            })}
            <div className="folder-create-caption">{selectedFolder === "全部题目" ? "新建根文件夹" : `在「${folderName(selectedFolder)}」中新建`}</div><div className="new-folder page-folder"><input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createFolder(); }} placeholder="文件夹名称" /><button title="新建文件夹" onClick={createFolder}>＋</button></div>
          </aside>
          <main className="library-catalog">
            <div className="catalog-toolbar"><div><h2 className="folder-breadcrumb">{selectedFolder === "全部题目" ? "全部题目" : selectedFolder.split("/").map((part, index) => <span key={`${part}-${index}`}>{index > 0 && <i>›</i>}{part}</span>)}</h2><span>{selectedArchives.length + selectedAcwing.length + (showBuiltInProblem ? 1 : 0)} 道题目 · 按题号排序{selectedFolder !== "全部题目" ? includeSubfolders ? " · 含子文件夹" : " · 仅当前文件夹" : ""}</span></div><div className="catalog-tools">{selectedFolder !== "全部题目" && <button className={includeSubfolders ? "active" : ""} onClick={() => setIncludeSubfolders((value) => !value)}>{includeSubfolders ? "含子文件夹" : "仅当前文件夹"}</button>}<label><span>⌕</span><input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="搜索编号或题目名称" /></label></div></div>
            <div className="catalog-header"><span>题目</span><span>难度</span><span>测试点</span><span>分类</span><span></span></div>
            <div className="catalog-list">
              {catalogItems.map((entry) => {
                if (entry.kind === "built-in") return <article className="catalog-row built-in" key={`${entry.kind}-${entry.id}`}><button onClick={() => { setProblem(initialProblem); setCode(starterCode); setResults([]); setCompilerDiagnostic(""); setPageView("workspace"); }}><code>{initialProblem.id}</code><div><b>{initialProblem.title}</b><small>经典入门题 · 内置题目</small></div></button><span className="difficulty beginner">{initialProblem.difficulty}</span><span>{initialProblem.samples.length} 个</span><span>默认题库</span><i onClick={() => { setProblem(initialProblem); setCode(starterCode); setResults([]); setCompilerDiagnostic(""); setPageView("workspace"); }}>进入做题 →</i></article>;
                if (entry.kind === "acwing") { const item = entry.item; return <article className="catalog-row external-problem" key={`${entry.kind}-${entry.id}`}><button onClick={() => openBundledProblem(item)}><code>{item.id}</code><div><b>{item.title}</b><small>{item.extractionStatus === "complete" ? "题面已自动提取" : "题面需结合来源核对"} · 博客园来源</small></div></button><span className="difficulty normal">{item.difficulty}</span><span>{item.samples.length} 个</span><span title={item.folder}>{folderName(item.folder)}</span><div className="row-actions"><a href={item.sourceUrl} target="_blank" rel="noreferrer">来源</a><i onClick={() => openBundledProblem(item)}>进入 →</i></div></article>; }
                const item = entry.item; return <article className="catalog-row" key={`${entry.kind}-${entry.id}`}><div className="catalog-problem-link"><button className="catalog-id-edit" title="点击修改题号" aria-label={`修改题号 ${item.problem.id}`} onClick={() => beginRenameProblem(item.problem.id)}><code>{item.problem.id}</code></button><button className="catalog-title-open" onClick={() => openArchivedProblem(item)}><span><b>{item.problem.title}</b><small>{new Date(item.archivedAt).toLocaleDateString("zh-CN")} 归档</small></span></button></div><span className={`difficulty ${item.problem.difficulty === "提高" ? "advanced" : item.problem.difficulty === "普及" ? "normal" : "beginner"}`}>{item.problem.difficulty}</span><span>{item.problem.samples.length} 个</span><select aria-label={`移动 ${item.problem.title} 到文件夹`} value={item.folder} onChange={(e) => moveArchivedProblem(item.problem.id, e.target.value)}>{orderedFolders.map((folder) => <option key={folder} value={folder}>{"　".repeat(folder.split("/").length - 1)}{folderName(folder)}</option>)}</select><div className="row-actions"><i onClick={() => openArchivedProblem(item)}>进入 →</i></div></article>;
              })}
              {catalogItems.length === 0 && <div className="catalog-empty"><b>{searchQuery ? "没有匹配的题目" : includeSubfolders ? "此文件夹及子文件夹暂无题目" : "当前文件夹暂无题目"}</b><span>{searchQuery ? "请尝试其他编号或标题关键词。" : "点击“添加题目”导入 JSON，或粘贴题面让 AI 自动生成。"}</span></div>}
            </div>
          </main>
        </div>
      </section> : <>
      <section className="workspace-bar">
        <div className="breadcrumb"><button onClick={() => setPageView("library")}>← 题库</button><i>/</i><b>{problem.id}</b><strong>{problem.title}</strong><mark>{problem.difficulty}</mark></div>
        <div className="workspace-actions"><button onClick={() => { if (selectedFolder === "全部题目") setSelectedFolder("默认题库"); setShowImport(true); }}>⇧ 导入题目</button><button className="ask-button" onClick={() => setShowChat(true)}>◈ 问 AI</button><button className="ai-button" onClick={() => setShowAi(true)}>✦ AI 解题</button><button className="run-button" disabled={running} onClick={() => runTests(false)}>{running ? "运行中…" : "▷ 运行测试"}</button><button className="submit-button" disabled={running} onClick={() => runTests(true)}>提交</button></div>
      </section>

      <section className="split-workspace">
        <article className="problem-panel">
          <div className="panel-tabs"><button className={tab === "problem" ? "active" : ""} onClick={() => setTab("problem")}>题目描述</button><button className={tab === "tests" ? "active" : ""} onClick={() => setTab("tests")}>测试点 <span>{problem.samples.length}</span></button></div>
          {tab === "problem" ? (
            <div className="problem-content">
              <h1>{problem.title}</h1>
              {problem.sourceUrl && <div className={`source-banner ${problem.extractionStatus === "needs_review" ? "review" : ""}`}><span>{problem.extractionStatus === "needs_review" ? "需核对" : "已导入"}</span><p>来源于 AcWing 算法基础课题解目录。{problem.extractionStatus === "needs_review" ? "该页面结构特殊，请先核对原文，再用 AI 补全测试点。" : "题面已自动提取，可继续用 AI 生成隐藏测试点。"}</p><a href={problem.sourceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a></div>}
              <div className="problem-meta"><span>⏱ 时间限制 <b>{problem.time}</b></span><span>▣ 内存限制 <b>{problem.memory}</b></span><span>提交 <b>86.4k</b></span><span>通过率 <b>62.7%</b></span></div>
              <section><h2>题目描述</h2><p>{problem.description}</p></section>
              <section><h2>输入格式</h2><p>{problem.inputFormat}</p></section>
              <section><h2>输出格式</h2><p>{problem.outputFormat}</p></section>
              <section><h2>样例</h2>{problem.samples.slice(0, 2).map((sample, index) => <div className="sample-card" key={sample.id}><div><span>输入 #{index + 1}</span><button onClick={() => navigator.clipboard?.writeText(sample.input)}>复制</button></div><pre>{sample.input}</pre><div><span>输出 #{index + 1}</span></div><pre>{sample.output}</pre></div>)}</section>
              <aside className="hint"><b>C++ 提示</b><span>整数范围不确定时建议使用 <code>long long</code>，并开启快速 I/O。</span></aside>
            </div>
          ) : (
            <div className="tests-content">
              <div className="tests-heading"><div><h2>测试点管理</h2><p>修改后会自动保存；AI 会覆盖边界、极值、特殊结构和易错反例。</p></div><div className="test-actions"><select aria-label="AI 生成测试点数量" value={testPointCount} onChange={(e) => setTestPointCount(Number(e.target.value))}><option value={12}>12 个</option><option value={18}>18 个</option><option value={24}>24 个</option></select><button className="ai-tests-button" disabled={generatingTests} onClick={generateMoreTests}>{generatingTests ? "生成中…" : "✦ AI 生成测试点"}</button><button onClick={addTest}>＋ 手动添加</button></div></div>
              {problem.samples.map((test, index) => <div className="test-editor" key={test.id}><header><b>测试点 {index + 1}</b><span>{results.find((r) => r.id === test.id)?.status || "待测试"}</span></header><label>输入<textarea value={test.input} onChange={(e) => updateTest(test.id, "input", e.target.value)} /></label><label>期望输出<textarea value={test.output} onChange={(e) => updateTest(test.id, "output", e.target.value)} /></label></div>)}
            </div>
          )}
        </article>

        <div className="resize-handle" />

        <section className={`code-panel editor-theme-${editorTheme}`}>
          <div className="editor-toolbar"><div className="file-tab"><span>C++</span> main.cpp <i>●</i></div><div><select aria-label="编程语言" value="cpp17" disabled><option value="cpp17">GNU C++17 · GCC</option></select><button title="重置 C++ 模板" onClick={() => { setCode(starterCode); setCompilerDiagnostic(""); toast("C++ 模板已重置"); }}>↻</button><button className="editor-theme-toggle" title={`切换为${editorTheme === "dark" ? "亮色" : "暗色"}编辑器`} aria-label={`切换为${editorTheme === "dark" ? "亮色" : "暗色"}编辑器`} onClick={() => setEditorTheme((mode) => mode === "dark" ? "light" : "dark")}>{editorTheme === "dark" ? "☀ 亮色" : "◐ 暗色"}</button></div></div>
          <div className="editor-area"><CppEditor value={code} themeMode={editorTheme} compilerDiagnostic={compilerDiagnostic} onChange={(next) => { setCode(next); setCompilerDiagnostic(""); }} onCursorChange={(line, column) => setCursor({ line, column })} /></div>
          <div className="console-panel">
            <div className="console-tabs"><button className={consoleTab === "results" ? "active" : ""} onClick={() => setConsoleTab("results")}>测试结果</button><button className={consoleTab === "history" ? "active" : ""} onClick={() => setConsoleTab("history")}>提交记录</button>{results.length > 0 && <span className={score === 100 ? "score good" : "score"}>{passed}/{results.length} 通过 · {score} 分</span>}</div>
            <div className="console-content">
              {consoleTab === "history" ? (historyLoading ? <div className="empty-state"><strong>正在读取提交记录…</strong></div> : history.length ? history.map((item) => <div className="history-row" key={item.id}><button className="history-open" onClick={() => setSelectedSubmission(item)} title="查看本次提交代码"><span>{new Date(item.submittedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><b className={item.status === "答案正确" ? "ok" : "bad"}>{item.status}</b><span>{item.passed}</span><code>GNU C++17</code></button><button className="history-delete" aria-label={`删除 ${item.submittedAt} 的提交记录`} title="删除记录" onClick={(event) => deleteSubmission(event, item)}>删</button></div>) : <div className="empty-state"><strong>暂无提交记录</strong><span>完成一次提交后，结果会永久保存在这里。</span></div>) : results.length ? results.map((result, index) => <div className="result-row" key={result.id}><span className={`status-dot ${result.status.toLowerCase()}`}>{result.status === "AC" ? "✓" : "!"}</span><b>测试点 {index + 1}</b><code>{result.status}</code><span>{result.duration} ms</span><small>{result.status === "AC" ? "输出正确" : result.status === "CE" ? result.actual : `期望 ${result.expected}，得到 ${result.actual}`}</small></div>) : <div className="empty-state"><span className="terminal-icon">›_</span><strong>C++17 判题器就绪</strong><span>点击“运行测试”进行服务端编译与执行。</span></div>}
            </div>
          </div>
          <footer className="statusbar"><span>✓ IntelliSense</span><span>Ln {cursor.line}, Col {cursor.column}</span><span>UTF-8</span><span>Spaces: 4</span><span>GNU C++17</span></footer>
        </section>
      </section>
      </>}

      {showImport && <div className="modal-backdrop" onMouseDown={() => setShowImport(false)}><div className="modal import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowImport(false)}>×</button>
        <span className="modal-kicker">快速开始</span><h2>添加一道练习题</h2>
        <div className="import-meta-fields"><label className="archive-target">自定义题号<input value={customProblemId} onChange={(e) => setCustomProblemId(e.target.value)} placeholder="可选，如 MY001" maxLength={20} /></label><label className="archive-target">归档到<select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)}>{orderedFolders.map((folder) => <option key={folder} value={folder}>{"　".repeat(folder.split("/").length - 1)}{folderName(folder)}</option>)}</select></label></div>
        <div className="import-tabs"><button className={importMode === "paste" ? "active" : ""} onClick={() => setImportMode("paste")}>✦ 粘贴题面</button><button className={importMode === "json" ? "active" : ""} onClick={() => setImportMode("json")}>⇧ 导入 JSON</button></div>
        {importMode === "paste" ? <>
          <p>直接复制题目全文，AI 会整理题面并生成可立即运行的测试点。</p>
          <label className="raw-problem-label">题目原文<textarea value={rawProblemText} onChange={(e) => setRawProblemText(e.target.value)} placeholder={'粘贴题目标题、描述、输入输出格式、数据范围和样例……\n\n例如：给定两个整数 a 和 b，输出它们的和。'} /></label>
          <div className="provider-switch compact-providers">
            <button className={provider === "deepseek" ? "active deepseek" : ""} onClick={() => chooseProvider("deepseek")}><b>DeepSeek</b><small>推荐</small></button>
            <button className={provider === "openai" ? "active" : ""} onClick={() => chooseProvider("openai")}><b>OpenAI</b><small>官方</small></button>
            <button className={provider === "custom" ? "active" : ""} onClick={() => chooseProvider("custom")}><b>自定义</b><small>兼容 API</small></button>
          </div>
          {provider === "custom" && <div className="inline-fields"><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="API Endpoint" /><input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型 ID" /></div>}
          {provider === "deepseek" && <label className="compact-model">模型<select value={model} onChange={(e) => setModel(e.target.value)}><option value="deepseek-v4-flash">DeepSeek V4 Flash · 快速</option><option value="deepseek-v4-pro">DeepSeek V4 Pro · 高质量</option></select></label>}
          <label className="raw-problem-label">API Key<div className="api-key-input"><input type="password" value={apiKey} onChange={(e) => updateApiKey(e.target.value)} placeholder="输入后会保存在本机浏览器" autoComplete="off" />{apiKey && <button type="button" onClick={clearApiKey}>清除</button>}</div><small className="storage-note">仅保存在当前浏览器，不会写入网站服务器</small></label>
          <div className="generation-warning"><b>AI 测试点提示</b><span>系统会覆盖样例、边界值和特殊情况，但生成结果仍可能有误；可在生成后手动检查和修改。</span></div>
          <button className="generate-button" disabled={generatingProblem} onClick={generateProblemFromText}>{generatingProblem ? "正在理解题目并计算测试点…" : "✦ 生成题目与测试点"}</button>
        </> : <>
          <p>文件必须是 UTF-8 JSON。必填字段会在导入前严格校验，错误位置会直接提示。</p>
          <div className="spec-table">
            <div><b>必填</b><code>title</code><code>description</code><code>inputFormat</code><code>outputFormat</code><code>samples[]</code></div>
            <div><b>可选</b><code>id</code><code>difficulty</code><code>time</code><code>memory</code><code>version</code></div>
            <p><code>samples[]</code> 每项必须含字符串类型的 <code>input</code> 和 <code>output</code>，换行使用 <code>\n</code>。</p>
          </div>
          <button className="dropzone compact" onClick={() => fileRef.current?.click()}><strong>⇧</strong><b>选择 JSON 文件</b><span>最大建议 5 MB · 至少包含 1 个测试点</span></button>
          <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => importProblem(e.target.files?.[0])} />
          <div className="download-row"><a href="/problem-example.json" download>下载完整示例</a><a href="/problem.schema.json" download>下载 JSON Schema</a></div>
        </>}
      </div></div>}

      {renamingProblemId && <div className="modal-backdrop" onMouseDown={() => setRenamingProblemId(null)}><div className="modal rename-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setRenamingProblemId(null)}>×</button><span className="modal-kicker">PROBLEM ID</span><h2>修改题目编号</h2>
        <p>修改后会同步更新题库存档和当前做题工作区，不影响题面、代码或测试点。</p>
        <label>新题号<input autoFocus value={nextProblemId} onChange={(e) => setNextProblemId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmRenameProblem(); }} placeholder="如 ALG001" maxLength={20} /></label>
        <small>以字母开头，可使用字母、数字、下划线和短横线。</small>
        <button className="generate-button" onClick={confirmRenameProblem}>保存新题号</button>
      </div></div>}

      {selectedSubmission && <div className="modal-backdrop" onMouseDown={() => setSelectedSubmission(null)}><div className="modal submission-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setSelectedSubmission(null)}>×</button><span className="modal-kicker">SUBMISSION SNAPSHOT</span><h2>{selectedSubmission.problemId} · 提交代码</h2>
        <p>{new Date(selectedSubmission.submittedAt).toLocaleString("zh-CN")} · {selectedSubmission.status} · 通过 {selectedSubmission.passed}</p>
        <pre><code>{selectedSubmission.sourceCode}</code></pre>
        <div className="submission-actions"><button onClick={() => setSelectedSubmission(null)}>关闭</button><button onClick={() => restoreSubmission(selectedSubmission)}>载入到编辑器</button></div>
      </div></div>}

      {showChat && <div className="chat-backdrop" onMouseDown={() => setShowChat(false)}><aside className="chat-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <header><div><span>AI 助教</span><b>{problem.id} · {problem.title}</b></div><button aria-label="关闭对话" onClick={() => setShowChat(false)}>×</button></header>
        <div className="chat-context"><span>{provider === "deepseek" ? "DS" : provider === "openai" ? "OA" : "API"}</span><div><b>{model}</b><small>已携带当前题面、测试点和 C++ 代码</small></div><button onClick={() => { setShowChat(false); setShowAi(true); }}>配置</button></div>
        <div className="chat-messages">
          {!chatMessages.length && <div className="chat-welcome"><strong>哪里不明白，直接问我</strong><span>我会结合当前题目和你的代码回答。</span><button onClick={() => setChatInput("这道题应该从什么思路入手？")}>提示解题思路</button><button onClick={() => setChatInput("帮我检查当前代码可能存在的问题")}>检查当前代码</button><button onClick={() => setChatInput("请解释这道题需要注意的边界情况")}>分析边界情况</button></div>}
          {chatMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><span>{message.role === "user" ? "我" : "AI"}</span><p>{message.content}</p></div>)}
          {chatBusy && <div className="chat-message assistant"><span>AI</span><p className="thinking">正在思考…</p></div>}
        </div>
        <footer><textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendChat(); }} placeholder="询问思路、复杂度、代码报错……（Ctrl + Enter 发送）" /><button disabled={chatBusy || !chatInput.trim()} onClick={sendChat}>发送</button></footer>
      </aside></div>}

      {showAi && <div className="modal-backdrop" onMouseDown={() => setShowAi(false)}><div className="modal ai-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowAi(false)}>×</button><span className="modal-kicker purple">AI COPILOT</span><h2>让 AI 编写解答</h2>
        <p>选择 API 服务商。每个服务商的密钥会分别保存在当前浏览器中，下次可直接使用。</p>
        <div className="provider-switch">
          <button className={provider === "deepseek" ? "active deepseek" : ""} onClick={() => chooseProvider("deepseek")}><b>DeepSeek</b><small>DS 官方 API</small></button>
          <button className={provider === "openai" ? "active" : ""} onClick={() => chooseProvider("openai")}><b>OpenAI</b><small>官方兼容接口</small></button>
          <button className={provider === "custom" ? "active" : ""} onClick={() => chooseProvider("custom")}><b>自定义</b><small>兼容服务</small></button>
        </div>
        {provider === "deepseek" && <div className="provider-note"><span>DS</span><p>已使用 DeepSeek 官方 Chat Completions 接口。<a href="https://api-docs.deepseek.com/" target="_blank" rel="noreferrer">查看官方文档 ↗</a></p></div>}
        <label>API Endpoint<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.deepseek.com" /></label>
        <label>API Key<div className="api-key-input"><input type="password" value={apiKey} onChange={(e) => updateApiKey(e.target.value)} placeholder="输入后会保存在本机浏览器" autoComplete="off" />{apiKey && <button type="button" onClick={clearApiKey}>清除</button>}</div><small className="storage-note">仅保存在当前浏览器，不会写入网站服务器</small></label>
        <label>模型{provider === "deepseek" ? <select value={model} onChange={(e) => setModel(e.target.value)}><option value="deepseek-v4-flash">DeepSeek V4 Flash · 快速</option><option value="deepseek-v4-pro">DeepSeek V4 Pro · 高质量</option></select> : <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型 ID" />}</label>
        <div className="ai-summary"><span>当前题目</span><b>{problem.id} · {problem.title}</b><small>{problem.samples.length} 个测试点将随题面一并发送</small></div>
        <button className="generate-button" disabled={aiBusy} onClick={askAi}>{aiBusy ? "正在思考并编写 C++…" : `✦ 使用 ${provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "自定义 API"} 生成 C++17 解答`}</button>
      </div></div>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

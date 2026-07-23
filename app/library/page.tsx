"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLibraryStore, loadAcwingCatalog, folderName, folderParent, folderContains, orderFolderTree, getAcwingFolders, getAcwingProblems } from "../stores/library-store";
import { useProblemStore, INITIAL_PROBLEM, STARTER_CODE } from "../stores/problem-store";
import { useAiStore } from "../stores/ai-store";
import { useThemeStore } from "../stores/theme-store";
import { useToast } from "../hooks/use-toast";
import { Toast } from "../components/toast";

export default function LibraryPage() {
  const router = useRouter();
  const store = useLibraryStore();
  const { setProblem, setCode, setResults, setCompilerDiagnostic } = useProblemStore();
  const aiStore = useAiStore();
  const theme = useThemeStore();
  const { notice, toast } = useToast();

  const [newFolderName, setNewFolderName] = useState("");
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Import modal state
  const [importMode, setImportMode] = useState<"paste" | "json">("paste");
  const [rawProblemText, setRawProblemText] = useState("");
  const [customProblemId, setCustomProblemId] = useState("");
  const [generatingProblem, setGeneratingProblem] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const acwingFolders = getAcwingFolders();
  const acwingProblems = getAcwingProblems();

  const folders = [...store.folders, ...acwingFolders];
  const orderedFolders = orderFolderTree(folders, store.folderOrder);

  const visibleFolders = orderedFolders.filter((folder) => {
    const parts = folder.split("/");
    return parts.slice(0, -1).every((_, index) => !store.collapsedFolders.includes(parts.slice(0, index + 1).join("/")));
  });

  const matchesSelectedFolder = (folder: string) =>
    store.selectedFolder === "全部题目" ||
    (store.includeSubfolders ? folderContains(folder, store.selectedFolder) : folder === store.selectedFolder);

  const selectedArchives = store.archives.filter((item) => matchesSelectedFolder(item.folder));
  const selectedAcwing = acwingProblems.filter((item) => matchesSelectedFolder(item.folder));
  const showBuiltIn = matchesSelectedFolder("默认题库") && (!store.librarySearch || `${INITIAL_PROBLEM.id} ${INITIAL_PROBLEM.title}`.toLowerCase().includes(store.librarySearch.toLowerCase()));

  const directChildFolders = store.selectedFolder === "全部题目"
    ? []
    : orderedFolders.filter((folder) => folderParent(folder) === store.selectedFolder);

  useEffect(() => { store.setLibraryReady(); loadAcwingCatalog(); }, []);

  function openArchived(item: typeof store.archives[number]) {
    setProblem(item.problem);
    setResults([]);
    setCompilerDiagnostic("");
    router.push(`/problem/${item.problem.id}`);
    toast(`已打开 ${item.problem.id} · ${item.problem.title}`);
  }

  function openBundled(item: ReturnType<typeof getAcwingProblems>[number]) {
    setProblem(item);
    setCode(STARTER_CODE);
    setResults([]);
    setCompilerDiagnostic("");
    router.push(`/problem/${item.id}`);
    toast(`已打开 ${item.id} · ${item.title}`);
  }

  function openBuiltIn() {
    setProblem(INITIAL_PROBLEM);
    setCode(STARTER_CODE);
    setResults([]);
    setCompilerDiagnostic("");
    router.push("/problem/P1001");
  }

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (/[\\/]/.test(name)) return toast("文件夹名称不能包含斜杠");
    const parent = store.selectedFolder === "全部题目" ? "" : store.selectedFolder;
    if (parent.split("/").filter(Boolean).length >= 5) return toast("最多支持 5 级文件夹");
    const path = parent ? `${parent}/${name}` : name;
    if (orderedFolders.includes(path)) return toast("该文件夹已存在");
    store.addFolder(path);
    store.setSelectedFolder(path);
    setNewFolderName("");
    toast(`已创建文件夹「${path}」`);
  }

  function dissolveFolder(folder: string) {
    if (folder === "默认题库" || !store.folders.includes(folder)) return;
    const parent = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "默认题库";
    const affected = store.archives.filter((item) => folderContains(item.folder, folder)).length;
    if (!window.confirm(`确定解散文件夹「${folder}」？其中 ${affected} 道题目会移至「${parent}」`)) return;
    store.removeFolder(folder);
    if (folderContains(store.selectedFolder, folder)) store.setSelectedFolder(parent);
    toast(`已解散文件夹「${folder}」`);
  }

  function deleteFolder(folder: string) {
    if (folder === "默认题库" || !store.folders.includes(folder)) return;
    const affected = store.archives.filter((item) => folderContains(item.folder, folder));
    if (!window.confirm(`永久删除文件夹「${folder}」及其中 ${affected.length} 道题目？此操作不可恢复。`)) return;
    store.removeFolder(folder);
    if (folderContains(store.selectedFolder, folder)) store.setSelectedFolder(folderParent(folder) || "默认题库");
    toast(`已永久删除`);
  }

  function reorderFolder(target: string, placeAfter: boolean) {
    const source = draggedFolder;
    setDragOverFolder(null);
    setDraggedFolder(null);
    if (!source || source === target) return;
    if (folderParent(source) !== folderParent(target)) return toast("只能在同一级文件夹之间拖动排序");
    const siblings = orderedFolders.filter((item) => folderParent(item) === folderParent(source));
    const next = siblings.filter((item) => item !== source);
    const idx = next.indexOf(target);
    next.splice(idx + (placeAfter ? 1 : 0), 0, source);
    store.setFolderOrder([...store.folderOrder.filter((item) => !siblings.includes(item)), ...next]);
    toast(`已调整「${folderName(source)}」的顺序`);
  }

  async function generateProblemFromText() {
    if (rawProblemText.trim().length < 20) return toast("请粘贴完整题面，至少 20 个字符");
    const key = aiStore.apiKeys[aiStore.provider] || process.env.NEXT_PUBLIC_AI_API_KEY;
    if (!key) return toast("请填写 AI API Key");
    if (!aiStore.endpoint || !aiStore.model) return toast("请补全 API Endpoint 和模型");
    setGeneratingProblem(true);
    try {
      const res = await fetch("/api/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, endpoint: aiStore.endpoint, model: aiStore.model, rawProblem: rawProblemText }),
      });
      const data = await res.json() as { problem?: { id: string; title: string; samples: unknown[] }; error?: string; complexityReport?: { performanceCount: number } };
      if (!res.ok || !data.problem) throw new Error(data.error || "题目解析失败");

      // Archive it
      const nextNumber = store.archives.reduce((max, a) => {
        const m = /^CF(\d+)$/.exec(a.problem.id);
        return m ? Math.max(max, Number(m[1])) : max;
      }, 0) + 1;
      const nextId = customProblemId.trim() || `CF${String(nextNumber).padStart(4, "0")}`;
      const archiveFolder = store.selectedFolder === "全部题目" ? "默认题库" : store.selectedFolder;
      const incoming = data.problem as Record<string, unknown>;
      const numbered = { ...incoming, id: nextId } as typeof INITIAL_PROBLEM;
      store.addArchive({ problem: numbered, folder: archiveFolder, archivedAt: new Date().toISOString() });
      setProblem(numbered);
      setCode(STARTER_CODE);
      setCompilerDiagnostic("");
      setShowImport(false);
      router.push(`/problem/${nextId}`);
      toast(`已生成并归档：${nextId} · ${data.problem.samples.length} 个测试点`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI 生成题目失败");
    } finally {
      setGeneratingProblem(false);
    }
  }

  function importProblem(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        // Basic validation
        if (!parsed.title || !parsed.description) throw new Error("JSON 格式不正确");
        const nextNumber = store.archives.reduce((max, a) => {
          const m = /^CF(\d+)$/.exec(a.problem.id);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 0) + 1;
        const nextId = customProblemId.trim() || `CF${String(nextNumber).padStart(4, "0")}`;
        const archiveFolder = store.selectedFolder === "全部题目" ? "默认题库" : store.selectedFolder;
        store.addArchive({ problem: { ...parsed, id: nextId } as typeof INITIAL_PROBLEM, folder: archiveFolder, archivedAt: new Date().toISOString() });
        setShowImport(false);
        setCustomProblemId("");
        toast(`已导入并归档：${nextId}`);
      } catch (err) {
        toast(`导入失败：${err instanceof Error ? err.message : "请检查 JSON 格式"}`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <header className="topbar">
        <div className="brand"><img className="brand-mark" src="/codenow/icon.jpg" alt="CodeNow 图标" /><span>CodeNow</span><em>OJ</em></div>
        <nav>
          <button className="nav-active">题库</button>
          <button onClick={() => router.push("/")}>做题</button>
          <button onClick={() => toast("比赛功能正在开发中，敬请期待")}>比赛</button>
          <button onClick={() => toast("讨论区正在开发中，敬请期待")}>讨论</button>
        </nav>
        <div className="header-actions">
          <span className="avatar">LR</span>
          <div className="user-copy"><b>LinR</b><small>Lv.12 · 1842</small></div>
        </div>
      </header>

      <section className="library-page">
        <div className="library-hero">
          <div><span>CODENOW PROBLEM SET</span><h1>我的题库</h1><p>选择一道题进入专注的 C++ 编程与判题工作区。</p></div>
          <button onClick={() => { if (store.selectedFolder === "全部题目") store.setSelectedFolder("默认题库"); setShowImport(true); }}>＋ 添加题目</button>
        </div>
        <div className="library-page-body">
          {/* Sidebar */}
          <aside className="library-page-sidebar">
            <h3>题目文件夹</h3>
            <button className={store.selectedFolder === "全部题目" ? "active" : ""} onClick={() => store.setSelectedFolder("全部题目")}>
              <span>▦ 全部题目</span><b>{store.archives.length + acwingProblems.length + 1}</b>
            </button>
            {visibleFolders.map((folder) => {
              const hasChildren = orderedFolders.some((item) => item.startsWith(`${folder}/`));
              const collapsed = store.collapsedFolders.includes(folder);
              // const marginStyle = { marginLeft: `${(folder.split("/").length - 1) * 13}px` };
              return (
                <div className={`folder-entry ${dragOverFolder === folder ? "drag-over" : ""}`} key={folder} style={{ marginLeft: `${(folder.split("/").length - 1) * 13}px` }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverFolder(folder); }}
                  onDragLeave={() => setDragOverFolder((item) => item === folder ? null : item)}
                  onDrop={(e) => { e.preventDefault(); const b = e.currentTarget.getBoundingClientRect(); reorderFolder(folder, e.clientY > b.top + b.height / 2); }}>
                  <button className="folder-drag" draggable aria-label={`拖动排序 ${folder}`} onDragStart={(e) => { setDraggedFolder(folder); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDraggedFolder(null); setDragOverFolder(null); }}>⋮</button>
                  {hasChildren ? <button className="folder-expand" onClick={() => store.toggleCollapsed(folder)}>{collapsed ? "›" : "⌄"}</button> : <span className="folder-spacer" />}
                  <button className={`folder-select ${store.selectedFolder === folder ? "active" : ""}`} onClick={() => store.setSelectedFolder(folder)}>
                    <span>▱ {folderName(folder)}</span>
                    <b>{store.archives.filter((a) => folderContains(a.folder, folder)).length + acwingProblems.filter((p) => folderContains(p.folder, folder)).length + (folder === "默认题库" ? 1 : 0)}</b>
                  </button>
                  {folder !== "默认题库" && store.folders.includes(folder) && <>
                    <button className="folder-action dissolve" onClick={() => dissolveFolder(folder)}>散</button>
                    <button className="folder-action destructive" onClick={() => deleteFolder(folder)}>删</button>
                  </>}
                </div>
              );
            })}
            <div className="folder-operation-hint">⋮ 拖动排序 · "散"保留题目 · "删"永久删除</div>
            <div className="folder-create-caption">{store.selectedFolder === "全部题目" ? "新建根文件夹" : `在「${folderName(store.selectedFolder)}」中新建`}</div>
            <div className="new-folder page-folder"><input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createFolder(); }} placeholder="文件夹名称" /><button onClick={createFolder}>＋</button></div>
          </aside>

          {/* Catalog */}
          <main className="library-catalog">
            <div className="catalog-toolbar">
              <div><h2 className="folder-breadcrumb">{store.selectedFolder === "全部题目" ? "全部题目" : store.selectedFolder.split("/").map((p, i) => <span key={`${p}-${i}`}>{i > 0 && <i>›</i>}{p}</span>)}</h2>
              <span>{selectedArchives.length + selectedAcwing.length + (showBuiltIn ? 1 : 0)} 道题目</span></div>
              <div className="catalog-tools">
                {store.selectedFolder !== "全部题目" && <button className={store.includeSubfolders ? "active" : ""} onClick={() => store.setIncludeSubfolders(!store.includeSubfolders)}>{store.includeSubfolders ? "含子文件夹" : "仅当前文件夹"}</button>}
                <label><span>⌕</span><input value={store.librarySearch} onChange={(e) => store.setLibrarySearch(e.target.value)} placeholder="搜索编号或题目名称" /></label>
              </div>
            </div>
            <div className="catalog-header"><span>题目</span><span>难度</span><span>测试点</span><span>分类</span><span></span></div>
            <div className="catalog-list">
              {showBuiltIn && <article className="catalog-row built-in"><div className="catalog-problem-link"><span className="catalog-id-edit locked"><code>{INITIAL_PROBLEM.id}</code></span><button className="catalog-title-open" onClick={openBuiltIn}><span><b>{INITIAL_PROBLEM.title}</b><small>经典入门题 · 内置题目</small></span></button></div><span className="difficulty beginner">{INITIAL_PROBLEM.difficulty}</span><span>{INITIAL_PROBLEM.samples.length} 个</span><span>默认题库</span><i onClick={openBuiltIn}>进入做题 →</i></article>}
              {selectedAcwing.map((item) => (
                <article className="catalog-row external-problem" key={item.id}>
                  <div className="catalog-problem-link"><span className="catalog-id-edit locked"><code>{item.id}</code></span><button className="catalog-title-open" onClick={() => openBundled(item)}><span><b>{item.title}</b><small>{item.extractionStatus === "complete" ? "题面已自动提取" : "题面需结合来源核对"} · 博客园来源</small></span></button></div>
                  <span className="difficulty normal">{item.difficulty}</span><span>{item.samples.length} 个</span><span title={item.folder}>{folderName(item.folder)}</span>
                  <div className="row-actions"><a href={item.sourceUrl} target="_blank" rel="noreferrer">来源</a><i onClick={() => openBundled(item)}>进入 →</i></div>
                </article>
              ))}
              {selectedArchives.map((item) => (
                <article className="catalog-row" key={item.problem.id}>
                  <div className="catalog-problem-link"><span className="catalog-id-edit editable"><code>{item.problem.id}</code></span><button className="catalog-title-open" onClick={() => openArchived(item)}><span><b>{item.problem.title}</b><small>{new Date(item.archivedAt).toLocaleDateString("zh-CN")} 归档</small></span></button></div>
                  <span className={`difficulty ${item.problem.difficulty === "提高" ? "advanced" : item.problem.difficulty === "普及" ? "normal" : "beginner"}`}>{item.problem.difficulty}</span>
                  <span>{item.problem.samples.length} 个</span>
                  <span>{folderName(item.folder)}</span>
                  <div className="row-actions"><button className="danger-action" onClick={() => { if (window.confirm(`永久删除 ${item.problem.id}？`)) store.removeArchive(item.problem.id); }}>删除</button><i onClick={() => openArchived(item)}>进入 →</i></div>
                </article>
              ))}
              {!showBuiltIn && selectedAcwing.length === 0 && selectedArchives.length === 0 && (
                <div className="catalog-empty"><b>暂无题目</b><span>点击"添加题目"导入 JSON，或粘贴题面让 AI 自动生成。</span></div>
              )}
            </div>
          </main>
        </div>
      </section>

      {/* Import Modal */}
      {showImport && <div className="modal-backdrop" onMouseDown={() => setShowImport(false)}><div className="modal import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowImport(false)}>×</button>
        <span className="modal-kicker">快速开始</span><h2>添加一道练习题</h2>
        <div className="import-tabs"><button className={importMode === "paste" ? "active" : ""} onClick={() => setImportMode("paste")}>✦ 粘贴题面</button><button className={importMode === "json" ? "active" : ""} onClick={() => setImportMode("json")}>⇧ 导入 JSON</button></div>
        {importMode === "paste" ? <>
          <p>直接复制题目全文，AI 会整理题面并生成可立即运行的测试点。</p>
          <label className="raw-problem-label">题目原文<textarea value={rawProblemText} onChange={(e) => setRawProblemText(e.target.value)} placeholder="粘贴题目标题、描述、输入输出格式、数据范围和样例……" /></label>
          <label className="raw-problem-label">API Key<div className="api-key-input"><input type="password" value={aiStore.apiKeys[aiStore.provider]} onChange={(e) => aiStore.setApiKey(aiStore.provider, e.target.value)} placeholder="输入后会保存在本机浏览器" autoComplete="off" /></div></label>
          <button className="generate-button" disabled={generatingProblem} onClick={generateProblemFromText}>{generatingProblem ? "正在理解题目…" : "✦ 生成题目与测试点"}</button>
        </> : <>
          <p>文件必须是 UTF-8 JSON。</p>
          <button className="dropzone compact" onClick={() => fileRef.current?.click()}><strong>⇧</strong><b>选择 JSON 文件</b></button>
          <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => importProblem(e.target.files?.[0])} />
          <div className="download-row"><a href="/problem-example.json" download>下载完整示例</a></div>
        </>}
      </div></div>}

      <Toast message={notice} />
    </main>
  );
}

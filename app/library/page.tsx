"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Toast } from "../components/toast";
import { Topbar } from "../components/topbar";
import { useEscapeClose } from "../hooks/use-escape-close";
import { useToast } from "../hooks/use-toast";
import { authClient } from "../lib/auth-client";
import { dissolveFolderLevel, planFolderMove } from "../lib/folder-tree";
import { buildCloudFolderPaths, ProblemApi } from "../lib/problem-api";
import { getProblemSourceLabel } from "../lib/problem-source";
import { canManageBuiltinProblems } from "../lib/problem-permissions";
import { useAiStore } from "../stores/ai-store";
import { useLibraryStore, loadAcwingCatalog, loadBundledSamples, folderName, folderParent, folderContains, orderFolderTree, getAcwingProblems } from "../stores/library-store";
import { draftKey, useProblemStore, INITIAL_PROBLEM, STARTER_CODE } from "../stores/problem-store";
import { useThemeStore } from "../stores/theme-store";

export default function LibraryPage() {
  const router = useRouter();
  const store = useLibraryStore();
  const { setProblem, setCode, setResults, setCompilerDiagnostic, setCloudState, loadLocalProblem, createBlankWorkspace, clearPrivateWorkspace } = useProblemStore();
  const session = authClient.useSession();
  const canManageBuiltins = canManageBuiltinProblems(session.data?.user);
  const theme = useThemeStore();
  const { notice, toast } = useToast();

  const [newFolderName, setNewFolderName] = useState("");
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [dragOverMode, setDragOverMode] = useState<"sort" | "into">("sort");
  const [menuFolder, setMenuFolder] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nextProblemId, setNextProblemId] = useState("");

  // Import modal state
  const [importMode, setImportMode] = useState<"paste" | "json">("paste");
  const [rawProblemText, setRawProblemText] = useState("");
  const [customProblemId, setCustomProblemId] = useState("");
  const [generatingProblem, setGeneratingProblem] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [withTests, setWithTests] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 订阅 catalogVersion：bundled 题源异步加载完成后触发重渲染
  void store.catalogVersion;
  const acwingProblems = getAcwingProblems()
    .filter((item) => canManageBuiltins || !store.hiddenBuiltins.includes(item.id))
    .map((item) => ({ ...item, folder: store.builtinFolderOverrides[item.id] ?? item.folder }));
  const acwingFolders = Array.from(new Set(acwingProblems.flatMap((problem) => {
    const parts = problem.folder.split("/").filter(Boolean);
    return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  })));
  const builtinVisible = canManageBuiltins || !store.hiddenBuiltins.includes(INITIAL_PROBLEM.id);
  const builtinFolder = store.builtinFolderOverrides[INITIAL_PROBLEM.id] ?? "默认题库";

  // Esc 收起弹窗
  useEscapeClose(showImport, () => setShowImport(false));
  useEscapeClose(Boolean(renamingId), () => setRenamingId(null));
  useEscapeClose(Boolean(menuFolder), () => setMenuFolder(null));

  const builtinFolderPaths = builtinVisible && builtinFolder ? builtinFolder.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/")) : [];
  const folders = [...store.folders, ...(store.cloudArchives.length ? ["云端题库"] : []), ...Object.keys(store.cloudFolderIds), ...acwingFolders, ...builtinFolderPaths];
  const orderedFolders = orderFolderTree(folders, store.folderOrder);

  const visibleFolders = orderedFolders.filter((folder) => {
    const parts = folder.split("/");
    return parts.slice(0, -1).every((_, index) => !store.collapsedFolders.includes(parts.slice(0, index + 1).join("/")));
  });

  const matchesSelectedFolder = (folder: string) =>
    store.selectedFolder === "全部题目" ||
    (store.includeSubfolders ? folderContains(folder, store.selectedFolder) : folder === store.selectedFolder);

  // 搜索匹配题号或标题(大小写不敏感)，对全部题源统一生效
  const search = store.librarySearch.trim().toLowerCase();
  const matchesSearch = (id: string, title: string) => !search || `${id} ${title}`.toLowerCase().includes(search);
  const selectedArchives = [...store.cloudArchives, ...store.archives].filter((item) => matchesSelectedFolder(item.folder) && matchesSearch(item.problem.id, item.problem.title));
  const selectedAcwing = acwingProblems.filter((item) => matchesSelectedFolder(item.folder) && matchesSearch(item.id, item.title));
  const showBuiltIn = builtinVisible && matchesSelectedFolder(builtinFolder) && (!store.librarySearch || `${INITIAL_PROBLEM.id} ${INITIAL_PROBLEM.title}`.toLowerCase().includes(store.librarySearch.toLowerCase()));

  useEffect(() => { store.setLibraryReady(); loadAcwingCatalog(); }, []);
  useEffect(() => {
    if (!session.data?.user) { store.setCloudArchives([]); store.setCloudFolderIds({}); return; }
    const controller = new AbortController();
    Promise.all([ProblemApi.list(controller.signal), ProblemApi.listFolders(controller.signal)]).then(([{ problems }, { folders }]) => {
      const folderPaths = buildCloudFolderPaths(folders);
      const pathById = new Map(Object.entries(folderPaths).map(([path, id]) => [id, path]));
      store.setCloudFolderIds(folderPaths);
      store.setCloudArchives(problems.map((item) => ({
        cloudId: item.id,
        version: item.version,
        folder: item.folderId ? pathById.get(item.folderId) ?? "云端题库" : "云端题库",
        archivedAt: item.updatedAt,
        problem: {
          id: item.problemCode, title: item.title, difficulty: item.difficulty, time: item.timeLimit, memory: item.memoryLimit,
          description: item.description, inputFormat: item.inputFormat, outputFormat: item.outputFormat, samples: [],
          sourceUrl: item.sourceUrl ?? undefined, extractionStatus: item.extractionStatus ?? undefined,
        },
      })));
    }).catch(() => { /* keep the local library available while offline */ });
    return () => controller.abort();
  }, [session.data?.user?.id]);

  async function openArchived(item: typeof store.archives[number]) {
    let selected = item.problem;
    if (item.cloudId) {
      const { problem: cloud } = await ProblemApi.get(item.cloudId);
      selected = {
        id: cloud.problemCode, title: cloud.title, difficulty: cloud.difficulty, time: cloud.timeLimit, memory: cloud.memoryLimit,
        description: cloud.description, inputFormat: cloud.inputFormat, outputFormat: cloud.outputFormat,
        sourceUrl: cloud.sourceUrl ?? undefined, extractionStatus: cloud.extractionStatus ?? undefined,
        samples: cloud.testCases.map((test, index) => ({
          id: index + 1, input: test.input, output: test.expectedOutput, category: test.category ?? undefined,
          scale: test.scale ?? undefined, targets: test.targets ?? undefined, reason: test.reason ?? undefined,
        })),
      };
      setCloudState({ cloudId: item.cloudId, version: cloud.version, syncStatus: "synced" });
      try {
        const draft = await ProblemApi.getDraft("private", item.cloudId, "cpp");
        setCode(draft.draft.sourceCode);
        setCloudState({ draftVersion: draft.version });
      } catch {
        setCode(useProblemStore.getState().draftCache[draftKey(selected, item.cloudId)] ?? STARTER_CODE);
        setCloudState({ draftVersion: 0 });
      }
    } else {
      loadLocalProblem(selected);
    }
    setProblem(selected);
    setResults([]);
    setCompilerDiagnostic("");
    router.push(`/problem/${selected.id}`);
    toast(`已打开 ${selected.id} · ${selected.title}`);
  }

  async function openBundled(item: ReturnType<typeof getAcwingProblems>[number]) {
    // 索引题 samples 为空，打开做题页前按需拉取完整测试点
    const samples = item.samples.length ? item.samples : await loadBundledSamples(item.id);
    loadLocalProblem({ ...item, samples });
    router.push(`/problem/${item.id}`);
    toast(`已打开 ${item.id} · ${item.title}`);
  }

  function openBuiltIn() {
    loadLocalProblem(INITIAL_PROBLEM);
    router.push("/problem/P1001");
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (/[\\/]/.test(name)) return toast("文件夹名称不能包含斜杠");
    const cloudParent = store.cloudFolderIds[store.selectedFolder] ? store.selectedFolder : "";
    const parent = session.data?.user ? cloudParent : store.selectedFolder === "全部题目" ? "" : store.selectedFolder;
    if (parent.split("/").filter(Boolean).length >= 5) return toast("最多支持 5 级文件夹");
    const path = parent ? `${parent}/${name}` : name;
    if (orderedFolders.includes(path)) return toast("该文件夹已存在");
    if (session.data?.user) {
      const created = await ProblemApi.createFolder(name, parent ? store.cloudFolderIds[parent] ?? null : null);
      store.setCloudFolderIds({ ...store.cloudFolderIds, [path]: created.folder.id });
    } else {
      store.addFolder(path);
    }
    store.setSelectedFolder(path);
    setNewFolderName("");
    toast(`已创建文件夹「${path}」`);
  }

  async function dissolveFolder(folder: string) {
    const cloudId = store.cloudFolderIds[folder];
    if (folder === "云端题库" || !orderedFolders.includes(folder)) return;
    const parentPath = folderParent(folder);
    const parent = parentPath || (cloudId ? "云端题库" : "全部题目");
    const affected = [...store.archives, ...store.cloudArchives].filter((item) => item.folder === folder).length
      + (builtinVisible && builtinFolder === folder ? 1 : 0)
      + acwingProblems.filter((item) => item.folder === folder).length;
    if (!window.confirm(`确定解散文件夹「${folder}」？其中 ${affected} 道题目会移至「${parent}」`)) return;
    if (cloudId) {
      await ProblemApi.deleteFolder(cloudId);
      const plan = dissolveFolderLevel(Object.keys(store.cloudFolderIds), folder);
      const nextIds = Object.fromEntries(Object.entries(store.cloudFolderIds).filter(([path]) => path !== folder).map(([path, id]) => [plan.remap(path), id]));
      store.setCloudFolderIds(nextIds);
      store.setCloudArchives(store.cloudArchives.map((item) => ({
        ...item,
        folder: item.folder === folder ? parent : item.folder.startsWith(`${folder}/`) ? plan.remap(item.folder) : item.folder,
      })));
    } else store.dissolveFolder(folder);
    if (cloudId && folderContains(store.selectedFolder, folder)) store.setSelectedFolder(parent);
    toast(`已解散文件夹「${folder}」`);
  }

  function openBlank() {
    createBlankWorkspace();
    router.push("/problem/NEW");
  }

  async function deleteFolder(folder: string) {
    const cloudId = store.cloudFolderIds[folder];
    if (folder === "云端题库" || !orderedFolders.includes(folder)) return;
    const affected = [...store.archives, ...store.cloudArchives].filter((item) => folderContains(item.folder, folder));
    const builtinCount = (builtinVisible && folderContains(builtinFolder, folder) ? 1 : 0)
      + acwingProblems.filter((item) => folderContains(item.folder, folder)).length;
    if (!cloudId && builtinCount > 0 && !canManageBuiltins) {
      toast("只有管理员或被授予题库管理权限的用户才能删除内置题目");
      return;
    }
    const prompt = cloudId
      ? `删除云端文件夹「${folder}」？其中 ${affected.length} 道题目会移至上级文件夹。`
      : `永久删除文件夹「${folder}」及其中 ${affected.length + builtinCount} 道题目？此操作不可恢复。`;
    if (!window.confirm(prompt)) return;
    if (cloudId) {
      await ProblemApi.deleteFolder(cloudId);
      const parent = folderParent(folder) || "云端题库";
      const plan = dissolveFolderLevel(Object.keys(store.cloudFolderIds), folder);
      store.setCloudFolderIds(Object.fromEntries(Object.entries(store.cloudFolderIds).filter(([path]) => path !== folder).map(([path, id]) => [plan.remap(path), id])));
      store.setCloudArchives(store.cloudArchives.map((item) => ({
        ...item,
        folder: item.folder === folder ? parent : item.folder.startsWith(`${folder}/`) ? plan.remap(item.folder) : item.folder,
      })));
    } else store.removeFolder(folder);
    if (folderContains(store.selectedFolder, folder)) store.setSelectedFolder(folderParent(folder) || (cloudId ? "云端题库" : "默认题库"));
    toast(`已永久删除`);
  }

  async function confirmRename() {
    if (!renamingId) return;
    const nextId = nextProblemId.trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(nextId)) return toast("题号需以字母开头，仅含字母数字下划线短横线，最长 20 位");
    if (store.archives.some((a) => a.problem.id === renamingId)) {
      store.renameProblem(renamingId, nextId);
    } else {
      // 内置题(P1001/AcWing)去特权：改题号即物化为普通归档副本
      const builtin = renamingId === INITIAL_PROBLEM.id
        ? { problem: INITIAL_PROBLEM, folder: builtinFolder }
        : (() => { const item = acwingProblems.find((p) => p.id === renamingId); return item ? { problem: item, folder: item.folder } : null; })();
      if (!builtin) return toast("未找到该题目");
      // 索引题 samples 为空，物化前按需补齐完整测试点
      const samples = builtin.problem.samples.length ? builtin.problem.samples : await loadBundledSamples(renamingId);
      store.materializeBuiltin({ ...builtin.problem, samples }, builtin.folder, nextId);
    }
    setRenamingId(null);
    setNextProblemId("");
    toast(`题号已修改为 ${nextId}`);
  }

  /** 落点三段判定：上/下 30% 为排序，中段为拖入成为子文件夹；无高度信息时退回排序语义 */
  function dropZoneOf(clientY: number, rect: DOMRect): "before" | "after" | "into" {
    if (rect.height <= 0) return clientY > rect.top ? "after" : "before";
    const ratio = (clientY - rect.top) / rect.height;
    return ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "into";
  }

  async function moveFolderToParent(source: string, destinationParent: string) {
    const plan = planFolderMove(orderedFolders, source, destinationParent);
    if (!plan.ok) { toast(plan.error); return null; }
    const sourceCloudId = store.cloudFolderIds[source];
    const targetCloudId = destinationParent ? store.cloudFolderIds[destinationParent] : undefined;
    if (destinationParent && (sourceCloudId || targetCloudId) && (!sourceCloudId || !targetCloudId)) {
      toast("本地与云端文件夹之间暂不支持移动");
      return null;
    }
    if (sourceCloudId) {
      await ProblemApi.updateFolder(sourceCloudId, { parentId: targetCloudId ?? null });
      store.setCloudFolderIds(Object.fromEntries(Object.entries(store.cloudFolderIds).map(([path, id]) => [plan.remap(path), id])));
      store.setCloudArchives(store.cloudArchives.map((item) => folderContains(item.folder, source) ? { ...item, folder: plan.remap(item.folder) } : item));
    } else {
      store.moveFolder(source, destinationParent);
    }
    return plan;
  }

  async function reparentFolder(target: string) {
    const source = draggedFolder;
    setDragOverFolder(null);
    setDraggedFolder(null);
    if (!source || source === target) return;
    const plan = await moveFolderToParent(source, target);
    if (plan) toast(`已将「${folderName(source)}」移入「${folderName(target)}」`);
  }

  async function reorderFolder(target: string, placeAfter: boolean) {
    const source = draggedFolder;
    setDragOverFolder(null);
    setDraggedFolder(null);
    if (!source || source === target) return;
    const destinationParent = folderParent(target);
    const plan = folderParent(source) === destinationParent
      ? { ok: true as const, remap: (path: string) => path, nextPaths: orderedFolders }
      : await moveFolderToParent(source, destinationParent);
    if (!plan) return;
    const movedSource = plan.remap(source);
    const movedFolders = orderedFolders.map(plan.remap);
    const siblings = movedFolders.filter((item) => folderParent(item) === destinationParent);
    const next = siblings.filter((item) => item !== movedSource);
    const idx = next.indexOf(target);
    next.splice(idx + (placeAfter ? 1 : 0), 0, movedSource);
    const currentOrder = useLibraryStore.getState().folderOrder;
    store.setFolderOrder([...currentOrder.filter((item) => !siblings.includes(item)), ...next]);
    toast(`已调整「${folderName(movedSource)}」的位置`);
  }

  async function moveFolderToRoot() {
    const source = draggedFolder;
    setDragOverFolder(null);
    setDraggedFolder(null);
    if (!source || !folderParent(source)) return;
    const plan = await moveFolderToParent(source, "");
    if (plan) toast(`已将「${folderName(source)}」移至全部题目`);
  }

  async function generateProblemFromText() {
    if (rawProblemText.trim().length < 20) return toast("请粘贴完整题面，至少 20 个字符");
    setGenerateError("");
    setGeneratingProblem(true);
    try {
      const res = await fetch("/api/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawProblem: rawProblemText, withTests }),
      });
      const data = await res.json() as { problem?: { id: string; title: string; samples: unknown[] }; error?: string; complexityReport?: { performanceCount: number } };
      if (!res.ok || !data.problem) throw new Error(data.error || "题目解析失败");

      // Archive it
      const nextNumber = store.archives.reduce((max, a) => {
        const m = /^CF(\d+)$/.exec(a.problem.id);
        return m ? Math.max(max, Number(m[1])) : max;
      }, 0) + 1;
      const nextId = customProblemId.trim() || `CF${String(nextNumber).padStart(4, "0")}`;
      const archiveFolder = store.selectedFolder === "全部题目" ? "" : store.selectedFolder;
      const incoming = data.problem as Record<string, unknown>;
      const numbered = { ...incoming, id: nextId } as typeof INITIAL_PROBLEM;
      if (session.data?.user) {
        const created = await ProblemApi.create({
          problemCode: numbered.id, title: numbered.title, difficulty: numbered.difficulty, timeLimit: numbered.time, memoryLimit: numbered.memory,
          description: numbered.description, inputFormat: numbered.inputFormat, outputFormat: numbered.outputFormat,
          sourceUrl: numbered.sourceUrl ?? null, extractionStatus: numbered.extractionStatus ?? null,
          folderId: store.cloudFolderIds[archiveFolder] ?? null,
        });
        const saved = await ProblemApi.replaceTests(created.problem.id, created.version, numbered.samples.map((item) => ({
          input: item.input, expectedOutput: item.output, category: item.category, scale: item.scale, targets: item.targets, reason: item.reason,
        })), crypto.randomUUID());
        store.setCloudArchives([{ problem: numbered, folder: store.cloudFolderIds[archiveFolder] ? archiveFolder : "云端题库", archivedAt: saved.updatedAt, cloudId: created.problem.id, version: saved.version }, ...store.cloudArchives]);
        setCloudState({ cloudId: created.problem.id, version: saved.version, draftVersion: 0, syncStatus: "synced" });
      } else {
        store.addArchive({ problem: numbered, folder: archiveFolder, archivedAt: new Date().toISOString() });
      }
      setProblem(numbered);
      setCode(STARTER_CODE);
      setCompilerDiagnostic("");
      setShowImport(false);
      router.push(`/problem/${nextId}`);
      toast(withTests
        ? `已生成并归档：${nextId} · ${data.problem.samples.length} 个测试点`
        : `已解析并归档：${nextId} · 含 ${data.problem.samples.length} 个官方样例，可在做题页用 AI 分批生成测试点`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 生成题目失败";
      setGenerateError(message);
      toast(message);
    } finally {
      setGeneratingProblem(false);
    }
  }

  function importProblem(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        // Basic validation
        if (!parsed.title || !parsed.description) throw new Error("JSON 格式不正确");
        const nextNumber = store.archives.reduce((max, a) => {
          const m = /^CF(\d+)$/.exec(a.problem.id);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 0) + 1;
        const nextId = customProblemId.trim() || `CF${String(nextNumber).padStart(4, "0")}`;
        const archiveFolder = store.selectedFolder === "全部题目" ? "" : store.selectedFolder;
        const numbered = { ...parsed, id: nextId } as typeof INITIAL_PROBLEM;
        if (session.data?.user) {
          const created = await ProblemApi.create({
            problemCode: numbered.id, title: numbered.title, difficulty: numbered.difficulty, timeLimit: numbered.time, memoryLimit: numbered.memory,
            description: numbered.description, inputFormat: numbered.inputFormat, outputFormat: numbered.outputFormat,
            folderId: store.cloudFolderIds[archiveFolder] ?? null,
          });
          const saved = await ProblemApi.replaceTests(created.problem.id, created.version, numbered.samples.map((item) => ({ input: item.input, expectedOutput: item.output })), crypto.randomUUID());
          store.setCloudArchives([{ problem: numbered, folder: store.cloudFolderIds[archiveFolder] ? archiveFolder : "云端题库", archivedAt: saved.updatedAt, cloudId: created.problem.id, version: saved.version }, ...store.cloudArchives]);
        } else {
          store.addArchive({ problem: numbered, folder: archiveFolder, archivedAt: new Date().toISOString() });
        }
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
      <Topbar onToast={toast} onSignedOut={() => { useAiStore.getState().clearChat(); store.setCloudArchives([]); store.setCloudFolderIds({}); clearPrivateWorkspace(); }} />

      <section className="library-page">
        <div className="library-hero">
          <div><span>CODENOW PROBLEM SET</span><h1>我的题库</h1><p>选择一道题进入专注的 C++ 编程与判题工作区。</p></div>
          {theme.themeMode === "girl" && (
            <div className="girl-portrait-stack" aria-hidden="true">
              <img src="/codenow/portrait-ribbon.jpg" alt="" loading="lazy" decoding="async" />
              <img src="/codenow/portrait-sailor.jpg" alt="" loading="lazy" decoding="async" />
              <img src="/codenow/sunny-selfie.jpg" alt="" loading="lazy" decoding="async" />
            </div>
          )}
          <button aria-label="新建空白题目" onClick={openBlank}>＋ 空白题目</button>
          <button onClick={() => { if (store.selectedFolder === "全部题目") store.setSelectedFolder("默认题库"); setGenerateError(""); setShowImport(true); }}>＋ 添加题目</button>
        </div>
        <div className="library-page-body">
          {/* Sidebar */}
          <aside className="library-page-sidebar">
            <h3>题目文件夹</h3>
            <button className={`${store.selectedFolder === "全部题目" ? "active" : ""} ${dragOverFolder === "全部题目" ? "drag-into" : ""}`}
              onClick={() => store.setSelectedFolder("全部题目")}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverFolder("全部题目"); }}
              onDragLeave={() => setDragOverFolder((item) => item === "全部题目" ? null : item)}
              onDrop={(event) => { event.preventDefault(); void moveFolderToRoot(); }}>
              <span>▦ 全部题目</span><b>{store.archives.length + acwingProblems.length + (builtinVisible ? 1 : 0)}</b>
            </button>
            {visibleFolders.map((folder) => {
              const hasChildren = orderedFolders.some((item) => item.startsWith(`${folder}/`));
              const collapsed = store.collapsedFolders.includes(folder);
              // const marginStyle = { marginLeft: `${(folder.split("/").length - 1) * 13}px` };
              return (
                <div className={`folder-entry ${dragOverFolder === folder ? (dragOverMode === "into" ? "drag-into" : "drag-over") : ""}`} key={folder} style={{ marginLeft: `${(folder.split("/").length - 1) * 13}px` }}
                  draggable
                  onDragStart={(e) => { setDraggedFolder(folder); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", folder); }}
                  onDragEnd={() => { setDraggedFolder(null); setDragOverFolder(null); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverFolder(folder); setDragOverMode(dropZoneOf(e.clientY, e.currentTarget.getBoundingClientRect()) === "into" ? "into" : "sort"); }}
                  onDragLeave={() => setDragOverFolder((item) => item === folder ? null : item)}
                  onDrop={(e) => { e.preventDefault(); const zone = dropZoneOf(e.clientY, e.currentTarget.getBoundingClientRect()); if (zone === "into") { void reparentFolder(folder); } else { void reorderFolder(folder, zone === "after"); } }}>
                  {folder !== "云端题库"
                    ? <button className="folder-drag" aria-label={`文件夹操作 ${folder}`} title="点击展开操作 · 按住整行拖动排序" onClick={() => setMenuFolder((m) => m === folder ? null : folder)}>⋮</button>
                    : <span className="folder-drag" aria-hidden="true" title="按住整行拖动排序">⋮</span>}
                  {hasChildren ? <button className="folder-expand" onClick={() => store.toggleCollapsed(folder)}>{collapsed ? "›" : "⌄"}</button> : <span className="folder-spacer" />}
                  <button className={`folder-select ${store.selectedFolder === folder ? "active" : ""}`} onClick={() => store.setSelectedFolder(folder)}>
                    <span>▱ {folderName(folder)}</span>
                    <b>{store.archives.filter((a) => folderContains(a.folder, folder)).length + acwingProblems.filter((p) => folderContains(p.folder, folder)).length + (builtinVisible && folderContains(builtinFolder, folder) ? 1 : 0)}</b>
                  </button>
                  {menuFolder === folder && <div className="folder-menu" role="menu">
                    <button role="menuitem" onClick={() => { setMenuFolder(null); void dissolveFolder(folder); }}>散：解散并保留题目</button>
                    <button role="menuitem" className="danger" onClick={() => { setMenuFolder(null); void deleteFolder(folder); }}>删：永久删除</button>
                  </div>}
                </div>
              );
            })}
            <div className="folder-operation-hint">按住整行拖动排序，拖到行中部可移入为子文件夹 · 点 ⋮ 展开散/删操作</div>
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
              {showBuiltIn && <article className="catalog-row built-in"><div className="catalog-problem-link"><button className="catalog-id-edit editable" onClick={() => { setRenamingId(INITIAL_PROBLEM.id); setNextProblemId(INITIAL_PROBLEM.id); }}><code>{INITIAL_PROBLEM.id}</code></button><button className="catalog-title-open" onClick={openBuiltIn}><span><b>{INITIAL_PROBLEM.title}</b><small>经典入门题 · 内置题目</small></span></button></div><span className="difficulty beginner">{INITIAL_PROBLEM.difficulty}</span><span>{INITIAL_PROBLEM.samples.length} 个</span><span>{folderName(builtinFolder) || "全部题目"}</span><i onClick={openBuiltIn}>进入做题 →</i></article>}
              {selectedAcwing.map((item) => (
                <article className="catalog-row external-problem" key={item.id}>
                  <div className="catalog-problem-link"><button className="catalog-id-edit editable" onClick={() => { setRenamingId(item.id); setNextProblemId(item.id); }}><code>{item.id}</code></button><button className="catalog-title-open" onClick={() => openBundled(item)}><span><b>{item.title}</b><small>{getProblemSourceLabel(item)}</small></span></button></div>
                  <span className="difficulty normal">{item.difficulty}</span><span>{item.sampleCount ?? item.samples.length} 个</span><span title={item.folder}>{folderName(item.folder)}</span>
                  <div className="row-actions">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">来源</a>}<i onClick={() => openBundled(item)}>进入 →</i></div>
                </article>
              ))}
              {selectedArchives.map((item) => (
                <article className="catalog-row" key={item.problem.id}>
                  <div className="catalog-problem-link"><button className="catalog-id-edit editable" onClick={() => { setRenamingId(item.problem.id); setNextProblemId(item.problem.id); }}><code>{item.problem.id}</code></button><button className="catalog-title-open" onClick={() => openArchived(item)}><span><b>{item.problem.title}</b><small>{new Date(item.archivedAt).toLocaleDateString("zh-CN")} 归档</small></span></button></div>
                  <span className={`difficulty ${item.problem.difficulty === "提高" ? "advanced" : item.problem.difficulty === "普及" ? "normal" : "beginner"}`}>{item.problem.difficulty}</span>
                  <span>{item.problem.samples.length} 个</span>
                  <span>{folderName(item.folder)}</span>
                  <div className="row-actions"><button className="danger-action" onClick={() => { if (window.confirm(`永久删除 ${item.problem.id}？`)) store.removeArchive(item.problem.id); }}>删除</button><i onClick={() => openArchived(item)}>进入 →</i></div>
                </article>
              ))}
              {!showBuiltIn && selectedAcwing.length === 0 && selectedArchives.length === 0 && (
                <div className="catalog-empty"><b>暂无题目</b><span>点击“添加题目”导入 JSON，或粘贴题面让 AI 自动生成。</span></div>
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
          <p>直接复制题目全文，AI 会整理题面与官方样例并快速入库；测试点可入库后到做题页分批生成。</p>
          <label className="raw-problem-label">题目原文<textarea value={rawProblemText} onChange={(e) => setRawProblemText(e.target.value)} placeholder="粘贴题目标题、描述、输入输出格式、数据范围和样例……" /></label>
          <label className="with-tests-toggle">
            <input type="checkbox" checked={withTests} onChange={(e) => setWithTests(e.target.checked)} />
            <span><b>同时生成 AI 测试点</b><small>复杂题目建议关闭：先快速入库，再到做题页分批生成，避免一次性生成超时</small></span>
          </label>
          {generateError && <div className="generate-error" role="alert"><b>生成失败</b><span>{generateError}</span><small>请前往设置页检查 AI 服务与模型配置；生成较慢时也可能是上游超时，稍后再试。</small></div>}
          <button className="generate-button" disabled={generatingProblem} onClick={generateProblemFromText}>{generatingProblem ? "正在理解题目…" : withTests ? "✦ 生成题目与测试点" : "✦ 解析题目并入库"}</button>
        </> : <>
          <p>文件必须是 UTF-8 JSON。</p>
          <button className="dropzone compact" onClick={() => fileRef.current?.click()}><strong>⇧</strong><b>选择 JSON 文件</b></button>
          <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => importProblem(e.target.files?.[0])} />
          <div className="download-row"><a href="/problem-example.json" download>下载完整示例</a></div>
        </>}
      </div></div>}

      {/* Rename Modal */}
      {renamingId && <div className="modal-backdrop" onMouseDown={() => setRenamingId(null)}><div className="modal rename-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setRenamingId(null)}>×</button>
        <span className="modal-kicker">PROBLEM ID</span><h2>修改题目编号</h2>
        <p>修改后会同步更新题库存档和提交记录。</p>
        <label>新题号<input autoFocus value={nextProblemId} onChange={(e) => setNextProblemId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); }} placeholder="如 ALG001" maxLength={20} /></label>
        <small>以字母开头，可使用字母、数字、下划线和短横线。</small>
        <button className="generate-button" onClick={confirmRename}>保存新题号</button>
      </div></div>}

      <Toast message={notice} />
    </main>
  );
}

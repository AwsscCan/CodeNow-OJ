"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { dissolveFolderLevel, planFolderMove } from "../lib/folder-tree";

// Lazy-loaded bundled catalog INDEX (轻量元数据, 不含测试点; 完整测试点按需从 /problems/<id>.json 取)
let _acwingCatalog: BundledProblem[] | null = null;
let _acwingLoadAttempted = false;
const _bundledSampleCache = new Map<string, TestCase[]>();
const CATALOG_INDEX_URL = "/catalog-index.json";

type TestCase = { id: number; input: string; output: string; category?: string; scale?: number; targets?: string; reason?: string };
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
type ArchivedProblem = { problem: Problem; folder: string; archivedAt: string; deletedAt?: string; cloudId?: string; version?: number };
export type DeletedBuiltin = { id: string; deletedAt: string };
type BundledProblem = Problem & { folder: string; sourceUrl: string; extractionStatus: "complete" | "needs_review"; sampleCount?: number };

export type { Problem, ArchivedProblem, BundledProblem, TestCase };

const nat = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function folderName(folder: string) { return folder.split("/").pop() || folder; }
export function folderParent(folder: string) { return folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : ""; }
export function folderContains(folder: string, parent: string) { return folder === parent || folder.startsWith(`${parent}/`); }

function addFolderParents(target: Set<string>, folder: string) {
  const parts = folder.split("/").filter(Boolean);
  for (let index = 1; index <= parts.length; index += 1) target.add(parts.slice(0, index).join("/"));
}

const ROOT_BUILTIN = { id: "P1001", folder: "默认题库" };

function builtinLocations(overrides: Record<string, string>) {
  return [ROOT_BUILTIN, ...getAcwingCatalog()].map((problem) => ({
    id: problem.id,
    folder: overrides[problem.id] ?? problem.folder,
  }));
}

function localTreePaths(folders: string[], overrides: Record<string, string>) {
  const paths = new Set(folders);
  for (const problem of builtinLocations(overrides)) addFolderParents(paths, problem.folder);
  return Array.from(paths);
}

export function orderFolderTree(paths: string[], manualOrder: string[]) {
  const unique = Array.from(new Set(paths));
  const pathSet = new Set(unique);
  const rank = new Map(manualOrder.map((p, i) => [p, i]));
  const children = new Map<string, string[]>();
  for (const path of unique) {
    const candidate = folderParent(path);
    const parent = candidate && pathSet.has(candidate) ? candidate : "";
    children.set(parent, [...(children.get(parent) || []), path]);
  }
  const result: string[] = [];
  function visit(parent: string) {
    const siblings = children.get(parent) || [];
    siblings.sort((a, b) => {
      const ra = rank.get(a); const rb = rank.get(b);
      if (ra !== undefined || rb !== undefined) return (ra ?? Number.MAX_SAFE_INTEGER) - (rb ?? Number.MAX_SAFE_INTEGER);
      return nat.compare(folderName(a), folderName(b));
    });
    for (const s of siblings) { result.push(s); visit(s); }
  }
  visit("");
  return result;
}

// Load acwing catalog from public JSON
function getAcwingCatalog(): BundledProblem[] {
  return _acwingCatalog || [];
}

export async function loadAcwingCatalog() {
  if (_acwingLoadAttempted) return;
  _acwingLoadAttempted = true;
  try {
    const res = await fetch(CATALOG_INDEX_URL);
    // 索引题条目 samples 为空数组(仅元数据)，测试点打开做题时按需加载
    _acwingCatalog = res.ok ? (await res.json() as Array<Omit<BundledProblem, "samples"> & { sampleCount: number }>).map((item) => ({ ...item, samples: [] as TestCase[], sampleCount: item.sampleCount })) : [];
  } catch {
    _acwingCatalog = [];
  }
  // 异步加载完成后 bump 版本号，触发订阅了 catalogVersion 的组件重渲染
  useLibraryStore.getState().bumpCatalogVersion();
}

/**
 * 按需加载单题完整测试点(带内存缓存)。题库页只加载轻量索引，
 * 打开做题页时才拉取该题 /problems/<id>.json 的完整 samples。
 */
export async function loadBundledSamples(id: string): Promise<TestCase[]> {
  if (_bundledSampleCache.has(id)) return _bundledSampleCache.get(id)!;
  try {
    const res = await fetch(`/problems/${encodeURIComponent(id)}.json`);
    if (!res.ok) return [];
    const full = await res.json() as BundledProblem;
    const samples = Array.isArray(full.samples) ? full.samples : [];
    _bundledSampleCache.set(id, samples);
    return samples;
  } catch {
    return [];
  }
}

/** Test-only: reset the bundled catalog cache so fetch stubs take effect. */
export function __resetBundledCatalogForTests() {
  _acwingCatalog = null;
  _acwingLoadAttempted = false;
  _bundledSampleCache.clear();
}

export function getAcwingFolders(): string[] {
  const catalog = getAcwingCatalog();
  return Array.from(new Set(catalog.flatMap((p) => {
    const parts = p.folder.split("/");
    return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  })));
}

export function getAcwingProblems(): BundledProblem[] {
  return getAcwingCatalog();
}

function loadArchives(): ArchivedProblem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const saved = localStorage.getItem("codenow-problem-library") || localStorage.getItem("codeforge-problem-library");
    if (saved) {
      const data = JSON.parse(saved);
      return Array.isArray(data.archives) ? data.archives : [];
    }
  } catch { /* ignore */ }
  return [];
}

type LibraryStore = {
  archives: ArchivedProblem[];
  folders: string[];
  selectedFolder: string;
  collapsedFolders: string[];
  folderOrder: string[];
  includeSubfolders: boolean;
  librarySearch: string;
  libraryReady: boolean;
  cloudArchives: ArchivedProblem[];
  cloudFolderIds: Record<string, string>;
  hiddenBuiltins: string[];
  deletedArchives: ArchivedProblem[];
  deletedBuiltins: DeletedBuiltin[];
  builtinFolderOverrides: Record<string, string>;
  catalogVersion: number;

  setArchives: (archives: ArchivedProblem[]) => void;
  addArchive: (archive: ArchivedProblem) => void;
  removeArchive: (id: string) => void;
  restoreArchive: (id: string) => void;
  hideBuiltin: (id: string) => void;
  restoreBuiltin: (id: string) => void;
  purgeDeleted: () => void;
  updateArchive: (id: string, updater: (item: ArchivedProblem) => ArchivedProblem) => void;
  renameProblem: (oldId: string, newId: string) => void;
  materializeBuiltin: (problem: Problem, folder: string, newId: string) => void;
  syncProblemSamples: (problemId: string, samples: TestCase[]) => void;

  setFolders: (folders: string[]) => void;
  addFolder: (folder: string) => void;
  removeFolder: (folder: string) => void;
  dissolveFolder: (folder: string) => void;
  moveFolder: (source: string, destinationParent: string) => void;
  moveFolderInto: (source: string, target: string) => void;
  setSelectedFolder: (folder: string) => void;
  toggleCollapsed: (folder: string) => void;
  setFolderOrder: (order: string[]) => void;
  setIncludeSubfolders: (v: boolean) => void;
  setLibrarySearch: (s: string) => void;
  setLibraryReady: () => void;
  setCloudArchives: (archives: ArchivedProblem[]) => void;
  setCloudFolderIds: (folders: Record<string, string>) => void;
  bumpCatalogVersion: () => void;
};

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set) => ({
      archives: loadArchives(),
      folders: ["默认题库"],
      selectedFolder: "默认题库",
      collapsedFolders: [] as string[],
      folderOrder: [] as string[],
      includeSubfolders: true,
      librarySearch: "",
      libraryReady: false,
      cloudArchives: [],
      cloudFolderIds: {},
      hiddenBuiltins: [] as string[],
      deletedArchives: [] as ArchivedProblem[],
      deletedBuiltins: [] as DeletedBuiltin[],
      builtinFolderOverrides: {} as Record<string, string>,
      catalogVersion: 0,

      setArchives: (archives) => set({ archives }),
      addArchive: (archive) => set((s) => ({ archives: [archive, ...s.archives] })),
      removeArchive: (id) => set((s) => {
        const removed = s.archives.filter((a) => a.problem.id === id).map((a) => ({ ...a, deletedAt: new Date().toISOString() }));
        return removed.length ? { archives: s.archives.filter((a) => a.problem.id !== id), deletedArchives: [...removed, ...s.deletedArchives] } : s;
      }),
      restoreArchive: (id) => set((s) => {
        const restored = s.deletedArchives.find((a) => a.problem.id === id);
        return restored ? { deletedArchives: s.deletedArchives.filter((a) => a.problem.id !== id), archives: [{ ...restored, deletedAt: undefined }, ...s.archives] } : s;
      }),
      hideBuiltin: (id) => set((s) => s.hiddenBuiltins.includes(id)
        ? s
        : { hiddenBuiltins: [...s.hiddenBuiltins, id], deletedBuiltins: [{ id, deletedAt: new Date().toISOString() }, ...s.deletedBuiltins.filter((item) => item.id !== id)] }),
      restoreBuiltin: (id) => set((s) => ({ hiddenBuiltins: s.hiddenBuiltins.filter((item) => item !== id), deletedBuiltins: s.deletedBuiltins.filter((item) => item.id !== id) })),
      purgeDeleted: () => set((s) => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return {
          deletedArchives: s.deletedArchives.filter((item) => !item.deletedAt || new Date(item.deletedAt).getTime() > cutoff),
          // 到期后仍保持 hidden，表示内置题已经不可从回收站恢复。
          deletedBuiltins: s.deletedBuiltins.filter((item) => new Date(item.deletedAt).getTime() > cutoff),
        };
      }),
      updateArchive: (id, updater) => set((s) => ({ archives: s.archives.map((a) => a.problem.id === id ? updater(a) : a) })),
      renameProblem: (oldId, newId) => set((s) => ({
        archives: s.archives.map((a) => a.problem.id === oldId ? { ...a, problem: { ...a.problem, id: newId } } : a),
      })),
      // 内置题去特权：改题号即物化为普通归档副本，原内置条目隐藏
      materializeBuiltin: (problem, folder, newId) => set((s) => ({
        archives: [{ problem: { ...problem, id: newId }, folder, archivedAt: new Date().toISOString() }, ...s.archives],
        hiddenBuiltins: s.hiddenBuiltins.includes(problem.id) ? s.hiddenBuiltins : [...s.hiddenBuiltins, problem.id],
      })),

      setFolders: (folders) => set({ folders }),
      addFolder: (folder) => set((s) => ({ folders: [...s.folders, folder] })),
      moveFolder: (source, destinationParent) => set((s) => {
        const plan = planFolderMove(localTreePaths(s.folders, s.builtinFolderOverrides), source, destinationParent);
        if (!plan.ok) return s;
        const builtinFolderOverrides = { ...s.builtinFolderOverrides };
        for (const item of builtinLocations(s.builtinFolderOverrides)) {
          if (folderContains(item.folder, source)) builtinFolderOverrides[item.id] = plan.remap(item.folder);
        }
        return {
          folders: s.folders.map(plan.remap),
          collapsedFolders: s.collapsedFolders.map(plan.remap),
          folderOrder: s.folderOrder.map(plan.remap),
          archives: s.archives.map((archive) => ({ ...archive, folder: plan.remap(archive.folder) })),
          selectedFolder: plan.remap(s.selectedFolder),
          builtinFolderOverrides,
        };
      }),
      // 拖入成为子文件夹：整树路径与归档/折叠/排序/选中同步迁移
      moveFolderInto: (source, target) => set((s) => {
        const plan = planFolderMove(s.folders, source, target);
        if (!plan.ok) return s;
        return {
          folders: plan.nextPaths,
          collapsedFolders: s.collapsedFolders.map(plan.remap),
          folderOrder: s.folderOrder.map(plan.remap),
          archives: s.archives.map((archive) => ({ ...archive, folder: plan.remap(archive.folder) })),
          selectedFolder: plan.remap(s.selectedFolder),
        };
      }),
      dissolveFolder: (folder) => set((s) => {
        const plan = dissolveFolderLevel(localTreePaths(s.folders, s.builtinFolderOverrides), folder);
        const builtinFolderOverrides = { ...s.builtinFolderOverrides };
        for (const item of builtinLocations(s.builtinFolderOverrides)) {
          if (folderContains(item.folder, folder)) builtinFolderOverrides[item.id] = plan.remap(item.folder);
        }
        return {
          folders: s.folders.filter((path) => path !== folder).map(plan.remap).filter(Boolean),
          collapsedFolders: s.collapsedFolders.filter((path) => path !== folder).map(plan.remap).filter(Boolean),
          folderOrder: s.folderOrder.filter((path) => path !== folder).map(plan.remap).filter(Boolean),
          archives: s.archives.map((archive) => ({ ...archive, folder: plan.remap(archive.folder) })),
          selectedFolder: plan.remap(s.selectedFolder) || "全部题目",
          builtinFolderOverrides,
        };
      }),
      removeFolder: (folder) => set((s) => ({
        folders: s.folders.filter((f) => !folderContains(f, folder)),
        collapsedFolders: s.collapsedFolders.filter((f) => !folderContains(f, folder)),
        folderOrder: s.folderOrder.filter((f) => !folderContains(f, folder)),
        archives: s.archives.filter((archive) => !folderContains(archive.folder, folder)),
        deletedArchives: [...s.archives.filter((archive) => folderContains(archive.folder, folder)).map((archive) => ({ ...archive, deletedAt: new Date().toISOString() })), ...s.deletedArchives],
        hiddenBuiltins: Array.from(new Set([
          ...s.hiddenBuiltins,
          ...builtinLocations(s.builtinFolderOverrides).filter((item) => folderContains(item.folder, folder)).map((item) => item.id),
        ])),
        deletedBuiltins: [...builtinLocations(s.builtinFolderOverrides).filter((item) => folderContains(item.folder, folder)).map((item) => ({ id: item.id, deletedAt: new Date().toISOString() })), ...s.deletedBuiltins],
        selectedFolder: folderContains(s.selectedFolder, folder) ? folderParent(folder) || "全部题目" : s.selectedFolder,
      })),
      // Sync test cases back to the library archive when user modifies them in workspace
      syncProblemSamples: (problemId, samples) => set((s) => ({
        archives: s.archives.map((a) =>
          a.problem.id === problemId
            ? { ...a, problem: { ...a.problem, samples }, archivedAt: new Date().toISOString() }
            : a
        ),
      })),
      setSelectedFolder: (selectedFolder) => set({ selectedFolder }),
      toggleCollapsed: (folder) => set((s) => ({
        collapsedFolders: s.collapsedFolders.includes(folder)
          ? s.collapsedFolders.filter((f) => f !== folder)
          : [...s.collapsedFolders, folder],
      })),
      setFolderOrder: (folderOrder) => set({ folderOrder }),
      setIncludeSubfolders: (includeSubfolders) => set({ includeSubfolders }),
      setLibrarySearch: (librarySearch) => set({ librarySearch }),
      setLibraryReady: () => set({ libraryReady: true }),
      setCloudArchives: (cloudArchives) => set({ cloudArchives }),
      setCloudFolderIds: (cloudFolderIds) => set({ cloudFolderIds }),
      bumpCatalogVersion: () => set((s) => ({ catalogVersion: s.catalogVersion + 1 })),
    }),
    {
      name: "codenow-problem-library",
      partialize: (s) => ({
        archives: s.archives,
        folders: s.folders,
        selectedFolder: s.selectedFolder,
        collapsedFolders: s.collapsedFolders,
        folderOrder: s.folderOrder,
        includeSubfolders: s.includeSubfolders,
        hiddenBuiltins: s.hiddenBuiltins,
        deletedArchives: s.deletedArchives,
        deletedBuiltins: s.deletedBuiltins,
        builtinFolderOverrides: s.builtinFolderOverrides,
        libraryReady: true,
      }),
    },
  ),
);

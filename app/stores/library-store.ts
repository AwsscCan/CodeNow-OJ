"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Lazy-loaded bundled catalogs (AcWing 基础课 + 经典题库等静态题源)
let _acwingCatalog: BundledProblem[] | null = null;
let _acwingLoadAttempted = false;
const BUNDLED_CATALOG_URLS = ["/acwing-course.json", "/classic-problems.json", "/contest-problems.json"];

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
type ArchivedProblem = { problem: Problem; folder: string; archivedAt: string; cloudId?: string; version?: number };
type BundledProblem = Problem & { folder: string; sourceUrl: string; extractionStatus: "complete" | "needs_review" };

export type { Problem, ArchivedProblem, BundledProblem, TestCase };

const nat = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function folderName(folder: string) { return folder.split("/").pop() || folder; }
export function folderParent(folder: string) { return folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : ""; }
export function folderContains(folder: string, parent: string) { return folder === parent || folder.startsWith(`${parent}/`); }

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
  const results = await Promise.all(BUNDLED_CATALOG_URLS.map(async (url) => {
    try {
      const res = await fetch(url);
      return res.ok ? await res.json() as BundledProblem[] : [];
    } catch {
      return [];
    }
  }));
  _acwingCatalog = results.flat();
}

/** Test-only: reset the bundled catalog cache so fetch stubs take effect. */
export function __resetBundledCatalogForTests() {
  _acwingCatalog = null;
  _acwingLoadAttempted = false;
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

  setArchives: (archives: ArchivedProblem[]) => void;
  addArchive: (archive: ArchivedProblem) => void;
  removeArchive: (id: string) => void;
  updateArchive: (id: string, updater: (item: ArchivedProblem) => ArchivedProblem) => void;
  renameProblem: (oldId: string, newId: string) => void;
  materializeBuiltin: (problem: Problem, folder: string, newId: string) => void;
  syncProblemSamples: (problemId: string, samples: TestCase[]) => void;

  setFolders: (folders: string[]) => void;
  addFolder: (folder: string) => void;
  removeFolder: (folder: string) => void;
  moveFolderInto: (source: string, target: string) => void;
  setSelectedFolder: (folder: string) => void;
  toggleCollapsed: (folder: string) => void;
  setFolderOrder: (order: string[]) => void;
  setIncludeSubfolders: (v: boolean) => void;
  setLibrarySearch: (s: string) => void;
  setLibraryReady: () => void;
  setCloudArchives: (archives: ArchivedProblem[]) => void;
  setCloudFolderIds: (folders: Record<string, string>) => void;
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

      setArchives: (archives) => set({ archives }),
      addArchive: (archive) => set((s) => ({ archives: [archive, ...s.archives] })),
      removeArchive: (id) => set((s) => ({ archives: s.archives.filter((a) => a.problem.id !== id) })),
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
      // 拖入成为子文件夹：整树路径与归档/折叠/排序/选中同步迁移
      moveFolderInto: (source, target) => set((s) => {
        const name = folderName(source);
        const next = `${target}/${name}`;
        const remap = (path: string) => path === source ? next : path.startsWith(`${source}/`) ? `${next}${path.slice(source.length)}` : path;
        return {
          folders: s.folders.map(remap),
          collapsedFolders: s.collapsedFolders.map(remap),
          folderOrder: s.folderOrder.map(remap),
          archives: s.archives.map((a) => ({ ...a, folder: remap(a.folder) })),
          selectedFolder: remap(s.selectedFolder),
        };
      }),
      removeFolder: (folder) => set((s) => ({
        folders: s.folders.filter((f) => !folderContains(f, folder)),
        collapsedFolders: s.collapsedFolders.filter((f) => !folderContains(f, folder)),
        folderOrder: s.folderOrder.filter((f) => !folderContains(f, folder)),
        archives: s.archives.map((a) => folderContains(a.folder, folder) ? { ...a, folder: folderParent(folder) || "默认题库" } : a),
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
        libraryReady: true,
      }),
    },
  ),
);

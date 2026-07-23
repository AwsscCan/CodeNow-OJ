"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Lazy-loaded AcWing catalog reference
let _acwingCatalog: BundledProblem[] | null = null;
let _acwingLoadAttempted = false;

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
type ArchivedProblem = { problem: Problem; folder: string; archivedAt: string };
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
  try {
    const res = await fetch("/acwing-course.json");
    if (res.ok) _acwingCatalog = await res.json() as BundledProblem[];
  } catch {
    _acwingCatalog = [];
  }
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

  setArchives: (archives: ArchivedProblem[]) => void;
  addArchive: (archive: ArchivedProblem) => void;
  removeArchive: (id: string) => void;
  updateArchive: (id: string, updater: (item: ArchivedProblem) => ArchivedProblem) => void;
  renameProblem: (oldId: string, newId: string) => void;

  setFolders: (folders: string[]) => void;
  addFolder: (folder: string) => void;
  removeFolder: (folder: string) => void;
  setSelectedFolder: (folder: string) => void;
  toggleCollapsed: (folder: string) => void;
  setFolderOrder: (order: string[]) => void;
  setIncludeSubfolders: (v: boolean) => void;
  setLibrarySearch: (s: string) => void;
  setLibraryReady: () => void;
};

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      archives: loadArchives(),
      folders: ["默认题库"],
      selectedFolder: "默认题库",
      collapsedFolders: [] as string[],
      folderOrder: [] as string[],
      includeSubfolders: true,
      librarySearch: "",
      libraryReady: false,

      setArchives: (archives) => set({ archives }),
      addArchive: (archive) => set((s) => ({ archives: [archive, ...s.archives] })),
      removeArchive: (id) => set((s) => ({ archives: s.archives.filter((a) => a.problem.id !== id) })),
      updateArchive: (id, updater) => set((s) => ({ archives: s.archives.map((a) => a.problem.id === id ? updater(a) : a) })),
      renameProblem: (oldId, newId) => set((s) => ({
        archives: s.archives.map((a) => a.problem.id === oldId ? { ...a, problem: { ...a.problem, id: newId } } : a),
      })),

      setFolders: (folders) => set({ folders }),
      addFolder: (folder) => set((s) => ({ folders: [...s.folders, folder] })),
      removeFolder: (folder) => set((s) => ({
        folders: s.folders.filter((f) => !folderContains(f, folder)),
        collapsedFolders: s.collapsedFolders.filter((f) => !folderContains(f, folder)),
        folderOrder: s.folderOrder.filter((f) => !folderContains(f, folder)),
        archives: s.archives.map((a) => folderContains(a.folder, folder) ? { ...a, folder: folderParent(folder) || "默认题库" } : a),
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
        libraryReady: true,
      }),
    },
  ),
);

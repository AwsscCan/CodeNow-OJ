/* CodeNow OJ · 用户记忆池(习惯与错误沉淀，反哺 AI 对话与桌宠台词) · Bamzc */

"use client";

import { useLayoutEffect } from "react";
import { create, type StoreApi } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authClient } from "../lib/auth-client";
import type { Result } from "./problem-store";

/** 记忆池容量上限：新推断条目超限时拒绝写入，不淘汰历史 */
export const MEMORY_LIMIT = 40;

export type MemoryKind = "mistake" | "habit";
export type RiskKind = "boundary" | "overflow" | "complexity" | "compile" | "runtime" | "output" | "statement";
export type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  text: string;
  count: number;
  updatedAt: string;
  pinned?: boolean;
  muted?: boolean;
  risk?: RiskKind;
  capacityManaged?: true;
};
export type MemoryScope = { accountId: string | null; sessionId: string };

const RISK_PATTERNS: Array<{ kind: RiskKind; pattern: RegExp }> = [
  { kind: "overflow", pattern: /溢出|\b(?:overflow|int64|long long)\b/i },
  { kind: "compile", pattern: /编译|语法|\b(?:ce|compile|compiler|syntax)\b/i },
  { kind: "runtime", pattern: /运行(?:时)?(?:错误|崩溃)|崩溃|越界|\b(?:re|runtime|crash|segmentation fault|out of bounds|index out of range)\b/i },
  { kind: "complexity", pattern: /复杂度|超时|太慢|优化|\b(?:tle|complexity|time limit|too slow)\b|O\([^)]*\)/i },
  { kind: "output", pattern: /输出|格式|空格|换行|\b(?:output|format|formatting|whitespace)\b/i },
  { kind: "statement", pattern: /题意|题目|题干|读题|理解(?:错误|题意)?|\b(?:statement|misread|misunderstood|read the problem)\b/i },
  { kind: "boundary", pattern: /边界|特殊情况|极端|\b(?:boundary|corner case|edge case|off[- ]?by[- ]?one)\b/i },
];

export function classifyRiskMemory(text: string): RiskKind | null {
  return RISK_PATTERNS.find(({ pattern }) => pattern.test(text))?.kind ?? null;
}

function hasManagedCapacity(memories: MemoryEntry[]) {
  return memories.filter((memory) => memory.capacityManaged).length < MEMORY_LIMIT;
}

const MEMORY_STORAGE_KEY = "codenow-user-memory";
const ANONYMOUS_MEMORY_SCOPE: MemoryScope = { accountId: null, sessionId: "anonymous" };
const UNRESOLVED_MEMORY_SCOPE: MemoryScope = { accountId: null, sessionId: "unresolved" };

type PersistedMemoryState = {
  memories: MemoryEntry[];
  memoryStorageKey: string;
};

function memoryStorageKey(scope: MemoryScope) {
  if (scope.sessionId === "unresolved") return "unresolved";
  if (scope.accountId) return `account:${encodeURIComponent(scope.accountId)}`;
  return "anonymous";
}

function memoryStorageName(scope: MemoryScope) {
  return `${MEMORY_STORAGE_KEY}:${memoryStorageKey(scope)}`;
}

function sameMemoryScope(left: MemoryScope, right: MemoryScope) {
  return left.accountId === right.accountId && left.sessionId === right.sessionId;
}

const hydratingMemoryStorageNames = new Map<string, number>();

function beginMemoryStorageHydration(...names: string[]) {
  for (const name of new Set(names)) {
    hydratingMemoryStorageNames.set(name, (hydratingMemoryStorageNames.get(name) ?? 0) + 1);
  }
}

function endMemoryStorageHydration(...names: string[]) {
  for (const name of new Set(names)) {
    const count = hydratingMemoryStorageNames.get(name);
    if (!count || count === 1) hydratingMemoryStorageNames.delete(name);
    else hydratingMemoryStorageNames.set(name, count - 1);
  }
}

function isMemoryStorageHydrating(name: string) {
  return (hydratingMemoryStorageNames.get(name) ?? 0) > 0;
}

const memoryStorage = createJSONStorage<PersistedMemoryState>(() => ({
  getItem: (name) => {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(name);
    if (stored !== null || name !== memoryStorageName({ accountId: null, sessionId: "anonymous" })) return stored;
    return localStorage.getItem(MEMORY_STORAGE_KEY);
  },
  setItem: (name, value) => {
    if (typeof localStorage === "undefined" || isMemoryStorageHydrating(name)) return;
    localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(name);
  },
}));

type MemoryStore = {
  memories: MemoryEntry[];
  memoryScope: MemoryScope;
  memoryScopeGeneration: number;
  memoryStorageKey: string;
  memoryScopeHydrated: boolean;
  memoryScopeHydrating: boolean;
  memoryMutationVersion: number;
  memoryHydrationStartMutationVersion: number;
  remember: (kind: MemoryKind, text: string) => boolean;
  deleteMemory: (id: string) => void;
  togglePinned: (id: string) => void;
  toggleMuted: (id: string) => void;
  switchMemoryScope: (scope: MemoryScope, forceHydration?: boolean) => Promise<void>;
  recentMemories: (limit: number) => string[];
  forgetProblemMistakes: (problemId: string) => void;
  clearMemories: () => void;
};

type MemoryActions = Pick<MemoryStore,
  "remember" | "deleteMemory" | "togglePinned" | "toggleMuted" | "switchMemoryScope" | "recentMemories" | "forgetProblemMistakes" | "clearMemories"
>;
type MemorySet = StoreApi<MemoryStore>["setState"];
type MemoryGet = StoreApi<MemoryStore>["getState"];

type AuthSessionState = ReturnType<typeof authClient.useSession>;
type AuthClientWithStore = {
  $store?: {
    atoms?: {
      session?: {
        lc?: number;
        get?: () => AuthSessionState;
        listen?: (listener: (session: AuthSessionState) => void) => () => void;
      };
    };
  };
};

let stopSessionScopeSync: (() => void) | undefined;

function syncMemoryScopeFromSession(session: AuthSessionState) {
  const scope = sessionMemoryScope(session);
  const state = memoryStore.getState();
  const needsHydration = scope.sessionId !== "unresolved" && !state.memoryScopeHydrated && !state.memoryScopeHydrating;
  if (!sameMemoryScope(state.memoryScope, scope) || needsHydration) void state.switchMemoryScope(scope, true);
}

function watchSessionScopeChanges() {
  if (stopSessionScopeSync) return;
  const sessionAtom = (authClient as unknown as AuthClientWithStore).$store?.atoms?.session;
  if (!sessionAtom?.listen) return;
  stopSessionScopeSync = sessionAtom.listen(syncMemoryScopeFromSession);
}

function knownMemoryScopeFromSession() {
  const sessionAtom = (authClient as unknown as AuthClientWithStore).$store?.atoms?.session;
  if (!sessionAtom?.get) return null;

  const session = sessionAtom.get();
  if (!session || session.isPending) {
    const observed = typeof sessionAtom.lc === "number" ? sessionAtom.lc > 0 : true;
    return observed ? UNRESOLVED_MEMORY_SCOPE : null;
  }

  watchSessionScopeChanges();
  return sessionMemoryScope(session);
}

function resolveMemoryActionState(generation: number, get: MemoryGet) {
  const current = get();
  if (current.memoryScopeGeneration !== generation) return null;

  const knownScope = knownMemoryScopeFromSession();
  const targetScope = knownScope ?? current.memoryScope;
  const needsHydration = targetScope.sessionId !== "unresolved" && !current.memoryScopeHydrated && !current.memoryScopeHydrating;
  if (!sameMemoryScope(current.memoryScope, targetScope) || needsHydration) {
    void current.switchMemoryScope(targetScope, true);
    return get();
  }
  return current;
}

function mergeMemoryEntries(persisted: MemoryEntry[], current: MemoryEntry[]) {
  const memories = [...persisted];
  const indexesById = new Map(memories.map((memory, index) => [memory.id, index]));
  const indexesByText = new Map(memories.map((memory, index) => [memory.text, index]));

  for (const memory of current) {
    const index = indexesById.get(memory.id) ?? indexesByText.get(memory.text);
    if (index === undefined) {
      indexesById.set(memory.id, memories.length);
      indexesByText.set(memory.text, memories.length);
      memories.push(memory);
      continue;
    }

    const stored = memories[index];
    memories[index] = {
      ...stored,
      ...memory,
      id: stored.id,
      count: stored.count + memory.count,
      updatedAt: stored.updatedAt > memory.updatedAt ? stored.updatedAt : memory.updatedAt,
    };
    indexesById.set(memory.id, index);
    indexesByText.set(memory.text, index);
  }

  return memories;
}

function createMemoryActions(generation: number, set: MemorySet, get: MemoryGet): MemoryActions {
  const isCurrentGeneration = () => get().memoryScopeGeneration === generation;

  return {
    remember: (kind, text) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const current = resolveMemoryActionState(generation, get);
      if (!current || current.memoryScope.sessionId === "unresolved") return false;
      if (current.memoryScopeGeneration !== generation) return current.remember(kind, text);

      const memories = current.memories;
      const existingIndex = memories.findIndex((memory) => memory.text === trimmed);
      const existing = existingIndex === -1 ? undefined : memories[existingIndex];
      if (!existing && !hasManagedCapacity(memories)) return false;
      const risk = classifyRiskMemory(trimmed) ?? existing?.risk;
      set((state) => {
        if (state.memoryScopeGeneration !== generation) return state;
        const entry: MemoryEntry = existing
          ? { ...existing, count: existing.count + 1, updatedAt: new Date().toISOString(), ...(risk ? { risk } : {}) }
          : { id: crypto.randomUUID(), kind, text: trimmed, count: 1, updatedAt: new Date().toISOString(), capacityManaged: true, ...(risk ? { risk } : {}) };
        return {
          memories: existing
            ? [...state.memories.slice(0, existingIndex), ...state.memories.slice(existingIndex + 1), entry]
            : [...state.memories, entry],
          memoryMutationVersion: state.memoryMutationVersion + 1,
        };
      });
      return true;
    },
    deleteMemory: (id) => {
      const current = resolveMemoryActionState(generation, get);
      if (!current || current.memoryScope.sessionId === "unresolved") return;
      if (current.memoryScopeGeneration !== generation) {
        current.deleteMemory(id);
        return;
      }
      set((state) => state.memoryScopeGeneration === generation ? {
        memories: state.memories.filter((memory) => memory.id !== id),
        memoryMutationVersion: state.memoryMutationVersion + 1,
      } : state);
    },
    togglePinned: (id) => {
      const current = resolveMemoryActionState(generation, get);
      if (!current || current.memoryScope.sessionId === "unresolved") return;
      if (current.memoryScopeGeneration !== generation) {
        current.togglePinned(id);
        return;
      }
      set((state) => state.memoryScopeGeneration === generation ? {
        memories: state.memories.map((memory) => memory.id === id ? { ...memory, pinned: !memory.pinned } : memory),
        memoryMutationVersion: state.memoryMutationVersion + 1,
      } : state);
    },
    toggleMuted: (id) => {
      const current = resolveMemoryActionState(generation, get);
      if (!current || current.memoryScope.sessionId === "unresolved") return;
      if (current.memoryScopeGeneration !== generation) {
        current.toggleMuted(id);
        return;
      }
      set((state) => state.memoryScopeGeneration === generation ? {
        memories: state.memories.map((memory) => memory.id === id ? { ...memory, muted: !memory.muted } : memory),
        memoryMutationVersion: state.memoryMutationVersion + 1,
      } : state);
    },
    switchMemoryScope: async (scope, forceHydration = false) => {
      const current = get();
      const needsHydration = forceHydration && scope.sessionId !== "unresolved" && !current.memoryScopeHydrated && !current.memoryScopeHydrating;
      if (!isCurrentGeneration() || (sameMemoryScope(current.memoryScope, scope) && !needsHydration)) return;

      const previousName = memoryStore.persist.getOptions().name ?? memoryStorageName(current.memoryScope);
      const nextName = memoryStorageName(scope);
      const nextGeneration = generation + 1;
      const shouldHydrate = scope.sessionId !== "unresolved";
      const hydrationStartMutationVersion = current.memoryMutationVersion;
      beginMemoryStorageHydration(previousName, nextName);
      memoryStore.persist.setOptions({ name: nextName });
      set({
        memories: [],
        memoryScope: scope,
        memoryScopeGeneration: nextGeneration,
        memoryStorageKey: memoryStorageKey(scope),
        memoryScopeHydrated: false,
        memoryScopeHydrating: shouldHydrate,
        memoryHydrationStartMutationVersion: hydrationStartMutationVersion,
        ...createMemoryActions(nextGeneration, set, get),
      });

      if (!shouldHydrate) {
        endMemoryStorageHydration(previousName, nextName);
        return;
      }

      try {
        await memoryStore.persist.rehydrate();
      } finally {
        const active = get();
        const isActiveHydration = active.memoryScopeGeneration === nextGeneration;
        const shouldWriteBack = isActiveHydration && active.memoryMutationVersion > hydrationStartMutationVersion;
        if (isActiveHydration) {
          set((state) => state.memoryScopeGeneration === nextGeneration ? {
            memoryScopeHydrated: true,
            memoryScopeHydrating: false,
            memoryHydrationStartMutationVersion: state.memoryMutationVersion,
          } : state);
        }
        endMemoryStorageHydration(previousName, nextName);
        if (shouldWriteBack) {
          set((state) => state.memoryScopeGeneration === nextGeneration ? { memories: state.memories } : state);
        }
      }
    },
    recentMemories: (limit) => {
      const current = resolveMemoryActionState(generation, get);
      if (!current || current.memoryScope.sessionId === "unresolved") return [];
      if (current.memoryScopeGeneration !== generation) return current.recentMemories(limit);
      return current.memories
        .filter((memory) => !memory.muted)
        .slice(-Math.max(0, limit))
        .map((memory) => (memory.count > 1 ? `${memory.text}（已出现 ${memory.count} 次）` : memory.text));
    },
    forgetProblemMistakes: (problemId) => {
      const current = resolveMemoryActionState(generation, get);
      if (!current || current.memoryScope.sessionId === "unresolved") return;
      if (current.memoryScopeGeneration !== generation) {
        current.forgetProblemMistakes(problemId);
        return;
      }
      set((state) => state.memoryScopeGeneration === generation ? {
        memories: state.memories.filter((memory) => !(memory.kind === "mistake" && memory.text.includes(`「${problemId} `))),
        memoryMutationVersion: state.memoryMutationVersion + 1,
      } : state);
    },
    clearMemories: () => {
      const current = resolveMemoryActionState(generation, get);
      if (!current || current.memoryScope.sessionId === "unresolved") return;
      if (current.memoryScopeGeneration !== generation) {
        current.clearMemories();
        return;
      }
      set((state) => state.memoryScopeGeneration === generation ? {
        memories: [],
        memoryMutationVersion: state.memoryMutationVersion + 1,
      } : state);
    },
  };
}

/**
 * 从一次判题结果沉淀错误记忆：只记失败(全 AC 不立传)。
 * 文案保持事实性，供 AI 自然引用。
 */
export function distillJudgeMemory(problem: { id: string; title: string }, results: Result[]): { kind: MemoryKind; text: string } | null {
  if (!results.length) return null;
  const passed = results.filter((r) => r.status === "AC").length;
  const label = `「${problem.id} ${problem.title}」`;
  if (results.some((r) => r.status === "CE")) return { kind: "mistake", text: `在${label}编译失败过，语法细节容易疏忽` };
  if (passed === results.length) return null;
  if (results.some((r) => r.status === "TLE")) return { kind: "mistake", text: `在${label}超时过，倾向先写暴力解法` };
  if (results.some((r) => r.status === "RE")) return { kind: "mistake", text: `在${label}运行崩溃过，数组越界/边界防护是弱点` };
  const firstFailed = results.findIndex((r) => r.status !== "AC");
  return { kind: "mistake", text: `在${label}WA 过(${passed}/${results.length})，第 ${firstFailed + 1} 个点先挂` };
}

const QUESTION_PATTERNS: Array<{ pattern: RegExp; text: string }> = [
  { pattern: /边界|corner|特殊情况|极端/, text: "常在边界情况上没把握，提问多与边界有关" },
  { pattern: /超时|TLE|复杂度|太慢|优化/i, text: "常被复杂度与超时困扰" },
  { pattern: /思路|怎么做|怎么想|入手|无从下手/, text: "习惯先问整体思路再动手" },
  { pattern: /报错|编译|error|CE/i, text: "常被编译报错卡住" },
  { pattern: /看不懂|不理解|什么意思|读不懂/, text: "偏好把题意掰开揉碎地讲" },
];

/** 从一条用户提问沉淀提问习惯，无可识别模式时返回 null */
export function distillQuestionMemory(question: string): { kind: MemoryKind; text: string } | null {
  const hit = QUESTION_PATTERNS.find((p) => p.pattern.test(question));
  return hit ? { kind: "habit", text: hit.text } : null;
}

const memoryStore = create<MemoryStore>()(
  persist(
    (set, get) => ({
      memories: [],
      memoryScope: ANONYMOUS_MEMORY_SCOPE,
      memoryScopeGeneration: 0,
      memoryStorageKey: memoryStorageKey(ANONYMOUS_MEMORY_SCOPE),
      memoryScopeHydrated: false,
      memoryScopeHydrating: false,
      memoryMutationVersion: 0,
      memoryHydrationStartMutationVersion: 0,
      ...createMemoryActions(0, set, get),
    }),
    {
      name: memoryStorageName(ANONYMOUS_MEMORY_SCOPE),
      storage: memoryStorage,
      skipHydration: true,
      partialize: (s): PersistedMemoryState => ({ memories: s.memories, memoryStorageKey: s.memoryStorageKey }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedMemoryState>;
        const acceptsLegacyAnonymous = currentState.memoryStorageKey === "anonymous" && persisted.memoryStorageKey === undefined;
        if ((persisted.memoryStorageKey !== currentState.memoryStorageKey && !acceptsLegacyAnonymous) || !Array.isArray(persisted.memories)) {
          return currentState;
        }
        const preserveLiveMemories = currentState.memoryScopeHydrating
          && currentState.memoryMutationVersion > currentState.memoryHydrationStartMutationVersion;
        return {
          ...currentState,
          memories: preserveLiveMemories ? mergeMemoryEntries(persisted.memories, currentState.memories) : persisted.memories,
        };
      },
    },
  ),
);

function sessionMemoryScope(session: ReturnType<typeof authClient.useSession>): MemoryScope {
  if (session.isPending) return UNRESOLVED_MEMORY_SCOPE;
  const accountId = session.data?.user.id ?? null;
  const sessionId = session.data?.session.id;
  if (accountId) return { accountId, sessionId: typeof sessionId === "string" ? sessionId : `account:${accountId}` };
  return { accountId: null, sessionId: typeof sessionId === "string" ? sessionId : "anonymous" };
}

function useScopedMemoryStore<T = MemoryStore>(selector: (state: MemoryStore) => T = ((state) => state as T)) {
  const session = authClient.useSession();
  const expectedScope = sessionMemoryScope(session);
  const expectedAccountId = expectedScope.accountId;
  const expectedSessionId = expectedScope.sessionId;
  const selected = memoryStore(selector);
  const current = memoryStore.getState();
  const scopeMatches = sameMemoryScope(current.memoryScope, expectedScope);

  useLayoutEffect(() => {
    const state = memoryStore.getState();
    const scope = { accountId: expectedAccountId, sessionId: expectedSessionId };
    const needsHydration = scope.sessionId !== "unresolved" && !state.memoryScopeHydrated && !state.memoryScopeHydrating;
    if (!sameMemoryScope(state.memoryScope, scope) || needsHydration) void state.switchMemoryScope(scope, true);
  }, [expectedAccountId, expectedSessionId]);

  if (!scopeMatches) return selector({ ...current, memories: [], memoryScope: expectedScope });
  return selected;
}

export const useMemoryStore = Object.assign(useScopedMemoryStore, memoryStore);

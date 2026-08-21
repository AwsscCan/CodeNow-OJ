// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryStore } from "../../app/stores/memory-store";

const authState = vi.hoisted(() => {
  const listeners = new Set<(value: unknown) => void>();
  const state = {
    active: false,
    current: { data: null as { user: { id: string }; session: { id: string } } | null, isPending: true },
    update(next: { data: { user: { id: string }; session: { id: string } } | null; isPending: boolean }) {
      state.current = next;
      for (const listener of listeners) listener(next);
    },
    listen(listener: (value: unknown) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return state;
});

vi.mock("../../app/lib/auth-client", () => ({
  authClient: {
    useSession: () => authState.current,
    $store: { atoms: { session: {
      get: () => authState.current,
      get lc() { return authState.active ? 1 : 0; },
      listen: authState.listen,
    } } },
  },
}));

function ScopeProbe() {
  const scope = useMemoryStore((store) => store.memoryScope);
  const memories = useMemoryStore((store) => store.memories);
  return createElement("output", { "data-testid": "memory-scope" }, JSON.stringify({ scope, memories: memories.map((memory) => memory.text) }));
}

function persistedMemory(text: string) {
  return JSON.stringify({ state: {
    memories: [{ id: text, kind: "habit", text, count: 1, updatedAt: "2020-01-01" }],
    memoryStorageKey: "account:user-a",
  }, version: 0 });
}

beforeEach(() => {
  localStorage.clear();
  authState.active = false;
  authState.current = { data: null, isPending: true };
  useMemoryStore.setState({ memories: [], memoryScope: { accountId: null, sessionId: "unresolved" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("memory store session boundary", () => {
  it("keeps an observed pending session unresolved", () => {
    const legacy = JSON.stringify({ state: { memories: [{ id: "legacy", kind: "habit", text: "guest memory", count: 1, updatedAt: "2020-01-01" }] }, version: 0 });
    localStorage.setItem("codenow-user-memory", legacy);
    authState.active = true;
    useMemoryStore.setState({ memories: [], memoryScope: { accountId: null, sessionId: "anonymous" }, memoryStorageKey: "anonymous" });

    const store = useMemoryStore.getState();
    expect(store.remember("habit", "must wait for auth")).toBe(false);
    expect(useMemoryStore.getState().memoryScope).toEqual({ accountId: null, sessionId: "unresolved" });
    expect(localStorage.getItem("codenow-user-memory")).toBe(legacy);
  });

  it("switches the hook view from A to B without exposing A memory during the transition", async () => {
    localStorage.setItem("codenow-user-memory:account:user-a", persistedMemory("only A"));
    localStorage.setItem("codenow-user-memory:account:user-b", JSON.stringify({ state: {
      memories: [{ id: "only-b", kind: "habit", text: "only B", count: 1, updatedAt: "2020-01-01" }],
      memoryStorageKey: "account:user-b",
    }, version: 0 }));
    authState.current = { data: { user: { id: "user-a" }, session: { id: "session-a" } }, isPending: false };

    const view = render(createElement(ScopeProbe));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("memory-scope").textContent || "{}")).toMatchObject({
      scope: { accountId: "user-a", sessionId: "session-a" }, memories: ["only A"],
    }));

    authState.current = { data: { user: { id: "user-b" }, session: { id: "session-b" } }, isPending: false };
    view.rerender(createElement(ScopeProbe));

    expect(JSON.parse(screen.getByTestId("memory-scope").textContent || "{}").memories).not.toContain("only A");
    await waitFor(() => expect(JSON.parse(screen.getByTestId("memory-scope").textContent || "{}")).toMatchObject({
      scope: { accountId: "user-b", sessionId: "session-b" }, memories: ["only B"],
    }));
  });

  it("routes direct writes to the resolved account without carrying A memory into B", async () => {
    authState.current = { data: { user: { id: "user-a" }, session: { id: "session-a" } }, isPending: false };
    const store = () => useMemoryStore.getState();

    expect(store().remember("habit", "only A")).toBe(true);
    await waitFor(() => expect(store().memoryScope).toMatchObject({ accountId: "user-a", sessionId: "session-a" }));
    expect(store().memories.map((memory) => memory.text)).toEqual(["only A"]);

    authState.current = { data: { user: { id: "user-b" }, session: { id: "session-b" } }, isPending: false };
    expect(store().remember("habit", "only B")).toBe(true);
    await waitFor(() => expect(store().memoryScope).toMatchObject({ accountId: "user-b", sessionId: "session-b" }));

    expect(store().memories.map((memory) => memory.text)).toEqual(["only B"]);
    expect(localStorage.getItem("codenow-user-memory:account:user-a")).toContain("only A");
    expect(localStorage.getItem("codenow-user-memory:account:user-b")).toContain("only B");
  });

  it("rejects an A action captured before the session switches to B", async () => {
    authState.current = { data: { user: { id: "user-a" }, session: { id: "session-a" } }, isPending: false };
    const store = () => useMemoryStore.getState();

    expect(store().remember("habit", "only A")).toBe(true);
    const staleRemember = store().remember;

    authState.update({ data: { user: { id: "user-b" }, session: { id: "session-b" } }, isPending: false });
    await waitFor(() => expect(store().memoryScope).toMatchObject({ accountId: "user-b", sessionId: "session-b" }));

    expect(staleRemember("habit", "stale A write")).toBe(false);
    expect(store().memories).toEqual([]);
    expect(localStorage.getItem("codenow-user-memory:account:user-b") ?? "").not.toContain("stale A write");
  });

  it("clears the active scope when a watched session becomes pending", async () => {
    authState.current = { data: { user: { id: "user-a" }, session: { id: "session-a" } }, isPending: false };
    const store = () => useMemoryStore.getState();

    expect(store().remember("habit", "only A")).toBe(true);
    await waitFor(() => expect(store().memoryScope).toMatchObject({ accountId: "user-a", sessionId: "session-a" }));

    authState.update({ data: null, isPending: true });

    await waitFor(() => expect(store()).toMatchObject({
      memoryScope: { accountId: null, sessionId: "unresolved" },
      memories: [],
    }));
    expect(store().remember("habit", "must wait for auth")).toBe(false);
    expect(localStorage.getItem("codenow-user-memory:account:user-a")).toContain("only A");
  });
});
